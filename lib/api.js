/**
 * 书蠹的服务层：所有能力都在这里实现一次。
 *
 * 三条调用路径共用同一批方法：
 *   - UI  → `POST /bookworm/api/<name>`（同源 fetch）
 *   - Agent → `ctx.tools` 里的 `bookworm_*` 工具（直接调 `service.<method>`）
 *   - 内部 → 互相调用
 *
 * 只支持微信读书一个来源，所以这里不需要为「本地文件 / GitHub / PDF」各写一套分支。
 */
import path from 'node:path'
import { Store, bookPercentOf, normalizeSettings } from './store.js'
import { createAi, buildContextWindow, blocksToText } from './ai.js'
import { createWereadProvider } from './providers/weread.js'
import { WereadGateway, looksLikeApiKey, maskSecret, WereadGatewayError } from './gateway.js'
import { CloudNotes, searchCloudNotes } from './cloud-notes.js'
import { ProviderError } from './http.js'
import { Notes, notesToMarkdown, shelfToMarkdown } from './notes.js'
import { startQrLogin, completeQrLogin } from './vendor/weread/qr-login.js'

export const PREFIX = '/bookworm'

/** 二维码登录会话存活时间：超过就当作放弃，别在内存里堆死。 */
const QR_TTL_MS = 6 * 60 * 1000

/**
 * 目录里有一些「不是正文章节」的条目，微信读书会混在 catalog 里。
 * 直接按标题跳过；相邻同名章（微读的「标题页 + 正文页」两段）合并成一条。
 */
const TOC_SKIP = new Set(['封面', '版权信息', '扉页', '插页', '目录', '版权页', '出版信息'])

/**
 * 「问整章」时喂给模型的正文上限。一章通常 3–8k 字，这个额度足够放下整章，
 * 又不会把上下文撑爆（超长章会截断，截断提示由 ai.js 负责）。
 */
const CHAPTER_CHAR_BUDGET = 12000

export function normalizeToc(chapters) {
  const result = []
  for (const chapter of Array.isArray(chapters) ? chapters : []) {
    const title = String(chapter?.title ?? '').trim()
    if (title === '' || TOC_SKIP.has(title)) continue
    const chapterId = String(chapter?.chapterId ?? '')
    if (chapterId === '') continue
    // chapterIdx 是微信读书自己的章节序号，回写进度时直接用它，
    // 免得再从本地下标反推（本地剔掉了封面/版权页，两者不等）。
    const chapterIdx = Number(chapter?.chapterIdx ?? 0)
    const previous = result[result.length - 1]
    if (previous !== undefined && previous.title === title) {
      // 微信读书把一章拆成「标题页」和「正文页」两条同名记录，正文在后一条，
      // 所以覆盖前一条而不是跳过。
      result[result.length - 1] = { title, chapterId, chapterIdx }
      continue
    }
    result.push({ title, chapterId, chapterIdx })
  }
  return result.map((chapter, index) => ({ ...chapter, index }))
}

export function createApi({ ctx, config = {} }) {
  const store = new Store({ root: config.root })
  const notes = new Notes(store.storageDir)
  const ai = createAi({ ctx })
  const logger = ctx?.logger

  // 官方网关的 key 每次调用时现读，保存后立刻生效，不必重建 provider。
  let cachedApiKey = ''
  void store.providerRecord('weread').then((record) => {
    cachedApiKey = String(record?.apiKey ?? '')
  }).catch(() => {})

  const gateway = new WereadGateway({
    getApiKey: () => cachedApiKey,
    logger,
  })

  const provider = createWereadProvider({
    readRecord: () => store.providerRecord('weread'),
    persistCookie: (cookie) => store.patchProvider('weread', { cookie }),
    gateway,
  })

  // 云端划线的本地搜索索引：网关没有跨书搜索，只能自己摊平缓存。
  const cloudIndex = new CloudNotes(path.join(store.storageDir, 'cloud-notes'))

  /** uid → {status, error, account, startedAt} */
  const qrSessions = new Map()

  function pruneQr() {
    const now = Date.now()
    for (const [uid, session] of qrSessions) {
      if (now - session.startedAt > QR_TTL_MS) qrSessions.delete(uid)
    }
  }

  /** 取到一本书的完整记录（含章节缓存），不存在就抛。 */
  async function requireBook(bookId) {
    const id = String(bookId ?? '').trim()
    if (id === '') throw new ProviderError('BADREQ', '缺少 bookId。')
    const book = await store.getBook(id)
    if (book !== null) return book
    /* 云端笔记里用的是微信读书的 bookId，本地书架记的是另一套 id——两边都要能打开。 */
    const bySource = await store.getBookBySourceId(id)
    if (bySource !== null) return bySource
    throw new ProviderError('NOTFOUND', '书架上没有这本书。')
  }

  /**
   * 确保目录已就绪。在线书第一次打开时才有目录，这里补齐并把云端进度映射到本地。
   * 目录要在这里统一补齐，不能塞进打开书的那条路径里——否则「同步了整架，
   * 只有已经点开过的那几本才有目录」，其余书的章节列表永远是空的。
   */
  async function ensureToc(book) {
    const record = await store.readBookFile(book.id)
    const cached = Array.isArray(record?.chapters) ? record.chapters : []
    if (cached.length > 0) return cached
    if (book.source !== 'weread') return []

    const meta = await provider.toc({ bookId: book.sourceId })
    const chapters = normalizeToc(meta.chapters)
    if (chapters.length === 0) return []

    await store.putBook({
      id: book.id,
      title: book.title || meta.title,
      author: book.author || meta.author,
      source: 'weread',
      sourceId: book.sourceId,
      format: 'online',
      cover: book.cover,
      chapters: chapters.map((chapter) => ({
        index: chapter.index,
        title: chapter.title,
        chapterId: chapter.chapterId,
        chapterIdx: Number(chapter.chapterIdx ?? 0),
        blocks: null,
      })),
    })

    // 云端进度 → 本地位置。只在本地还没有位置时做，避免覆盖真实的阅读进度。
    const remoteUid = Number(book.remote?.chapterUid ?? 0)
    const localIndex = Number(book.progress?.chapterIndex ?? 0)
    if (remoteUid > 0 && localIndex === 0 && Number(book.progress?.percent ?? 0) === 0) {
      const seed = chapters.find((chapter) => Number(chapter.chapterId) === remoteUid)
      if (seed !== undefined) {
        const remotePercent = Number(book.remote?.percent ?? 0)
        // remote.percent 是全书百分比，换算成「章内百分比」才有意义。
        const inner = remotePercent > 0 ? Math.min(1, remotePercent / 100 * chapters.length - seed.index) : 0
        await store.updateProgress({
          bookId: book.id,
          chapterIndex: seed.index,
          percent: Math.max(0, Math.min(1, inner)),
          seconds: 0,
        })
      }
    }
    return (await store.readBookFile(book.id))?.chapters ?? chapters
  }

  /**
   * 取某一章正文。已缓存直接返回；否则按需向微信读书拉一节并落盘。
   */
  async function loadChapter(bookId, index) {
    const book = await requireBook(bookId)
    const chapters = await ensureToc(book)
    const target = Number(index) || 0
    const chapter = chapters.find((item) => item.index === target)
    if (chapter === undefined) throw new ProviderError('NOTFOUND', '没有这一章。')
    if (Array.isArray(chapter.blocks) && chapter.blocks.length > 0) {
      return { title: chapter.title, blocks: chapter.blocks, chapter }
    }
    if (book.source !== 'weread') {
      throw new ProviderError('NOTFOUND', '这一章还没有正文。')
    }
    const payload = await provider.chapter({ book, chapter })
    await store.patchChapter(book.id, target, payload.blocks, payload.title)
    return { title: payload.title, blocks: payload.blocks, chapter: { ...chapter, title: payload.title } }
  }

  const service = {
    /* ── 书架与设置 ───────────────────────────────────────────── */

    async state() {
      const snapshot = await store.snapshot()
      const counts = await notes.counts()
      return {
        ...snapshot,
        shelf: snapshot.shelf.map((book) => ({
          ...book,
          percent: bookPercentOf(book),
          notes: counts.get(book.id) ?? 0,
        })),
      }
    },

    async saveSettings(patch) {
      const settings = await store.patchSettings(patch)
      return { settings: normalizeSettings(settings) }
    },

    /* ── 微信读书连接 ─────────────────────────────────────────── */

    async wereadStatus() {
      const record = await store.providerRecord('weread')
      cachedApiKey = String(record?.apiKey ?? '')
      const apiKeyConfigured = looksLikeApiKey(cachedApiKey)
      const apiKeyMasked = maskSecret(cachedApiKey)
      const base = {
        apiKeyConfigured,
        apiKeyMasked,
        apiKeyUrl: 'https://weread.qq.com/r/weread-skills',
        // 有没有刷新令牌，决定了这次登录能撑一天还是一直撑下去。
        hasRefreshToken: String(record.cookie ?? '').includes('wr_rt='),
      }
      if (String(record.cookie ?? '') === '') {
        return { ...base, connected: false, account: '', lastSyncAt: 0, sessionValid: true, error: '' }
      }
      let valid = true
      let error = String(record.error ?? '')
      try {
        const check = await provider.check()
        valid = check.valid !== false
        if (!valid) error = check.reason ?? '登录已失效。'
      } catch (failure) {
        valid = false
        error = failure?.message ?? String(failure)
      }
      // 只有状态真的变了才写盘，避免每次打开设置页都产生一次磁盘写。
      if (record.sessionValid !== valid || record.error !== error) {
        await store.patchProvider('weread', { sessionValid: valid, error })
      }
      return {
        ...base,
        connected: true,
        account: String(record.account ?? ''),
        lastSyncAt: Number(record.lastSyncAt ?? 0),
        sessionValid: valid,
        error,
      }
    },

    /** 保存/清除官方网关的 API Key。 */
    async setApiKey({ apiKey }) {
      const value = String(apiKey ?? '').trim()
      if (value !== '' && !looksLikeApiKey(value)) {
        throw new ProviderError('BADREQ', 'API Key 格式不对：应该以 wrk- 开头。')
      }
      await store.patchProvider('weread', { apiKey: value })
      cachedApiKey = value
      return { ok: true, configured: looksLikeApiKey(value), masked: maskSecret(value) }
    },

    /** 所有有笔记的书（官方网关）。没配 key 时给一个可操作的提示。 */
    async notebooks() {
      const result = await provider.notebooks()
      if (result === null) {
        throw new ProviderError('BADREQ', '还没有配置微信读书 API Key：去 weread.qq.com/r/weread-skills 领取后填入设置。')
      }
      /* 笔记本里 170 本只有 ~44 本在书蠹书架里，其余点开没有正文可跳。
         这里直接标出哪本可以跳，前端就不用猜，也不会点了没反应。
         注意：在书架但目录还没取到的书**仍然可跳**——reader 打开时会自己补目录
         （见 publish 的 ensureToc），所以判断只看向「在不在书架」。 */
      const bySource = await store.listBySourceId()
      const books = (result.books ?? []).map((book) => {
        const local = bySource.get(String(book.bookId))
        return {
          ...book,
          localId: local?.id ?? '',
          canOpen: local !== undefined,
          needsToc: local !== undefined && Number(local.chapterCount ?? 0) === 0,
        }
      })
      return { ...result, books, onShelf: books.filter((book) => book.localId !== '').length }
    },

    /** 微信读书官方阅读统计（周/月/年/总）。没配 key 时给可操作提示。 */
    async cloudStats({ mode } = {}) {
      const result = await provider.cloudStats(mode ?? 'monthly')
      if (result === null) {
        throw new ProviderError('BADREQ', '还没有配置微信读书 API Key：去 weread.qq.com/r/weread-skills 领取后填入设置。')
      }
      return result
    },

    /**
     * 按微信读书 bookId 直接取划线+想法（不经书架）。
     * 笔记本里的书未必都在书蠹书架里，所以这条不 requireBook。
     */
    async cloudBookmarks({ bookId }) {
      if (!looksLikeApiKey(cachedApiKey)) {
        throw new ProviderError('BADREQ', '还没有配置微信读书 API Key：去 weread.qq.com/r/weread-skills 领取后填入设置。')
      }
      try {
        return await provider.bookmarks(String(bookId ?? ''))
      } catch (error) {
        if (error instanceof WereadGatewayError) {
          throw new ProviderError('AUTH', `${error.message}（也可清空 API Key 回落到 Cookie 方式）`)
        }
        throw error
      }
    },

    /**
     * 跨书搜索云端划线/想法。
     *
     * 这是「微信读书 + AI」里最常被想要、又最难自己做到的一件事：
     * 用户记得某句话，但忘了它在哪本书里。网关只提供单本接口，这里靠本地索引摊平。
     */
    async searchNotes({ query, limit, budgetMs, refresh, bookIds } = {}) {
      if (!looksLikeApiKey(cachedApiKey)) {
        throw new ProviderError('BADREQ', '还没有配置微信读书 API Key：去 weread.qq.com/r/weread-skills 领取后填入设置。')
      }
      const needle = String(query ?? '').trim()
      if (needle === '') throw new ProviderError('BADREQ', '搜索词是空的。')
      try {
        return await searchCloudNotes({
          index: cloudIndex,
          notebooks: () => provider.notebooks(),
          loadNotes: (bookId) => provider.bookmarks(bookId),
          query: needle,
          limit,
          budgetMs,
          refresh: refresh === true,
          bookIds,
        })
      } catch (error) {
        if (error instanceof WereadGatewayError) {
          throw new ProviderError('AUTH', `${error.message}（也可清空 API Key 回落到 Cookie 方式）`)
        }
        throw error
      }
    },

    /**
     * 云端笔记的全景概览：多少本书有笔记、总共多少划线/想法、最近动过的书。
     * 用来回答「我的笔记都散在哪」「我最近在记什么」。
     */
    async notesOverview() {
      const list = await provider.notebooks()
      if (list === null) {
        throw new ProviderError('BADREQ', '还没有配置微信读书 API Key：去 weread.qq.com/r/weread-skills 领取后填入设置。')
      }
      const books = Array.isArray(list.books) ? list.books : []
      let highlights = 0
      let thoughts = 0
      let bookmarks = 0
      for (const book of books) {
        highlights += Number(book.noteCount ?? 0)
        thoughts += Number(book.reviewCount ?? 0)
        bookmarks += Number(book.bookmarkCount ?? 0)
      }
      return {
        source: 'gateway',
        bookCount: books.length,
        highlightCount: highlights,
        thoughtCount: thoughts,
        bookmarkCount: bookmarks,
        total: highlights + thoughts + bookmarks,
        books: books.slice(0, 30),
      }
    },

    async wereadLogin({ cookie }) {
      const result = await provider.login({ cookie })
      await store.patchProvider('weread', {
        // 粘贴的 cookie 里常常没有 wr_rt；login() 会去站点把那一条补回来，
        // 存补过的那份，不然用户下次打开还得再粘一遍。
        cookie: String(result?.cookie ?? cookie).trim(),
        account: result.account,
        lastSyncAt: Date.now(),
        error: '',
        sessionValid: true,
      })
      const synced = await service.syncShelf()
      return {
        account: result.account,
        shelfCount: result.shelfCount,
        hasRefresh: result.hasRefresh === true,
        synced,
      }
    },

    async wereadLogout() {
      await store.patchProvider('weread', {
        cookie: '',
        account: '',
        lastSyncAt: 0,
        error: '',
        sessionValid: true,
      })
      return { connected: false }
    },

    /** 同步云端书架。只更新元数据，本地已缓存的正文与目录原样保留。 */
    async syncShelf() {
      const rows = await provider.shelf()
      const result = await store.putOnlineBooks(rows)
      await store.patchProvider('weread', { lastSyncAt: Date.now(), error: '', sessionValid: true })
      return { added: result.added, updated: result.updated, total: rows.length }
    },

    /* ── 二维码登录 ───────────────────────────────────────────── */

    async qrStart() {
      pruneQr()
      const begun = await startQrLogin()
      const uid = String(begun?.uid ?? '')
      if (uid === '') throw new ProviderError('UPSTREAM', '微信读书没有返回二维码。')
      qrSessions.set(uid, { status: 'waiting', error: '', account: '', startedAt: Date.now() })
      // 后台推进登录，前端轮询 qrStatus。completeQrLogin 会一直等到扫码确认。
      void (async () => {
        const session = qrSessions.get(uid)
        try {
          const done = await completeQrLogin(uid, AbortSignal.timeout(240_000))
          if (session !== undefined) session.status = 'authed'
          const cookie = String(done?.cookie ?? '')
          if (cookie === '') throw new ProviderError('UPSTREAM', '扫码成功但没有拿到 Cookie。')
          if (session !== undefined) session.status = 'syncing'
          const logged = await provider.login({ cookie })
          await store.patchProvider('weread', {
            // 用登录后回填过刷新令牌的 cookie 落盘，否则一天后就又要重扫码。
            cookie: String(logged?.cookie ?? cookie),
            account: logged.account,
            lastSyncAt: 0,
            error: '',
            sessionValid: true,
          })
          if (session !== undefined) session.account = logged.account
          await service.syncShelf()
          if (session !== undefined) session.status = 'done'
        } catch (failure) {
          if (session !== undefined) {
            session.status = 'error'
            session.error = failure?.message ?? String(failure)
          }
        }
      })()
      return { uid, svg: begun.qrSvg, confirmUrl: begun.confirmUrl, status: 'waiting' }
    },

    qrStatus({ uid }) {
      pruneQr()
      const session = qrSessions.get(String(uid ?? ''))
      if (session === undefined) return { status: 'expired', error: '二维码已过期，重新来一次。' }
      return { status: session.status, error: session.error, account: session.account }
    },

    /* ── 书城 ─────────────────────────────────────────────────── */

    async browse() {
      const books = await provider.browse()
      return { books }
    },

    async searchStore({ query }) {
      const keyword = String(query ?? '').trim()
      if (keyword === '') return { books: [] }
      return { books: await provider.search(keyword) }
    },

    /** 从书城把一本书加入书架（只拉目录，正文按需）。 */
    async openFromStore({ bookId }) {
      const sourceId = String(bookId ?? '').trim()
      if (sourceId === '') throw new ProviderError('BADREQ', '缺少 bookId。')
      const meta = await provider.toc({ bookId: sourceId })
      const chapters = normalizeToc(meta.chapters)
      const existing = await store.getBookBySourceId(sourceId)
      if (existing === null) {
        await store.putOnlineBooks([
          {
            sourceId,
            title: meta.title,
            author: meta.author,
            cover: '',
            percent: 0,
            chapterUid: 0,
            readingTime: 0,
            updatedAt: 0,
          },
        ])
      }
      const added = await store.getBookBySourceId(sourceId)
      if (added === null) throw new ProviderError('INTERNAL', '加入书架失败。')
      if (chapters.length > 0) {
        await store.putBook({
          id: added.id,
          title: meta.title,
          author: meta.author,
          source: 'weread',
          sourceId,
          format: 'online',
          cover: existing?.cover ?? added.cover ?? '',
          chapters: chapters.map((chapter) => ({
            index: chapter.index,
            title: chapter.title,
            chapterId: chapter.chapterId,
            blocks: null,
          })),
        })
      }
      return { book: await store.getBook(added.id) }
    },

    /* ── 阅读 ─────────────────────────────────────────────────── */

    async book({ bookId }) {
      const book = await requireBook(bookId)
      const chapters = await ensureToc(book)
      await store.touch(book.id)
      const fresh = await store.getBook(book.id)
      return {
        book: { ...fresh, percent: bookPercentOf(fresh) },
        toc: chapters.map((chapter) => ({
          index: chapter.index,
          title: chapter.title,
          chars: chapter.chars ?? 0,
          loaded: Array.isArray(chapter.blocks) && chapter.blocks.length > 0,
          /* 云端划线的 chapterUid 只有跟它对齐，才能从划线跳回正文对应章节。 */
          chapterUid: String(chapter.chapterId ?? ''),
        })),
        chaptersReady: chapters.filter((chapter) => Array.isArray(chapter.blocks) && chapter.blocks.length > 0).length,
      }
    },

    async chapter({ bookId, index }) {
      const loaded = await loadChapter(bookId, index)
      return { title: loaded.title, blocks: loaded.blocks }
    },

    async progress({ bookId, chapterIndex, percent, seconds }) {
      /* 从云端笔记跳进来的 bookId 是微信读书的 id，得先换成本地书架 id，否则进度记不上。 */
      let localId = String(bookId ?? '')
      if (localId !== '' && (await store.getBook(localId)) === null) {
        const viaSource = await store.getBookBySourceId(localId)
        if (viaSource !== null) localId = viaSource.id
      }
      const book = await store.updateProgress({
        bookId: localId,
        chapterIndex,
        percent,
        seconds,
      })
      return { book: book === null ? null : { ...book, percent: bookPercentOf(book) } }
    },

    async finished({ bookId, finished }) {
      const book = await store.setFinished(String(bookId ?? ''), finished === true)
      return { book: book === null ? null : { ...book, percent: bookPercentOf(book) } }
    },

    async removeBook({ bookId }) {
      const id = String(bookId ?? '')
      await store.deleteBook(id)
      await notes.removeBook(id)
      return { removed: id }
    },

    /** 这本书的划线与想法：官方网关优先（数据全），没配 key 回落 cookie。 */
    async bookmarks({ bookId }) {
      const book = await requireBook(bookId)
      if (book.source !== 'weread') {
        return { source: 'none', count: 0, highlightCount: 0, thoughtCount: 0, chapters: [] }
      }
      try {
        return await provider.bookmarks(book.sourceId)
      } catch (error) {
        // 网关 key 配错时给明确提示，cookie 缓存的划线仍可通过别处查看。
        if (error instanceof WereadGatewayError) {
          throw new ProviderError('AUTH', `${error.message}（也可清空 API Key 回落到 Cookie 方式）`)
        }
        throw error
      }
    },

    /* ── 回写阅读记录到微信读书 ───────────────────────────────── */

    /**
     * 把本地累积的阅读时长与位置上报给微信读书。
     *
     * 三道闸，缺一道都可能毁掉读者的真实记录：
     * 1) 开关：设置里关掉就一次也不发（默认是开的）。
     * 2) 只前进：本地进度比云端低时**不写**——远端那份是他在手机上读到的位置，
     *    比这里的旧数据权威得多，倒退回去等于把他的进度抹掉。
     * 3) 只写一次增量：`rt` 服务端自己夹在 1–300 秒之间，所以调用方传「自上次
     *    上报以来新增的秒数」，写成功后把这部分从待写入量里扣掉，重复调用不会
     *    把同一段时长记两遍。
     *
     * @param {{bookId: string, chapterIndex?: number, percent?: number, seconds?: number}} input
     */
    async reportProgress({ bookId, chapterIndex, percent, seconds }) {
      const settings = await store.getSettings()
      if (settings.reportProgress !== true) {
        return { skipped: 'disabled', reported: false }
      }
      const book = await requireBook(bookId)
      if (book.source !== 'weread') {
        return { skipped: 'local-book', reported: false }
      }
      const chapters = await ensureToc(book)
      const index = Number.isFinite(chapterIndex) ? Math.trunc(chapterIndex) : Number(book.progress?.chapterIndex ?? 0)
      const chapter = chapters[index]
      if (chapter === undefined) {
        return { skipped: 'no-chapter', reported: false }
      }

      const localPercent = Number.isFinite(percent) ? Number(percent) : Number(book.progress?.percent ?? 0)
      const cloudPercent = Number(book.remote?.percent ?? 0)
      // 云端是全书百分比 0–100，本地 progress.percent 是 0–1 的章内比例，
      // 换算成全书百分比再比，否则「只前进」这条闸永远误判。
      const total = Math.max(1, chapters.length)
      const localWhole = Math.max(0, Math.min(100, (index + Math.max(0, Math.min(1, localPercent))) / total * 100))
      const elapsed = Math.max(0, Math.trunc(Number(seconds) || 0))

      if (cloudPercent > localWhole + 0.5) {
        // 云端更靠后：只补时长，不动位置。位置用云端自己的，等于原地续时长。
        const at = chapters.find((item) => Number(item.chapterId) === Number(book.remote?.chapterUid ?? 0)) ?? chapter
        const payload = await provider.reportProgress({
          book,
          chapter: at,
          percent: cloudPercent / 100,
          seconds: elapsed,
        })
        await store.patchBook(book.id, { lastReportAt: Date.now() })
        return {
          reported: true,
          progressKept: true,
          cloudPercent,
          localWhole,
          elapsed,
          succ: payload?.succ === 1 || payload?.succ === true,
        }
      }

      const payload = await provider.reportProgress({
        book,
        chapter,
        percent: localWhole / 100,
        seconds: elapsed,
      })
      await store.patchBook(book.id, { lastReportAt: Date.now() })
      return {
        reported: true,
        progressKept: false,
        cloudPercent,
        localWhole,
        elapsed,
        succ: payload?.succ === 1 || payload?.succ === true,
      }
    },

    /* ── 笔记 ─────────────────────────────────────────────────── */

    async notes(options = {}) {
      return {
        items: await notes.list({
          bookId: options.bookId,
          query: options.query,
          tag: options.tag,
          limit: options.limit,
        }),
        tags: await notes.tags(),
      }
    },

    async notesAdd(input) {
      return { note: await notes.add(input) }
    },

    async notesEdit({ id, patch }) {
      const note = await notes.edit(String(id ?? ''), patch ?? {})
      if (note === null) throw new ProviderError('NOTFOUND', '没有这条笔记。')
      return { note }
    },

    async notesRemove({ id }) {
      return { removed: await notes.remove(String(id ?? '')) }
    },

    /* ── AI ───────────────────────────────────────────────────── */

    /**
     * 提问。**支持多轮**：传回上一轮返回的 `sessionId` 就是追问。
     *
     * `scope` 决定给模型多少上下文：
     * - `selection`（默认）：选段前后的窗口，最省 token，也最贴「这段话什么意思」。
     * - `chapter`：整章正文。原来面板只能看见 4000 字，于是「这一章在讲什么」根本问不出来。
     * - `book`：目录 + 读者在这本书里的笔记，用于「这本书的主线」「我之前记过什么」。
     */
    async ask(input) {
      const bookId = String(input.bookId ?? '')
      let book = null
      if (bookId !== '') {
        book = await store.getBook(bookId)
      }
      const scope = input.scope === 'chapter' || input.scope === 'book' ? input.scope : 'selection'
      let contextWindow = ''
      const index = Number(input.chapterIndex)
      if (book !== null && Number.isFinite(index)) {
        if (scope === 'chapter') {
          try {
            const loaded = await loadChapter(book.id, index)
            contextWindow = blocksToText(loaded.blocks).slice(0, CHAPTER_CHAR_BUDGET)
          } catch {
            // 拿不到整章不该阻断提问，退化成「只回答这段」。
          }
        } else if (scope === 'book') {
          try {
            const own = await notes.list({ bookId: book.id, limit: 40 })
            const lines = (Array.isArray(own) ? own : [])
              .map((note) => {
                const where = String(note.chapterTitle ?? '').trim()
                const body = String(note.note ?? '').trim() || String(note.quote ?? '').trim()
                if (body === '') return ''
                return where === '' ? `· ${body.slice(0, 200)}` : `· 〔${where}〕${body.slice(0, 200)}`
              })
              .filter(Boolean)
            contextWindow = lines.join('\n')
          } catch {
            // 笔记读不到就只靠目录回答。
          }
        } else {
          if (String(input.quote ?? '') !== '') {
            try {
              const loaded = await loadChapter(book.id, index)
              contextWindow = buildContextWindow(loaded.blocks, input.quote, { before: 6, after: 6 })
            } catch {
              // 上下文拿不到不该阻断提问，模型退化成「只回答这段」。
            }
          }
        }
      }
      let toc = []
      if (book !== null && (scope === 'book' || input.withToc === true || input.sessionId === undefined)) {
        const record = await store.readBookFile(book.id)
        toc = (record?.chapters ?? []).map((chapter) => String(chapter.title ?? ''))
      }
      const result = await ai.ask({
        ...input,
        scope,
        bookTitle: input.bookTitle ?? book?.title,
        chapterTitle: input.chapterTitle,
        contextWindow,
        toc,
      })
      return result
    },

    async askReset({ sessionId }) {
      return ai.reset(sessionId)
    },

    /* ── 搜索 ─────────────────────────────────────────────────── */

    /**
     * 全书架正文搜索。
     *
     * 只搜书名和作者是不够的——真正想找的往往是「正文里写过什么」。
     * 这里遍历本地已缓存的章节块；没缓存的书会提示「还没读过」，而不是假装没结果。
     */
    async search({ query, limit }) {
      const needle = String(query ?? '').trim()
      if (needle === '') return { hits: [], scanned: 0, skipped: 0 }
      const { shelf } = await store.snapshot()
      const max = Math.min(200, Math.max(1, Number(limit) || 40))
      const hits = []
      let scanned = 0
      let skipped = 0
      const lower = needle.toLowerCase()
      for (const summary of shelf) {
        if (hits.length >= max) break
        const record = await store.readBookFile(summary.id)
        if (record === null) {
          skipped += 1
          continue
        }
        let found = false
        for (const chapter of record.chapters ?? []) {
          if (!Array.isArray(chapter.blocks)) continue
          scanned += 1
          for (let position = 0; position < chapter.blocks.length; position += 1) {
            const block = chapter.blocks[position]
            const text = String(block?.x ?? '')
            if (text === '' || !text.toLowerCase().includes(lower)) continue
            const from = Math.max(0, text.toLowerCase().indexOf(lower) - 40)
            hits.push({
              bookId: summary.id,
              bookTitle: summary.title,
              chapterIndex: chapter.index,
              chapterTitle: chapter.title,
              blockIndex: position,
              snippet: text.slice(from, from + 160),
            })
            found = true
            if (hits.length >= max) break
          }
          if (hits.length >= max) break
        }
        if (!found && (record.chapters ?? []).every((chapter) => !Array.isArray(chapter.blocks))) skipped += 1
      }
      return { hits, scanned, skipped }
    },

    /** 书架文本搜索（书名/作者），用于书架上方的即时过滤。 */
    async searchShelf({ query }) {
      const needle = String(query ?? '').trim().toLowerCase()
      const { shelf } = await store.snapshot()
      if (needle === '') return { books: shelf.map((book) => ({ ...book, percent: bookPercentOf(book) })) }
      return {
        books: shelf
          .filter((book) => `${book.title}\n${book.author}`.toLowerCase().includes(needle))
          .map((book) => ({ ...book, percent: bookPercentOf(book) })),
      }
    },

    /* ── 导出 ─────────────────────────────────────────────────── */

    async exportNotes({ bookId }) {
      const items = await notes.list({ bookId })
      const book = bookId === undefined ? null : await store.getBook(String(bookId))
      return { markdown: notesToMarkdown(items, { bookTitle: book?.title }) }
    },

    async exportShelf() {
      const { shelf } = await store.snapshot()
      return { markdown: shelfToMarkdown(shelf) }
    },

    /* ── 诊断 ─────────────────────────────────────────────────── */

    async diag() {
      const snapshot = await store.snapshot()
      const notesCount = (await notes.list()).length
      return {
        storage: snapshot.storage,
        books: snapshot.shelf.length,
        notes: notesCount,
        totalReadSeconds: snapshot.stats.seconds,
        wereadConnected: String((await store.providerRecord('weread')).cookie ?? '') !== '',
        node: process.version,
      }
    },
  }

  return { storageDir: store.storageDir, service, logger }
}
