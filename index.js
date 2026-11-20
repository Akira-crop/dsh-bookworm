/**
 * 问书（wenshu）Host 半：把服务层挂到 webServer 上，并把能力登记成 Agent 工具。
 *
 * 两处出口共用 `createApi()` 返回的同一个 `service` 实例：
 *   1. `/wenshu/api/*` —— 给插件自己的界面用（同源 fetch）
 *   2. `wenshu_*` 工具 —— 给 Harness 里的 Agent 用
 *
 * 这正是「灯下」缺的那一半：它只往 UI 注入 slot，Agent 完全看不见书架。
 */
import { createApi, PREFIX } from './lib/api.js'
import { createHandler } from './lib/http-route.js'
import { registerTools } from './lib/tools.js'

export const name = 'wenshu'
export const inject = ['webServer', 'tools']

/** 把 Node 的 IncomingMessage 转成 Web Request，交给统一 handler。 */
function toRequest(req, body) {
  const url = `http://127.0.0.1${req.url ?? '/'}`
  const method = String(req.method ?? 'GET').toUpperCase()
  if (method === 'GET' || method === 'HEAD') return new Request(url, { method })
  return new Request(url, {
    method,
    headers: { 'content-type': String(req.headers?.['content-type'] ?? 'application/json') },
    body,
  })
}

/** 从 Node 的 ServerResponse 发回一个 Web Response。 */
async function writeResponse(res, response) {
  res.statusCode = response.status
  for (const [key, value] of response.headers) res.setHeader(key, value)
  // SSE 之类的流式响应不能先缓冲：`arrayBuffer()` 会等整个回答生成完，
  // 那就等于没流式。有 body 流就逐块转发，顺带每次 write 都触发 flush。
  if (response.body !== null && typeof response.body?.getReader === 'function') {
    // 先把响应头推给浏览器，否则它会把整个 SSE 缓冲到流结束。
    res.flushHeaders?.()
    const reader = response.body.getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (value !== undefined) res.write(Buffer.from(value))
    }
    res.end()
    return
  }
  const buffer = Buffer.from(await response.arrayBuffer())
  res.setHeader('content-length', String(buffer.length))
  res.end(buffer)
}

export function apply(ctx, config = {}) {
  const api = createApi({ ctx, config: config ?? {} })
  const handle = createHandler({ service: api.service, logger: ctx.logger })

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'prefix',
        path: PREFIX,
        handler: async (req, res) => {
          try {
            const chunks = []
            if (req.method !== 'GET' && req.method !== 'HEAD') {
              for await (const chunk of req) chunks.push(chunk)
            }
            const request = toRequest(req, Buffer.concat(chunks))
            const response = await handle(request)
            await writeResponse(res, response)
          } catch (error) {
            ctx.logger?.warn?.('[wenshu] request failed: %s', error?.message ?? error)
            if (!res.headersSent) res.statusCode = 500
            res.setHeader('content-type', 'application/json; charset=utf-8')
            res.end(JSON.stringify({ ok: false, code: 'INTERNAL', error: String(error?.message ?? error) }))
          }
        },
      }),
    'wenshu: http routes',
  )

  ctx.effect(() => registerTools(ctx, api.service), 'wenshu: agent tools')

  ctx.logger?.info?.('[wenshu] serving %s/api (data: %s)', PREFIX, api.storageDir)
}
