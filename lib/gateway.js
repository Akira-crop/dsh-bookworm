/**
 * 微信读书官方 Agent Gateway 客户端。
 *
 * 一个端点承载所有官方能力，靠请求体里的 `api_name` 区分；业务参数平铺在顶层，
 * 和 `skill_version` 同级。API Key 是用户绑定的（wrk- 开头），不需要传 vid。
 *
 * 为什么需要它：Cookie 走的 `/web/book/bookmarklist` 拿不到完整的划线/想法数据，
 * 官方网关才有 `/user/notebooks`、`/book/bookmarklist`、`/review/list/mine`。
 *
 * 参考：https://github.com/Tencent/WeChatReading (skills/*.md)
 */

const GATEWAY_URL = 'https://i.weread.qq.com/api/agent/gateway'

/** 官方 skill 版本。每次请求都要带上。 */
const SKILL_VERSION = '1.0.6'
const DEFAULT_TIMEOUT_MS = 25000

/** 携带稳定错误码的网关/传输失败。 */
export class WereadGatewayError extends Error {
  constructor(code, message, details) {
    super(message)
    this.name = 'WereadGatewayError'
    this.code = code
    this.details = details ?? {}
  }
}

/** 值是否像官方签发的 `wrk-…` key。 */
export function looksLikeApiKey(value) {
  return typeof value === 'string' && /^wrk-[\w-]{4,}$/.test(value.trim())
}

/** 展示用的脱敏形式。 */
export function maskSecret(value) {
  if (typeof value !== 'string' || value.length === 0) return undefined
  if (value.length <= 8) return `${value.slice(0, 2)}${'*'.repeat(Math.max(value.length - 2, 0))}`
  return `${value.slice(0, 4)}…${value.slice(-4)}`
}

function withDeadline(signal, timeoutMs) {
  const deadline = AbortSignal.timeout(timeoutMs)
  if (signal === undefined || signal === null) return deadline
  return AbortSignal.any([signal, deadline])
}

export class WereadGateway {
  /**
   * @param options.getApiKey - 每次调用现读，保存后立刻生效。
   * @param options.logger - 用于升级提示。
   */
  constructor({ getApiKey, logger, getTimeoutMs } = {}) {
    this.getApiKey = getApiKey ?? (() => '')
    this.logger = logger
    this.getTimeoutMs = getTimeoutMs ?? (() => DEFAULT_TIMEOUT_MS)
    this.upgradeInfo = undefined
  }

  hasKey() {
    return looksLikeApiKey(this.getApiKey())
  }

  /** 调一个网关端点；业务参数平铺在 body 顶层。 */
  async call(apiName, params = {}, signal) {
    const apiKey = String(this.getApiKey() ?? '').trim()
    if (apiKey === '') {
      throw new WereadGatewayError('weread/no-api-key', '还没有配置微信读书 API Key。')
    }
    const body = { api_name: apiName, skill_version: SKILL_VERSION, ...params }
    let response
    try {
      response = await fetch(GATEWAY_URL, {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: withDeadline(signal, this.getTimeoutMs()),
      })
    } catch (error) {
      if (error?.name === 'TimeoutError') {
        throw new WereadGatewayError('weread/timeout', `微信读书网关请求超时（${apiName}）。`)
      }
      if (signal?.aborted === true) throw error
      throw new WereadGatewayError('weread/network', `无法连接微信读书网关：${error?.message ?? String(error)}`)
    }
    if (!response.ok) {
      const text = await response.text().catch(() => '')
      let reported
      try { reported = JSON.parse(text) } catch { reported = undefined }
      const errmsg = reported?.errmsg ?? reported?.errMsg
      if (response.status === 401 || reported?.errcode === -2013) {
        throw new WereadGatewayError(
          'weread/bad-api-key',
          `微信读书鉴权失败（${errmsg ?? 'API Key 无效'}）。请重新领取并填入 API Key。`,
          { status: response.status, errcode: reported?.errcode },
        )
      }
      throw new WereadGatewayError(
        `weread/http-${response.status}`,
        `微信读书网关返回 HTTP ${response.status}${errmsg !== undefined ? `：${errmsg}` : ''}`,
        { status: response.status, errcode: reported?.errcode },
      )
    }
    let payload
    try { payload = await response.json() } catch {
      throw new WereadGatewayError('weread/bad-json', '微信读书网关返回了无法解析的响应。')
    }
    if (payload !== null && typeof payload === 'object' && payload.upgrade_info !== undefined) {
      this.upgradeInfo = payload.upgrade_info
      this.logger?.warn?.('[bookworm] 官方 skill 需要升级：%s', payload.upgrade_info?.message ?? JSON.stringify(payload.upgrade_info))
    }
    const errcode = payload?.errcode ?? payload?.errCode
    if (typeof errcode === 'number' && errcode !== 0) {
      throw new WereadGatewayError(
        `weread/errcode-${errcode}`,
        payload?.errmsg ?? payload?.errMsg ?? `微信读书返回错误码 ${errcode}`,
        { errcode },
      )
    }
    return payload
  }

  /** 所有有笔记的书，游标分页。 */
  notebooks(count = 20, lastSort, signal) {
    return this.call('/user/notebooks', { count, ...(lastSort === undefined ? {} : { lastSort }) }, signal)
  }

  /** 单本划线（官方接口自动过滤 type=0 书签）。 */
  bookmarks(bookId, signal) {
    return this.call('/book/bookmarklist', { bookId }, signal)
  }

  /** 单本个人想法/点评（注意参数名是小写 bookid）。 */
  myReviews(bookid, count = 100, synckey, signal) {
    return this.call('/review/list/mine', { bookid, count, ...(synckey === undefined ? {} : { synckey }) }, signal)
  }

  /**
   * 某一章的划线热度：每条只给 range 和人数，不给划线文本。
   * 之所以先问它，是因为书友想法必须挂在具体 range 上，而全书 range 有几千条，
   * 只有这几百条「真的被人划过」的 range 才可能有想法。
   */
  underlines(bookId, chapterUid, signal) {
    return this.call('/book/underlines', { bookId, chapterUid }, signal)
  }

  /**
   * 给定 range 列表，拿这些划线下面的书友想法（每条约 20 条上限）。
   * reviews 必须是对象数组；传字符串会被判参数格式错误。一次最多 20 个 range。
   */
  readReviews(bookId, chapterUid, reviews, signal) {
    return this.call('/book/readreviews', { bookId, chapterUid, reviews }, signal)
  }

  /** 全书热门划线，带划线原文和人数，用来在书架上先给个「这本书有多热」。 */
  bestBookmarks(bookId, chapterUid, signal) {
    return this.call('/book/bestbookmarks', {
      bookId,
      ...(chapterUid === undefined ? {} : { chapterUid }),
    }, signal)
  }

  /** 官方章节列表，含 wordCount，可用来剔除封面/版权页这类非正文条目。 */
  chapterInfo(bookId, signal) {
    return this.call('/book/chapterinfo', { bookId }, signal)
  }

  /** 微信读书官方阅读统计（周/月/年/总），mode: weekly|monthly|annually|overall。 */
  readdata(mode = 'monthly', baseTime, signal) {
    return this.call('/readdata/detail', {
      mode,
      ...(baseTime === undefined ? {} : { baseTime }),
    }, signal)
  }

  /** 服务端声明的全部接口，便于排查能力变化。 */
  listEndpoints(signal) {
    return this.call('/_list', {}, signal)
  }
}

/**
 * 把 /readdata/detail 的原始回包归一成 UI 好用的形状。
 * 原始 readTimes/dailyReadTimes 是 { unix秒: 秒数 } 的对象，读Stat 是 [{stat,counts}]，
 * preferBooks 里 bookInfo 才含书名封面。这里统统摊平，字段缺失给安全默认。
 */
export function normalizeReadData(payload, mode = 'monthly') {
  const readTimesMap = payload?.readTimes ?? {}
  const dailyMap = payload?.dailyReadTimes ?? {}
  const toTrend = (map) => Object.entries(map)
    .map(([ts, seconds]) => ({ ts: Number(ts), seconds: Number(seconds) || 0 }))
    .sort((a, b) => a.ts - b.ts)

  const stats = (Array.isArray(payload?.readStat) ? payload.readStat : [])
    .map((row) => ({ stat: String(row?.stat ?? ''), counts: String(row?.counts ?? '') }))
    .filter((row) => row.stat !== '')

  const preferBooks = (Array.isArray(payload?.preferBooks) ? payload.preferBooks : [])
    .map((row) => {
      const info = row?.bookInfo ?? row?.book ?? {}
      return {
        type: Number(row?.type ?? 0),
        title: String(row?.title ?? ''),
        reason: String(row?.reason ?? ''),
        bookId: String(info.bookId ?? ''),
        bookTitle: String(info.title ?? ''),
        author: String(info.author ?? ''),
        cover: String(info.cover ?? ''),
      }
    })
    .filter((book) => book.bookTitle !== '' || book.title !== '')

  const medals = (Array.isArray(payload?.medals) ? payload.medals : [])
    .map((row) => ({
      name: String(row?.name ?? row?.title ?? ''),
      title: String(row?.styleTitle ?? row?.title ?? ''),
      desc: String(row?.styleDesc ?? row?.hint ?? ''),
      rankText: String(row?.rankText ?? ''),
      atime: Number(row?.atime ?? 0),
    }))
    .filter((medal) => medal.name !== '')

  const preferCategories = (Array.isArray(payload?.preferCategory) ? payload.preferCategory : [])
    .map((row) => ({
      title: String(row?.categoryTitle ?? row?.parentCategoryTitle ?? ''),
      readingTime: Number(row?.readingTime ?? 0),
      readingCount: Number(row?.readingCount ?? 0),
      val: Number(row?.val ?? 0),
    }))
    .filter((row) => row.title !== '')

  const preferAuthors = (Array.isArray(payload?.preferAuthor) ? payload.preferAuthor : [])
    .map((row) => ({ name: String(row?.name ?? ''), count: Number(row?.count ?? 0), readTime: String(row?.readTime ?? '') }))
    .filter((row) => row.name !== '')

  return {
    source: 'gateway',
    mode: String(mode),
    totalReadTime: Number(payload?.totalReadTime ?? 0),
    readDays: Number(payload?.readDays ?? 0),
    dayAverageReadTime: Number(payload?.dayAverageReadTime ?? 0),
    wrReadTime: Number(payload?.wrReadTime ?? 0),
    wrListenTime: Number(payload?.wrListenTime ?? 0),
    readRate: Number(payload?.readRate ?? 0),
    compare: Number(payload?.compare ?? 0),
    preferCategoryWord: String(payload?.preferCategoryWord ?? ''),
    preferTimeWord: String(payload?.preferTimeWord ?? ''),
    stats,
    trend: toTrend(readTimesMap),
    daily: Object.keys(dailyMap).length > 0 ? toTrend(dailyMap) : [],
    medals,
    preferBooks,
    preferCategories,
    preferAuthors,
    preferTime: Array.isArray(payload?.preferTime) ? payload.preferTime.map((v) => Number(v) || 0) : [],
  }
}

/**
 * 把官方网关的划线 + 想法两份 payload 合并成统一结构：
 *   { count, highlightCount, thoughtCount, chapters:[{chapterUid, chapterTitle, highlights:[...], thoughts:[...]}] }
 * 与 provider 里 cookie 版的 normalizeBookmarks 输出兼容，UI 只认这一个形状。
 */
export function mergeNotesPayload(markPayload, reviewPayload) {
  const chapterTitles = new Map()
  for (const chapter of Array.isArray(markPayload?.chapters) ? markPayload.chapters : []) {
    chapterTitles.set(String(chapter.chapterUid), String(chapter.title ?? ''))
  }

  const chapters = new Map()
  const ensure = (uid) => {
    const key = String(uid ?? 0)
    if (!chapters.has(key)) {
      chapters.set(key, {
        chapterUid: key,
        chapterTitle: chapterTitles.get(key) ?? '',
        highlights: [],
        thoughts: [],
      })
    }
    return chapters.get(key)
  }

  let highlightCount = 0
  for (const raw of Array.isArray(markPayload?.updated) ? markPayload.updated : []) {
    const text = String(raw?.markText ?? raw?.text ?? '').replace(/\s+/g, ' ').trim()
    if (text === '') continue
    const uid = raw?.chapterUid ?? 0
    const entry = ensure(uid)
    if (entry.chapterTitle === '') entry.chapterTitle = String(raw?.chapterTitle ?? raw?.title ?? '')
    entry.highlights.push({
      chapterUid: String(uid),
      chapterTitle: entry.chapterTitle,
      text,
      createTime: Number(raw?.createTime ?? 0),
      style: Number(raw?.colorStyle ?? raw?.style ?? 0),
      range: String(raw?.range ?? ''),
    })
    highlightCount++
  }

  let thoughtCount = 0
  const reviews = Array.isArray(reviewPayload?.reviews) ? reviewPayload.reviews : []
  for (const wrapper of reviews) {
    const raw = wrapper?.review ?? wrapper
    if (raw === undefined || raw === null) continue
    const content = String(raw?.content ?? '').replace(/\s+/g, ' ').trim()
    const abstract = String(raw?.abstract ?? '').replace(/\s+/g, ' ').trim()
    if (content === '' && abstract === '') continue
    const uid = raw?.chapterUid ?? 0
    const entry = ensure(uid)
    if (entry.chapterTitle === '') entry.chapterTitle = String(raw?.chapterName ?? raw?.chapterTitle ?? '')
    entry.thoughts.push({
      chapterUid: String(uid),
      chapterTitle: entry.chapterTitle,
      content,
      abstract,
      range: String(raw?.range ?? ''),
      createTime: Number(raw?.createTime ?? 0),
      star: Number(raw?.star ?? -1),
      reviewId: String(raw?.reviewId ?? ''),
      isFinish: raw?.isFinish === true || raw?.isFinish === 1,
    })
    thoughtCount++
  }

  const ordered = [...chapters.values()].sort((a, b) => Number(a.chapterUid) - Number(b.chapterUid))
  for (const chapter of ordered) {
    chapter.highlights.sort((a, b) => a.createTime - b.createTime)
    chapter.thoughts.sort((a, b) => a.createTime - b.createTime)
  }
  return {
    source: 'gateway',
    count: highlightCount + thoughtCount,
    highlightCount,
    thoughtCount,
    chapters: ordered,
  }
}
