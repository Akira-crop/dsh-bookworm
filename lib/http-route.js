/**
 * HTTP 面：`/bookworm/api/*` → 服务层方法。
 *
 * 为什么保留 HTTP 而不是 `host.call`：静态 client 插件（`window.__ModuleLoader__.load`）
 * 拿不到 `host` 符号，它只存在于 cordis 动态客户端半。所以界面侧统一走同源 fetch，
 * 这里把路由表压到最短。
 */
import { PREFIX } from './api.js'
import { ProviderError } from './http.js'

const MAX_BODY_BYTES = 2 * 1024 * 1024

/**
 * 路由表：`<方法> <路径>` → service 方法名。
 *
 * 参数全部从 JSON body 里取（GET 允许 query string），handler 只做「解析 → 调服务 →
 * 包一层 {ok}」。业务逻辑一律不在这里，这样 Agent 的 tool 和 UI 走的是同一份实现。
 */
const ROUTES = {
  'GET state': 'state',
  'POST settings': 'saveSettings',

  'GET weread/status': 'wereadStatus',
  'POST weread/login': 'wereadLogin',
  'POST weread/logout': 'wereadLogout',
  'POST weread/sync': 'syncShelf',
  'POST weread/qr-start': 'qrStart',
  'GET weread/qr-status': 'qrStatus',
  'GET weread/browse': 'browse',
  'GET weread/search': 'searchStore',
  'POST weread/open': 'openFromStore',
  'POST weread/apikey': 'setApiKey',
  'GET weread/notebooks': 'notebooks',
  'GET weread/stats': 'cloudStats',
  'GET weread/cloud-bookmarks': 'cloudBookmarks',
  'GET weread/notes-search': 'searchNotes',
  'GET weread/notes-overview': 'notesOverview',

  'GET book': 'book',
  'GET chapter': 'chapter',
  'POST progress': 'progress',
  'POST progress/report': 'reportProgress',
  'POST finished': 'finished',
  'DELETE book': 'removeBook',
  'GET bookmarks': 'bookmarks',

  'GET notes': 'notes',
  'POST notes': 'notesAdd',
  'PATCH notes': 'notesEdit',
  'DELETE notes': 'notesRemove',

  'POST ask': 'ask',
  'POST ask/reset': 'askReset',

  'GET search': 'search',
  'GET search/shelf': 'searchShelf',

  'GET export/notes': 'exportNotes',
  'GET export/shelf': 'exportShelf',
  'GET diag': 'diag',
}

/** query string → 普通对象；同名多值取最后一个，够用。 */
function queryOf(url) {
  const params = {}
  for (const [key, value] of url.searchParams) params[key] = value
  return params
}

function coerce(params) {
  const next = { ...params }
  // query string 里一切都是字符串，这里把明显是数字的字段转回来。
  for (const key of ['bookId', 'query', 'tag', 'limit', 'index', 'chapterIndex', 'percent', 'seconds', 'uid', 'id']) {
    const value = next[key]
    if (typeof value !== 'string') continue
    if (['limit', 'index', 'chapterIndex', 'percent', 'seconds'].includes(key)) {
      const parsed = Number(value)
      if (Number.isFinite(parsed)) next[key] = parsed
    }
  }
  if (next.finished === 'true') next.finished = true
  if (next.finished === 'false') next.finished = false
  // 跨书搜索的两个开关也要转，否则 query string 里的 "false" 会被当成真值。
  if (next.refresh === 'true') next.refresh = true
  if (next.refresh === 'false') next.refresh = false
  for (const key of ['budgetMs']) {
    const value = next[key]
    if (typeof value !== 'string') continue
    const parsed = Number(value)
    if (Number.isFinite(parsed)) next[key] = parsed
  }
  return next
}

async function readJson(request) {
  const length = Number(request.headers.get('content-length') ?? 0)
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) {
    throw new ProviderError('BADREQ', '请求体太大了。')
  }
  const text = await request.text()
  if (text.trim() === '') return {}
  try {
    const parsed = JSON.parse(text)
    return parsed !== null && typeof parsed === 'object' ? parsed : {}
  } catch {
    throw new ProviderError('BADREQ', '请求体不是合法 JSON。')
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}

function fail(code, message, status = 400) {
  return json({ ok: false, code, error: message }, status)
}

/**
 * 流式提问：`POST ask` 带 `stream: true` 时走 SSE。
 *
 * 必须一边收一边写出去——收完再返回的话，用户要对着白屏等半分钟，
 * 长回答的体感完全不同。思考过程的增量也一并转发，等待期就不是空白了。
 */
function streamAsk(service, params, logger) {
  const encoder = new TextEncoder()
  return new Response(
    new ReadableStream({
      async start(controller) {
        const send = (event, data) => {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
        }
        try {
          const result = await service.ask({
            ...params,
            onDelta: (text) => send('delta', { text }),
            /* 思考过程单独走一个事件名。前端能因此显示「它正在想什么」，
               而不是在首字到达前干等 80 秒。 */
            onReasoning: (text) => send('reasoning', { text }),
          })
          send('done', {
            sessionId: result?.sessionId ?? '',
            provider: result?.provider ?? '',
            model: result?.model ?? '',
            turns: result?.turns ?? 0,
          })
        } catch (error) {
          const message = error?.message ?? String(error)
          if (String(error?.code ?? '') !== 'AI') logger?.warn?.('[bookworm] ask failed: %s', message)
          send('error', { code: String(error?.code ?? 'INTERNAL'), error: message })
        } finally {
          controller.close()
        }
      },
    }),
    {
      status: 200,
      headers: {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-store',
        connection: 'keep-alive',
      },
    },
  )
}

/**
 * 建路由 handler。`/bookworm/api` 之后的部分按 ROUTES 匹配。
 */
export function createHandler({ service, logger }) {
  return async function handle(request) {
    const url = new URL(request.url, 'http://127.0.0.1')
    const tail = url.pathname.slice(`${PREFIX}/api`.length).replace(/^\/+/, '')
    const method = request.method.toUpperCase()
    const name = ROUTES[`${method} ${tail}`]

    if (name === undefined) {
      // 只报存在的方法，方便排查前端写错路径。
      const allowed = Object.keys(ROUTES)
        .filter((key) => key.endsWith(` ${tail}`))
        .map((key) => key.split(' ')[0])
      if (allowed.length > 0) return fail('METHOD', `这个接口只接受 ${allowed.join(' / ')}。`, 405)
      return fail('NOTFOUND', `没有这个接口：${method} ${tail}`, 404)
    }

    const fn = service[name]
    if (typeof fn !== 'function') return fail('INTERNAL', `服务缺少方法 ${name}。`, 500)

    try {
      let params = coerce(queryOf(url))
      if (method !== 'GET' && method !== 'HEAD') {
        params = { ...params, ...(await readJson(request)) }
      }
      // 流式分支要在调用前拦，别把 onDelta 丢给 JSON 序列化。
      if (name === 'ask' && params.stream === true) {
        delete params.stream
        return streamAsk(service, params, logger)
      }
      delete params.stream
      const value = await fn.call(service, params)
      return json({ ok: true, ...(value ?? {}) })
    } catch (error) {
      const code = String(error?.code ?? 'INTERNAL')
      const message = error?.message ?? String(error)
      const status = code === 'AUTH' ? 401 : code === 'NOTFOUND' ? 404 : code === 'BADREQ' ? 400 : 500
      if (status >= 500) logger?.warn?.('[bookworm] %s failed: %s', name, message)
      return fail(code, message, status)
    }
  }
}
