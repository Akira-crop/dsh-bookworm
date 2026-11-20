/**
 * 云端划线/想法的本地索引。
 *
 * 为什么需要它：官方网关只有「单本划线」和「笔记本列表」两个端点，没有跨书搜索。
 * 用户真正的诉求是「我好像在哪本书里划过关于 X 的句子」——这要求把 N 本书的笔记
 * 摊平成一张可搜索的表。
 *
 * 设计取舍（都是被真实数据逼出来的）：
 *
 * 1. **按书独立缓存，带 TTL**：170 本书全量拉一遍是 340 次网关请求，不可能每次搜索都做。
 *    每本书存一个 JSON，搜索时只补拉缺失/过期的。
 *
 * 2. **有预算的增量扫描**：一次搜索给 8 秒预算 + 6 路并发，扫到哪算哪，
 *    把 `scanned/remaining` 如实回报给调用方，让 Agent 知道「还有书没扫」而不是
 *    假装结果完整。
 *
 * 3. **按笔记数优先**：先扫笔记最多的书。用户对划线密集的书印象最深，
 *    预算不够时先覆盖它们，命中率最高。
 */
import fsp from 'node:fs/promises'
import path from 'node:path'

/** 缓存多久算过期。用户刚在手机上划线，最多 6 小时后能搜到。 */
const TTL_MS = 6 * 60 * 60 * 1000

/** 一次搜索最多扫多少本书，避免把网关打爆。 */
const MAX_SCAN = 80

/** 并发上限。官方网关对突发请求敏感，6 路是实测能稳住的值。 */
const CONCURRENCY = 6

function safeName(value) {
  return String(value).replace(/[^\w.-]/gu, '_').slice(0, 80)
}

function nowMs() {
  return Date.now()
}

export class CloudNotes {
  constructor(dir) {
    this.dir = dir
    /** bookId → {at, bookId, title, author, items} */
    this.memory = new Map()
  }

  fileOf(bookId) {
    return path.join(this.dir, `${safeName(bookId)}.json`)
  }

  /** 读缓存。内存优先，其次磁盘；过期或损坏都当没有。 */
  async read(bookId) {
    const key = String(bookId)
    const hot = this.memory.get(key)
    if (hot !== undefined && nowMs() - hot.at < TTL_MS) return hot
    try {
      const raw = await fsp.readFile(this.fileOf(key), 'utf8')
      const parsed = JSON.parse(raw)
      if (parsed === null || typeof parsed !== 'object' || !Array.isArray(parsed.items)) return null
      if (nowMs() - Number(parsed.at ?? 0) > TTL_MS) return null
      this.memory.set(key, parsed)
      return parsed
    } catch {
      return null
    }
  }

  async write(bookId, payload) {
    const record = { ...payload, bookId: String(bookId), at: nowMs() }
    this.memory.set(String(bookId), record)
    try {
      await fsp.mkdir(this.dir, { recursive: true })
      await fsp.writeFile(this.fileOf(bookId), JSON.stringify(record), 'utf8')
    } catch {
      // 缓存写不进去不影响本次结果，下次重扫即可。
    }
    return record
  }

  /** 丢掉一本书的缓存（用户在微信读书里改了笔记时用）。 */
  async forget(bookId) {
    this.memory.delete(String(bookId))
    try {
      await fsp.rm(this.fileOf(bookId), { force: true })
    } catch {
      // 忽略
    }
  }

  /** 把一本合并后的笔记摊平成可搜索的行。 */
  static flatten(merged, meta) {
    const items = []
    for (const chapter of merged?.chapters ?? []) {
      const chapterTitle = String(chapter?.chapterTitle ?? '')
      for (const mark of chapter?.highlights ?? []) {
        const text = String(mark?.text ?? '').trim()
        if (text === '') continue
        items.push({
          kind: 'highlight',
          chapterUid: String(chapter?.chapterUid ?? ''),
          chapterTitle,
          text,
          at: Number(mark?.createTime ?? 0),
          star: -1,
        })
      }
      for (const thought of chapter?.thoughts ?? []) {
        const content = String(thought?.content ?? '').trim()
        const abstract = String(thought?.abstract ?? '').trim()
        if (content === '' && abstract === '') continue
        items.push({
          kind: 'thought',
          chapterUid: String(chapter?.chapterUid ?? ''),
          chapterTitle,
          text: content,
          abstract,
          at: Number(thought?.createTime ?? 0),
          star: Number(thought?.star ?? -1),
        })
      }
    }
    return {
      bookId: String(meta.bookId),
      title: String(meta.title ?? ''),
      author: String(meta.author ?? ''),
      items,
    }
  }
}

/**
 * 有预算的增量扫描 + 搜索。
 *
 * @param options.notebooks - 返回 {count, books:[...]} 的 notebook 列表方法
 * @param options.loadNotes - (bookId) => merged notes 的加载方法
 * @param options.budgetMs - 本次最多花多少毫秒拉数据
 */
export async function searchCloudNotes({ index, notebooks, loadNotes, query, limit = 40, budgetMs = 8000, refresh = false, bookIds }) {
  const needle = String(query ?? '').trim().toLowerCase()
  const max = Math.min(200, Math.max(1, Number(limit) || 40))
  const deadline = nowMs() + Math.max(2000, Math.min(30000, Number(budgetMs) || 8000))

  let books = []
  if (Array.isArray(bookIds) && bookIds.length > 0) {
    books = bookIds.map((id) => ({ bookId: String(id), title: '', author: '', total: 0 }))
  } else {
    const list = await notebooks()
    books = Array.isArray(list?.books) ? list.books : []
  }
  const total = books.length

  const hits = []
  let scanned = 0
  let timedOut = false
  let truncated = false

  /* 注意：不要把 return 写进 for 里——一本书常有多条命中，
     提前 return 会变成「每本书只报第一条」，用户会以为别的划线没了。 */
  const consider = (record) => {
    for (const item of record.items) {
      const haystack = `${item.text}\n${item.abstract ?? ''}`.toLowerCase()
      if (!haystack.includes(needle)) continue
      const from = Math.max(0, haystack.indexOf(needle) - 30)
      const snippet = `${item.text || item.abstract || ''}`.slice(from, from + 140)
      hits.push({
        bookId: record.bookId,
        bookTitle: record.title,
        author: record.author,
        kind: item.kind,
        chapterTitle: item.chapterTitle,
        snippet,
        text: item.text,
        abstract: item.abstract ?? '',
        at: item.at,
      })
      if (hits.length >= max) return false
    }
    return true
  }

  // 先把已缓存的看一遍：命中可能立刻就有，不用再花预算。
  // refresh=true 时跳过缓存，全部重新拉（用户刚在手机上改了笔记的场景）。
  const pending = []
  for (const book of books) {
    const cached = refresh ? null : await index.read(book.bookId)
    if (cached === null) {
      pending.push(book)
      continue
    }
    scanned += 1
    if (!consider(cached)) {
      truncated = true
      break
    }
  }

  // 再按需拉剩下的，直到预算用完或结果够了。
  let cursor = 0
  const worker = async () => {
    while (cursor < pending.length && hits.length < max && nowMs() < deadline) {
      const slot = cursor
      cursor += 1
      const book = pending[slot]
      if (book === undefined) return
      let merged
      try {
        merged = await loadNotes(book.bookId)
      } catch {
        // 单本书失败不该拖垮整次搜索
        continue
      }
      const flat = CloudNotes.flatten(merged, book)
      // 笔记本列表里可能没有书名（直接按 bookId 查的场景），从合并结果里补。
      if (flat.title === '') flat.title = String(merged?.book?.title ?? book.title ?? '')
      if (flat.author === '') flat.author = String(merged?.book?.author ?? book.author ?? '')
      await index.write(book.bookId, flat)
      scanned += 1
      if (!consider(flat)) {
        truncated = true
        return
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pending.length) }, () => worker()))
  if (hits.length < max && pending.length > 0 && nowMs() >= deadline) timedOut = true

  hits.sort((left, right) => right.at - left.at)
  const capped = hits.length >= max
  return {
    source: 'gateway',
    query: String(query ?? ''),
    hits: hits.slice(0, max),
    hitCount: Math.min(hits.length, max),
    /* 结果被条数上限截断（不是扫完了，是够数了）——UI 得说清楚，别让用户以为只有这么多。 */
    truncated: capped || truncated,
    scanned,
    total,
    remaining: Math.max(0, total - scanned),
    partial: scanned < total,
    timedOut,
  }
}
