/**
 * 笔记与划线：一本书里的引文 + 读者/AI 的想法。
 *
 * 笔记必须能改、能归类、能搜——否则写错了改不了、多了找不到，最后就不写了。
 * 每条笔记保留 `updatedAt`，导出时能区分「想法变了」和「刚写下」。
 */
import fsp from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'

const MODES = ['explain', 'expand', 'note', 'ask']

function normalizeTags(input) {
  const tags = []
  for (const raw of Array.isArray(input) ? input : []) {
    const tag = String(raw ?? '').replace(/^#+/, '').replace(/\s+/g, ' ').trim().slice(0, 24)
    if (tag !== '' && !tags.includes(tag)) tags.push(tag)
    if (tags.length >= 12) break
  }
  return tags
}

export class Notes {
  constructor(root) {
    this.file = path.join(root, 'notes.json')
    this.notes = []
    this.loaded = false
    this.queue = Promise.resolve()
  }

  async load() {
    if (this.loaded) return this.notes
    try {
      const parsed = JSON.parse(await fsp.readFile(this.file, 'utf8'))
      this.notes = Array.isArray(parsed) ? parsed.filter((note) => note && typeof note.id === 'string') : []
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
      this.notes = []
    }
    for (const note of this.notes) {
      if (note.tags === undefined) note.tags = []
      if (note.updatedAt === undefined) note.updatedAt = note.createdAt ?? Date.now()
    }
    this.loaded = true
    return this.notes
  }

  serialize(operation) {
    const run = this.queue.then(operation, operation)
    this.queue = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }

  async #persist() {
    await fsp.mkdir(path.dirname(this.file), { recursive: true })
    const tmp = `${this.file}.tmp`
    await fsp.writeFile(tmp, JSON.stringify(this.notes, null, 2), { mode: 0o600 })
    await fsp.rename(tmp, this.file)
  }

  /**
   * 列表。`query` 同时匹配引文、笔记正文、书名、章名和标签——
   * 只匹配引文的话，「我当时怎么想的」就永远搜不出来。
   */
  async list({ bookId, query, tag, limit } = {}) {
    await this.load()
    let items = this.notes
    if (bookId) items = items.filter((note) => note.bookId === bookId)
    if (tag) items = items.filter((note) => Array.isArray(note.tags) && note.tags.includes(tag))
    const needle = String(query ?? '').trim().toLowerCase()
    if (needle !== '') {
      items = items.filter((note) =>
        [note.quote, note.note, note.bookTitle, note.chapterTitle, ...(note.tags ?? [])]
          .join('\n')
          .toLowerCase()
          .includes(needle),
      )
    }
    const sorted = [...items].sort((left, right) => (right.updatedAt ?? right.createdAt) - (left.updatedAt ?? left.createdAt))
    return Number.isFinite(limit) && limit > 0 ? sorted.slice(0, limit) : sorted
  }

  async counts() {
    await this.load()
    const map = new Map()
    for (const note of this.notes) map.set(note.bookId, (map.get(note.bookId) ?? 0) + 1)
    return map
  }

  /** 全部标签及出现次数，供 UI 做标签云/筛选。 */
  async tags() {
    await this.load()
    const map = new Map()
    for (const note of this.notes) {
      for (const tag of note.tags ?? []) map.set(tag, (map.get(tag) ?? 0) + 1)
    }
    return [...map.entries()].map(([tag, count]) => ({ tag, count })).sort((left, right) => right.count - left.count)
  }

  async add(input) {
    return this.serialize(async () => {
      await this.load()
      const now = Date.now()
      const note = {
        id: `nt_${crypto.randomBytes(5).toString('hex')}`,
        bookId: String(input.bookId ?? ''),
        bookTitle: String(input.bookTitle ?? ''),
        chapterIndex: Number(input.chapterIndex) || 0,
        chapterTitle: String(input.chapterTitle ?? ''),
        quote: String(input.quote ?? '').slice(0, 4000),
        note: String(input.note ?? '').slice(0, 20000),
        mode: MODES.includes(input.mode) ? input.mode : 'note',
        tags: normalizeTags(input.tags),
        createdAt: now,
        updatedAt: now,
      }
      this.notes.push(note)
      await this.#persist()
      return note
    })
  }

  /** 编辑既有笔记（正文、引文、标签都能改；id/createdAt 不变）。 */
  async edit(id, patch) {
    return this.serialize(async () => {
      await this.load()
      const note = this.notes.find((item) => item.id === id)
      if (note === undefined) return null
      if (typeof patch?.note === 'string') note.note = patch.note.slice(0, 20000)
      if (typeof patch?.quote === 'string') note.quote = patch.quote.slice(0, 4000)
      if (patch?.tags !== undefined) note.tags = normalizeTags(patch.tags)
      if (MODES.includes(patch?.mode)) note.mode = patch.mode
      note.updatedAt = Date.now()
      await this.#persist()
      return note
    })
  }

  async remove(id) {
    return this.serialize(async () => {
      await this.load()
      const index = this.notes.findIndex((note) => note.id === id)
      if (index < 0) return false
      this.notes.splice(index, 1)
      await this.#persist()
      return true
    })
  }

  async removeBook(bookId) {
    return this.serialize(async () => {
      await this.load()
      const before = this.notes.length
      this.notes = this.notes.filter((note) => note.bookId !== bookId)
      if (this.notes.length !== before) await this.#persist()
    })
  }
}

/** 笔记导出成 Markdown：按书分组、按章与时间排序，带出处、标签与模式。 */
export function notesToMarkdown(notes, options = {}) {
  const generatedAt = new Date().toLocaleString('zh-CN', { hour12: false })
  const lines = []
  lines.push('# 书蠹 · 读书笔记')
  lines.push('')
  if (options.bookTitle) lines.push(`> 出自《${options.bookTitle}》`)
  lines.push(`> 导出时间：${generatedAt} · 共 ${notes.length} 条`)
  lines.push('')

  const groups = new Map()
  for (const note of notes) {
    const key = note.bookId
    if (!groups.has(key)) groups.set(key, { title: note.bookTitle || '未命名', items: [] })
    groups.get(key).items.push(note)
  }

  for (const [, group] of groups) {
    lines.push(`## 《${group.title}》`)
    lines.push('')
    const ordered = [...group.items].sort((left, right) => {
      if (left.chapterIndex !== right.chapterIndex) return left.chapterIndex - right.chapterIndex
      return left.createdAt - right.createdAt
    })
    for (const note of ordered) {
      const where = note.chapterTitle
        ? `第 ${note.chapterIndex + 1} 章 · ${note.chapterTitle}`
        : `第 ${note.chapterIndex + 1} 章`
      lines.push(`### ${where}`)
      if (note.quote) {
        for (const line of note.quote.split('\n')) lines.push(`> ${line}`)
        lines.push('')
      }
      if (note.note) {
        const label =
          note.mode === 'explain' ? '**解释**' : note.mode === 'expand' ? '**补充**' : note.mode === 'ask' ? '**问答**' : ''
        lines.push(`${label}${label ? '：' : ''}${note.note}`)
        lines.push('')
      }
      if (Array.isArray(note.tags) && note.tags.length > 0) {
        lines.push(note.tags.map((tag) => `\`#${tag}\``).join(' '))
        lines.push('')
      }
      lines.push(`<sub>${new Date(note.createdAt).toLocaleString('zh-CN', { hour12: false })}</sub>`)
      lines.push('')
    }
  }
  return lines.join('\n')
}

/** 书单导出：一眼看清读了什么、读到哪、读了多久。 */
export function shelfToMarkdown(shelf) {
  const generatedAt = new Date().toLocaleString('zh-CN', { hour12: false })
  const total = shelf.reduce((sum, book) => sum + (Number(book.readSeconds) || 0), 0)
  const lines = ['# 我的书架 · 书蠹', '', `> 导出时间：${generatedAt} · 共 ${shelf.length} 本 · 累计 ${Math.round(total / 60)} 分钟`, '']
  lines.push('| 书名 | 作者 | 进度 | 本书时长 | 状态 |')
  lines.push('| --- | --- | --- | --- | --- |')
  for (const book of shelf) {
    const chapters = Math.max(1, Number(book.chapterCount) || 0)
    const local = (Number(book.progress?.chapterIndex) || 0) + (Number(book.progress?.percent) || 0)
    const percent = local > 0
      ? Math.round((local / chapters) * 100)
      : Math.round(Number(book.remote?.percent) || 0)
    const minutes = Math.round((Number(book.readSeconds) || 0) / 60)
    lines.push(
      `| ${book.title || '未命名'} | ${book.author || '—'} | ${Math.min(100, percent)}% | ${minutes > 0 ? `${minutes} 分钟` : '—'} | ${book.finished ? '读完' : '在读'} |`,
    )
  }
  lines.push('')
  return lines.join('\n')
}
