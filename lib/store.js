/**
 * 书蠹的本地状态：设置、书架、每本书的正文缓存、阅读统计。
 *
 * 设计要点（都是踩过的坑，这里正面解决）：
 *
 * 1. **云端进度的字段名只有一套**：`remote = { percent, chapterUid, readingTime, updatedAt }`。
 *    写入端和展示端必须用同一组字段名，否则「已读多少小时」永远是 0。
 *    这里字段名在写入、读取、导出三处共用同一组常量。
 *
 * 2. **同步不清正文**：书架同步只更新书本元数据，`chapters` 原样保留。
 *    同步顺手把正文清掉的话，离线能力会一次清零。
 *
 * 3. **按书记时长**：`book.readSeconds` 与 `stats.byBook` 同时维护，
 *    既能回答「这本书我读了多少」，也能保留全局的连续天数。
 */
import fsp from 'node:fs/promises'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'

/**
 * 数据目录。
 *
 * 插件原来叫「问书 / wenshu」，数据放在 `~/.dsh/wenshu/`。改名成「书蠹 / bookworm」
 * 之后如果直接换新目录，老用户的书架、笔记和登录凭据会全部消失——它们还在磁盘上，
 * 只是没人去读了，那是最糟的一种「数据没丢但找不回来」。
 *
 * 所以这里按顺序找：
 *   1. 显式的 `BOOKWORM_HOME`（测试与自定义位置用）
 *   2. 老的 `~/.dsh/wenshu/`——只要它存在就继续用，改名对老用户完全无感
 *   3. `~/.dsh/bookworm/`——全新装的用户
 *
 * 老目录存在就永远优先，不做自动搬家：搬一半失败会让数据永久割裂，
 * 而多留一个目录的代价几乎为零。想换位置的人可以设 `BOOKWORM_HOME`。
 */
function defaultRoot() {
  const base = path.join(os.homedir(), '.dsh')
  const legacy = path.join(base, 'wenshu')
  try {
    if (fs.existsSync(path.join(legacy, 'state.json'))) return legacy
  } catch {
    /* 读不到就当不存在，落到新目录 */
  }
  return path.join(base, 'bookworm')
}

/**
 * state.json 的结构版本。
 * 2：修好「每行字数」的换算公式（原来 1em 取的是 UI 的 14px，不是正文的 fontSize），
 *    同时把默认 measure 从 34 提到 42。老用户的 34 在这个版本里一次性搬到 42，
 *    因为 34 当初就是默认值、不是谁的主动选择，留着它只会让新公式排出比现在更窄的行。
 */
export const STATE_VERSION = 2

/** 纸张主题。全部走宿主的 `--dsw-alias-*` 变量，这里只声明一组可选的衬底。 */
export const THEMES = ['follow', 'paper', 'sepia', 'moss', 'ink', 'night']
export const FONTS = ['serif', 'sans', 'kai']
export const MODES = ['scroll', 'paged']

export const DEFAULT_SETTINGS = {
  theme: 'follow',
  fontFamily: 'serif',
  fontSize: 19,
  lineHeight: 1.9,
  /**
   * 每行字数。注意它以前是「名义值」：CSS 里写的是 calc(var(--ws-measure) * 1em)，
   * 而 1em 取的是 .ws-root 的 14px（UI 字号）不是正文 19px，
   * 所以设 34 实际只排出 22 字/行。公式修正后这个值才真的等于每行字数，
   * 因此默认值同时上调，老用户的 34 会在迁移里跟着改（见 #migrate）。
   */
  measure: 42,
  mode: 'scroll',
  justify: true,
  chromeAutoHide: true,
  /** 每日阅读目标（秒）。可调，不该由代码替读者定死。 */
  dailyGoalSeconds: 1800,
  /** 划词工具条是否显示「问 AI」，以及默认问法。 */
  askMode: 'explain',
  /**
   * 把阅读时长和进度回写到微信读书。默认开。
   *
   * 读者在书蠹里读的书，本来就该算进他自己的阅读记录里——不然手机上看到的是
   * 一份、这里是另一份，两边永远对不上。开关留着是因为这是会写远端账号的操作，
   * 有人可能不希望任何东西被写出去。
   */
  reportProgress: true,
}

/** 书架同步写入的云端进度字段，全库唯一真相。 */
export const REMOTE_FIELDS = ['percent', 'chapterUid', 'readingTime', 'updatedAt']

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

export function normalizeSettings(input) {
  const next = { ...DEFAULT_SETTINGS }
  if (input === null || typeof input !== 'object') return next
  if (THEMES.includes(input.theme)) next.theme = input.theme
  if (FONTS.includes(input.fontFamily)) next.fontFamily = input.fontFamily
  if (MODES.includes(input.mode)) next.mode = input.mode
  if (Number.isFinite(input.fontSize)) next.fontSize = clamp(Math.round(input.fontSize), 14, 34)
  if (Number.isFinite(input.lineHeight)) next.lineHeight = clamp(Number(input.lineHeight), 1.3, 2.6)
  if (Number.isFinite(input.measure)) next.measure = clamp(Math.round(input.measure), 20, 60)
  if (typeof input.justify === 'boolean') next.justify = input.justify
  if (typeof input.chromeAutoHide === 'boolean') next.chromeAutoHide = input.chromeAutoHide
  if (Number.isFinite(input.dailyGoalSeconds)) {
    // 5 分钟到 4 小时，够宽；不是 0 也不接受负数。
    next.dailyGoalSeconds = clamp(Math.round(input.dailyGoalSeconds), 300, 14400)
  }
  if (['explain', 'expand'].includes(input.askMode)) next.askMode = input.askMode
  if (typeof input.reportProgress === 'boolean') next.reportProgress = input.reportProgress
  return next
}

function emptyProvider(id) {
  return {
    id,
    cookie: '',
    apiKey: '',
    account: '',
    lastSyncAt: 0,
    error: '',
    sessionValid: true,
  }
}

function emptyState() {
  return {
    version: STATE_VERSION,
    settings: { ...DEFAULT_SETTINGS },
    providers: { weread: emptyProvider('weread') },
    books: [],
    stats: { seconds: 0, opened: 0, days: {}, byBook: {} },
  }
}

/** 原子写：先写 .tmp 再 rename，权限 0600（里面可能有 Cookie）。 */
async function writeAtomic(file, data) {
  await fsp.mkdir(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  await fsp.writeFile(tmp, data, { mode: 0o600 })
  await fsp.rename(tmp, file)
}

function newBookId() {
  return `bk_${crypto.randomBytes(5).toString('hex')}`
}

function dayKeyOf(ms) {
  const date = new Date(ms)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function numberOr(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

/** 一本书在书架上的公开形态（不含 chapters，避免把正文塞进 /state）。 */
function summaryOf(book) {
  return {
    id: book.id,
    title: book.title,
    author: book.author,
    source: book.source,
    sourceId: book.sourceId,
    format: book.format,
    cover: book.cover,
    chapterCount: book.chapterCount,
    chars: book.chars,
    addedAt: book.addedAt,
    lastOpenedAt: book.lastOpenedAt,
    finished: book.finished,
    progress: book.progress,
    /** 按书的累计阅读秒数——只有全局计数器是不够的，读者会想知道「这本我读了多久」。 */
    readSeconds: book.readSeconds ?? 0,
    remote: book.remote ?? null,
  }
}

/** 进度百分比：本地优先，本地为 0 时回落到云端。全项目只此一处算法。 */
export function bookPercentOf(book) {
  const total = Math.max(1, numberOr(book?.chapterCount, 0))
  const index = numberOr(book?.progress?.chapterIndex, 0)
  const inner = clamp(numberOr(book?.progress?.percent, 0), 0, 1)
  if (index > 0 || inner > 0) {
    return clamp(Math.round(((index + inner) / total) * 100), 0, 100)
  }
  const remote = numberOr(book?.remote?.percent, 0)
  return clamp(Math.round(remote), 0, 100)
}

export class Store {
  constructor(options = {}) {
    this.root = options.root ?? process.env.BOOKWORM_HOME ?? defaultRoot()
    this.stateFile = path.join(this.root, 'state.json')
    this.booksDir = path.join(this.root, 'books')
    this.state = emptyState()
    this.loaded = false
    this.queue = Promise.resolve()
    /** 每本书的章节缓存，按需读盘，避免 174 本全量反序列化。 */
    this.bookCache = new Map()
  }

  get storageDir() {
    return this.root
  }

  /** 串行化所有写操作，避免并发 rename 抢同一个 tmp 文件。 */
  serialize(operation) {
    const run = this.queue.then(operation, operation)
    this.queue = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }

  async load() {
    if (this.loaded) return this.state
    let parsed = null
    try {
      parsed = JSON.parse(await fsp.readFile(this.stateFile, 'utf8'))
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
    this.state = this.#migrate(parsed)
    this.loaded = true
    /* 迁移必须落盘。只在内存里改的话，下次重启又读到旧的 version/measure，
       每启动一次都要重迁一次；而且用户看到的新行宽会被旧文件覆盖回去。
       写失败不阻断启动——内存里的迁移结果仍然是对的。 */
    const staleVersion = parsed === null ? 0 : numberOr(parsed.version, 1)
    if (parsed !== null && staleVersion < STATE_VERSION) {
      try {
        await this.#persist()
      } catch {
        /* 落盘失败，本轮仍按迁移后的内存状态工作 */
      }
    }
    return this.state
  }

  /** 容错式迁移：任何缺字段都补默认值，坏数据不炸启动。 */
  #migrate(parsed) {
    const base = emptyState()
    if (parsed === null || typeof parsed !== 'object') return base
    const state = {
      version: STATE_VERSION,
      settings: normalizeSettings(parsed.settings),
      providers: { ...base.providers },
      books: Array.isArray(parsed.books) ? parsed.books.filter((book) => book && typeof book.id === 'string') : [],
      stats: {
        seconds: numberOr(parsed?.stats?.seconds, 0),
        opened: numberOr(parsed?.stats?.opened, 0),
        days: parsed?.stats?.days !== null && typeof parsed?.stats?.days === 'object' ? parsed.stats.days : {},
        byBook:
          parsed?.stats?.byBook !== null && typeof parsed?.stats?.byBook === 'object' ? parsed.stats.byBook : {},
      },
    }
    const weread = parsed?.providers?.weread
    if (weread !== null && typeof weread === 'object') {
      state.providers.weread = { ...emptyProvider('weread'), ...weread, id: 'weread' }
    }
    // 字段名统一：老数据里如果有人写过 progress/seconds，这里一次性搬正。
    for (const book of state.books) {
      if (book.readSeconds === undefined) book.readSeconds = 0
      const remote = book.remote
      if (remote !== null && typeof remote === 'object') {
        if (remote.percent === undefined && remote.progress !== undefined) remote.percent = remote.progress
        if (remote.readingTime === undefined && remote.seconds !== undefined) remote.readingTime = remote.seconds
        delete remote.progress
        delete remote.seconds
      }
    }
    // v1 → v2：每行字数的换算公式修好了。
    // 旧公式里 1em 取的是 .ws-root 的 14px（UI 字号），不是正文的 fontSize，
    // 所以“34”实际只排出 22 字/行。现在公式正确，34 就真的等于 34 字/行，
    // 而 34 当初只是默认值、不是谁的主动选择——留着它会让修好后的行宽比现在更窄。
    // 因此只在“值仍是旧默认值 34”时把它搬到新默认值，动过滑块的人保持原样。
    const previous = numberOr(parsed.version, 1)
    if (previous < 2 && state.settings.measure === 34) state.settings.measure = DEFAULT_SETTINGS.measure
    return state
  }

  async #persist() {
    await writeAtomic(this.stateFile, JSON.stringify(this.state, null, 2))
  }

  async bookFile(id) {
    return path.join(this.booksDir, `${id}.json`)
  }

  async readBookFile(id) {
    if (this.bookCache.has(id)) return this.bookCache.get(id)
    try {
      const parsed = JSON.parse(await fsp.readFile(await this.bookFile(id), 'utf8'))
      const record = { book: parsed?.book ?? null, chapters: Array.isArray(parsed?.chapters) ? parsed.chapters : [] }
      this.bookCache.set(id, record)
      return record
    } catch (error) {
      if (error?.code === 'ENOENT') return null
      throw error
    }
  }

  async writeBookFile(id, record) {
    this.bookCache.set(id, record)
    await writeAtomic(
      await this.bookFile(id),
      JSON.stringify({ book: record.book, chapters: record.chapters }, null, 0),
    )
  }

  dropBookCache(id) {
    this.bookCache.delete(id)
  }

  /** 整个插件对外的一次快照：Client 的首屏就是这一个调用。 */
  async snapshot() {
    await this.load()
    const books = [...this.state.books].sort(
      (left, right) => numberOr(right.lastOpenedAt, 0) - numberOr(left.lastOpenedAt, 0),
    )
    return {
      storage: this.root,
      settings: this.state.settings,
      shelf: books.map((book) => summaryOf(book)),
      provider: {
        ...this.state.providers.weread,
        cookie: this.state.providers.weread.cookie === '' ? '' : 'stored',
        apiKey: this.state.providers.weread.apiKey === '' ? '' : 'stored',
      },
      stats: this.summarizeStats(),
    }
  }

  /** 统计：全局 + 今日 + 连续天数 + 按书时长排行。 */
  summarizeStats() {
    const stats = this.state.stats
    const today = dayKeyOf(Date.now())
    let week = 0
    const days = []
    for (let offset = 6; offset >= 0; offset -= 1) {
      const date = new Date(Date.now() - offset * 86400000)
      const key = dayKeyOf(date.getTime())
      const value = numberOr(stats.days?.[key], 0)
      week += value
      days.push({ date: key, seconds: value })
    }
    // 连续天数：今天还没读不算断。
    let streak = 0
    for (let offset = 0; offset < 400; offset += 1) {
      const value = numberOr(stats.days?.[dayKeyOf(Date.now() - offset * 86400000)], 0)
      if (value <= 0) {
        if (offset === 0) continue
        break
      }
      streak += 1
    }
    const byBook = Object.entries(stats.byBook ?? {})
      .map(([id, seconds]) => ({ id, seconds: numberOr(seconds, 0) }))
      .sort((left, right) => right.seconds - left.seconds)
    return {
      seconds: numberOr(stats.seconds, 0),
      opened: numberOr(stats.opened, 0),
      today: numberOr(stats.days?.[today], 0),
      week,
      streak,
      days,
      byBook,
    }
  }

  /** 云端书架同步：只更新元数据，正文缓存一律保留。 */
  async putOnlineBooks(items) {
    return this.serialize(async () => {
      await this.load()
      const bySourceId = new Map(this.state.books.map((book) => [book.sourceId, book]))
      let added = 0
      let updated = 0
      for (const item of Array.isArray(items) ? items : []) {
        const sourceId = String(item?.sourceId ?? '')
        if (sourceId === '') continue
        const existing = bySourceId.get(sourceId)
        const remote = {
          percent: clamp(numberOr(item?.percent, 0), 0, 100),
          chapterUid: numberOr(item?.chapterUid, 0),
          readingTime: numberOr(item?.readingTime, 0),
          updatedAt: numberOr(item?.updatedAt, 0),
        }
        if (existing === undefined) {
          const book = {
            id: newBookId(),
            title: String(item?.title ?? ''),
            author: String(item?.author ?? ''),
            source: 'weread',
            sourceId,
            format: 'online',
            cover: String(item?.cover ?? ''),
            chapterCount: 0,
            chars: 0,
            addedAt: Date.now(),
            lastOpenedAt: 0,
            finished: false,
            progress: { chapterIndex: 0, percent: 0, charsRead: 0, updatedAt: 0 },
            readSeconds: 0,
            remote,
          }
          this.state.books.push(book)
          bySourceId.set(sourceId, book)
          // 新书落一个只含元数据的文件；已有文件绝不动。
          await this.writeBookFile(book.id, { book: summaryOf(book), chapters: [] })
          added += 1
        } else {
          existing.title = String(item?.title ?? existing.title ?? '')
          existing.author = String(item?.author ?? existing.author ?? '')
          if (typeof item?.cover === 'string' && item.cover !== '') existing.cover = item.cover
          existing.remote = remote
          updated += 1
        }
      }
      await this.#persist()
      return { added, updated }
    })
  }

  async patchProvider(id, patch) {
    return this.serialize(async () => {
      await this.load()
      const current = this.state.providers[id] ?? emptyProvider(id)
      this.state.providers[id] = { ...current, ...patch, id }
      await this.#persist()
      return this.state.providers[id]
    })
  }

  async providerRecord(id) {
    await this.load()
    return this.state.providers[id] ?? emptyProvider(id)
  }

  async getSettings() {
    await this.load()
    return this.state.settings
  }

  async patchSettings(patch) {
    return this.serialize(async () => {
      await this.load()
      this.state.settings = normalizeSettings({ ...this.state.settings, ...(patch ?? {}) })
      await this.#persist()
      return this.state.settings
    })
  }

  async getBook(id) {
    await this.load()
    return this.state.books.find((book) => book.id === id) ?? null
  }

  /** 按来源 id（微信读书的 bookId）查书，用于「已在书架里吗」。 */
  async getBookBySourceId(sourceId) {
    await this.load()
    return this.state.books.find((book) => book.sourceId === String(sourceId)) ?? null
  }

  /** sourceId → book 的映射，一次查 170 本时用（避免 170 次 find）。 */
  async listBySourceId() {
    await this.load()
    const map = new Map()
    for (const book of this.state.books) {
      if (book.sourceId !== undefined && book.sourceId !== '') map.set(String(book.sourceId), book)
    }
    return map
  }

  /** 写入/更新一本书的章节清单（目录）。已缓存的正文按 chapterId 保留。 */
  async putBook({ id, chapters, ...book }) {
    return this.serialize(async () => {
      await this.load()
      const existing = this.state.books.find((item) => item.id === id)
      const record = (await this.readBookFile(id)) ?? { book: null, chapters: [] }
      const cached = new Map(
        record.chapters.filter((chapter) => chapter && Array.isArray(chapter.blocks)).map((chapter) => [chapter.index, chapter]),
      )
      const normalized = (Array.isArray(chapters) ? chapters : []).map((chapter, index) => {
        const previous = cached.get(chapter.index ?? index)
        const blocks = chapter.blocks !== undefined && chapter.blocks !== null ? chapter.blocks : (previous?.blocks ?? null)
        return {
          index: chapter.index ?? index,
          title: String(chapter.title ?? ''),
          chapterId: chapter.chapterId === undefined ? '' : String(chapter.chapterId),
          locked: chapter.locked === true,
          blocks,
          chars: blocks === null ? 0 : blocks.reduce((sum, block) => sum + String(block.x ?? '').length, 0),
        }
      })
      const chars = normalized.reduce((sum, chapter) => sum + chapter.chars, 0)
      const next = {
        ...(existing ?? {}),
        ...book,
        id,
        chapterCount: normalized.length,
        chars,
        progress: existing?.progress ?? { chapterIndex: 0, percent: 0, charsRead: 0, updatedAt: 0 },
        readSeconds: existing?.readSeconds ?? 0,
        addedAt: existing?.addedAt ?? Date.now(),
        lastOpenedAt: existing?.lastOpenedAt ?? 0,
        finished: existing?.finished ?? false,
      }
      if (existing === undefined) this.state.books.push(next)
      else Object.assign(existing, next)
      await this.writeBookFile(id, { book: summaryOf(next), chapters: normalized })
      await this.#persist()
      return summaryOf(next)
    })
  }

  /** 单章正文落盘（在线书懒加载后调用），同步更新 char 计数。 */
  async patchChapter(id, index, blocks, title) {
    return this.serialize(async () => {
      await this.load()
      const book = this.state.books.find((item) => item.id === id)
      if (book === null || book === undefined) return null
      const record = (await this.readBookFile(id)) ?? { book: summaryOf(book), chapters: [] }
      const chapter = record.chapters.find((item) => item.index === index)
      if (chapter === undefined) return null
      chapter.blocks = Array.isArray(blocks) ? blocks : []
      chapter.chars = chapter.blocks.reduce((sum, block) => sum + String(block.x ?? '').length, 0)
      if (typeof title === 'string' && title !== '') chapter.title = title
      book.chars = record.chapters.reduce((sum, item) => sum + numberOr(item.chars, 0), 0)
      record.book = summaryOf(book)
      await this.writeBookFile(id, record)
      await this.#persist()
      return chapter
    })
  }

  /**
   * 局部改一本书的字段（不回写章节文件）。
   *
   * 用于「记一下上次回写时间」这类纯记账字段：putBook 会重写整份章节文件，
   * 为了记一个时间戳去重写正文文件不值得。
   */
  async patchBook(id, patch) {
    return this.serialize(async () => {
      await this.load()
      const book = this.state.books.find((item) => item.id === id)
      if (book === undefined || book === null) return null
      if (patch === null || typeof patch !== 'object') return summaryOf(book)
      Object.assign(book, patch)
      await this.#persist()
      return summaryOf(book)
    })
  }

  /** 打开一本书：更新 lastOpenedAt 与 opened 计数。 */
  async touch(id) {
    return this.serialize(async () => {
      await this.load()
      const book = this.state.books.find((item) => item.id === id)
      if (book === undefined) return null
      book.lastOpenedAt = Date.now()
      this.state.stats.opened = numberOr(this.state.stats.opened, 0) + 1
      await this.#persist()
      return summaryOf(book)
    })
  }

  /**
   * 记录进度。
   *
   * `seconds` 会同时累加到三处：全局 stats、按天的 days、按书的 readSeconds
   * 与 stats.byBook —— 只有全局计数器的话，读者无法知道「这本书我读了多久」。
   * `percent` 只在**有实际位置**时才写，避免把 0 覆盖到云端读来的进度上。
   */
  async updateProgress({ bookId, chapterIndex, percent, seconds }) {
    return this.serialize(async () => {
      await this.load()
      const book = this.state.books.find((item) => item.id === bookId)
      if (book === undefined) return null
      const total = Math.max(1, numberOr(book.chapterCount, 0))
      const index = clamp(Math.round(numberOr(chapterIndex, 0)), 0, total - 1)
      const hadPosition = index > 0 || numberOr(percent, 0) > 0
      if (hadPosition) {
        const inner = clamp(numberOr(percent, 0), 0, 1)
        book.progress = {
          chapterIndex: index,
          percent: inner,
          charsRead: Math.round(numberOr(book.chars, 0) * ((index + inner) / total)),
          updatedAt: Date.now(),
        }
      }
      const spent = clamp(numberOr(seconds, 0), 0, 3600)
      if (spent > 0) {
        const key = dayKeyOf(Date.now())
        this.state.stats.seconds = numberOr(this.state.stats.seconds, 0) + spent
        this.state.stats.days[key] = numberOr(this.state.stats.days[key], 0) + spent
        book.readSeconds = numberOr(book.readSeconds, 0) + spent
        this.state.stats.byBook[bookId] = numberOr(this.state.stats.byBook[bookId], 0) + spent
      }
      await this.#persist()
      return summaryOf(book)
    })
  }

  async setFinished(id, finished) {
    return this.serialize(async () => {
      await this.load()
      const book = this.state.books.find((item) => item.id === id)
      if (book === undefined) return null
      book.finished = finished === true
      if (book.finished) {
        book.progress = {
          chapterIndex: Math.max(0, numberOr(book.chapterCount, 1) - 1),
          percent: 1,
          charsRead: numberOr(book.chars, 0),
          updatedAt: Date.now(),
        }
      }
      await this.#persist()
      return summaryOf(book)
    })
  }

  async deleteBook(id) {
    return this.serialize(async () => {
      await this.load()
      const index = this.state.books.findIndex((book) => book.id === id)
      if (index < 0) return false
      this.state.books.splice(index, 1)
      delete this.state.stats.byBook[id]
      await this.#persist()
      this.bookCache.delete(id)
      await fsp.rm(await this.bookFile(id), { force: true })
      return true
    })
  }
}
