/**
 * 读书 AI：不只是「划词解释」，而是一个能追问、看得见上下文的陪读。
 *
 * 灯下的实现每次只发**一条** user 消息，prompt 里只有 4000 字选段，
 * 而且 `for await` 收完才返回。于是三件事做不了：追问、读懂上下文、边想边说。
 * 这里逐条补上：
 *
 * 1. **上下文窗口**：从选段在章内的位置向两侧取若干块，连同章名、书名、
 *    目录一起给模型。问「这段在反驳什么」时它知道上一段在说什么。
 * 2. **多轮**：会话留在内存里（`sessionId` 为键），追问沿用同一串 messages。
 * 3. **流式**：`onDelta` 每收到一段就回调，前端可以边出字边滚动。
 */
import { ProviderError } from './http.js'

const SYSTEM = [
  '你是「书蠹」阅读器里的读书伙伴。读者正在读一本书，随时会问你问题。',
  '用中文回答，直接、具体、有信息量；不要复述原文，不要客套。',
  '如果问题涉及书的上下文，优先依据给你的原文与目录判断，不要凭空补写书里没有的情节。',
  '不确定的地方就说「不确定」，不要编造出处或页码。',
  '允许你先说结论再展开；篇幅按需，一般不超过 400 字，除非读者要求详细。',
].join('\n')

/** 会话最长保留时间：一小时没动静就丢掉，避免内存里堆着整本书的对话。 */
const SESSION_TTL_MS = 60 * 60 * 1000
/** 单个会话最多保留的轮数（一问一答算两轮），超出后从最早的成对消息开始丢。 */
const MAX_TURNS = 24
/**
 * 单次生成的 token 上限。原来写死 1600，实测对推理型模型完全不够：
 * 它先把预算烧在思考上，正文还没开始就撞上限，返回空串（finish: max-tokens）。
 * 实测 1600 → 2/5 失败，2400 仍 → 3/5 失败，推理开销远大于答案本身。
 * 8000 才稳稳够它想完再写那 400 字；回答长度仍由 SYSTEM 里的字数要求约束，
 * 所以抬高的只是「思考的余地」，不是「啰嗦的余地」。
 */
const MAX_TOKENS = 8000
/**
 * 单次生成的墙钟上限。原来写死 180 秒，实测**成功的请求也要 86–140 秒**
 * （推理模型先想很久），于是大量请求卡在 180 秒边界上被自己人 abort 掉，
 * 报出来的却是「模型没有返回内容」——看起来像模型不干活，其实是预算太紧。
 * 放到 300 秒，给思考留出余量。
 */
const REQUEST_TIMEOUT_MS = 300_000

const MODE_INSTRUCTION = {
  explain: '请解释这段：它在说什么、关键概念指什么、有没有隐含前提或言外之意。',
  expand: '请补充这段的背景：典故或出处、相关人物与事件、它可能引用的文本、值得延伸阅读的方向。',
  ask: '',
}

/**
 * 提问范围。原来是「只有划中的那一段」，于是「这一章在讲什么」「这本书的主线」
 * 这类最自然的问题反而问不出来——面板只能看见 4000 字。
 */
const SCOPES = ['selection', 'chapter', 'book']

const SCOPE_HINT = {
  selection: '读者选中了书里的一段文字，问题围绕这段。',
  chapter: '读者问的是当前这一章的整体，下面是这一章的正文，请基于全文回答。',
  book: '读者问的是整本书。你拿到的是目录（章节名）与读者已有的笔记，请据此回答。',
}

function textOf(block) {
  if (block === null || typeof block !== 'object') return ''
  if (block.t === 'hr') return ''
  if (block.t === 'img') return '[插图]'
  const body = String(block.x ?? '').trim()
  if (body === '') return ''
  if (block.t === 'h') return `〔小标题〕${body}`
  if (block.t === 'q') return `〔引文〕${body}`
  if (block.t === 'li') return `· ${body}`
  return body
}

/**
 * 从选段在章内的位置向两侧取块，拼出「上下文窗口」。
 *
 * `anchor` 是选中的原文；找不到精确匹配时退化为「不给上下文」而不是给错上下文
 * ——错位的上下文比没有上下文更糟。
 */
export function buildContextWindow(blocks, anchor, options = {}) {
  const list = Array.isArray(blocks) ? blocks : []
  if (list.length === 0) return ''
  const before = Math.max(0, Math.round(options.before ?? 6))
  const after = Math.max(0, Math.round(options.after ?? 6))
  const needle = String(anchor ?? '').replace(/\s+/g, '').slice(0, 40)
  let index = -1
  if (needle !== '') {
    const flat = needle.slice(0, 24)
    index = list.findIndex((block) => String(block?.x ?? '').replace(/\s+/g, '').includes(flat))
  }
  if (index < 0) {
    // 找不到锚点：给章节开头的一小段，聊胜于无，但不假装是「这段的上下文」。
    const head = list.slice(0, before + after).map(textOf).filter(Boolean)
    return head.length > 0 ? head.join('\n') : ''
  }
  const start = Math.max(0, index - before)
  const end = Math.min(list.length, index + after + 1)
  return list
    .slice(start, end)
    .map((block) => (block === list[index] ? `【读者选中的是这一段】${textOf(block)}` : textOf(block)))
    .filter(Boolean)
    .join('\n')
}

/**
 * 把整章的 block 数组拍平成纯文本。
 *
 * 单独导出来，是因为「问整章」需要它——原来只有 `buildContextWindow`（取选段周围
 * 十几块），于是「这一章在讲什么」这种问题后端根本没有能力回答。
 */
export function blocksToText(blocks) {
  const list = Array.isArray(blocks) ? blocks : []
  return list.map(textOf).filter(Boolean).join('\n')
}

export function createAi({ ctx }) {
  /** sessionId → {messages, updatedAt, bookId} */
  const sessions = new Map()

  function selection() {
    const service = ctx.get('agentDefaultModel')
    const current = service?.currentSelection?.()
    if (current === null || typeof current !== 'object' || !current.provider || !current.model) {
      throw new ProviderError('AI', '还没有可用的默认模型：先在 Harness 里选一个模型。')
    }
    return current
  }

  function prune(now) {
    for (const [key, value] of sessions) {
      if (now - value.updatedAt > SESSION_TTL_MS) sessions.delete(key)
    }
  }

  function sessionOf(sessionId) {
    const key = String(sessionId ?? '')
    if (key === '') return null
    const found = sessions.get(key)
    if (found === undefined) return null
    return found
  }

  /** 首问时把「书的上下文」拼进 user 消息；后续追问只带问题本身。 */
  function composePrompt(input, isFirst) {
    const parts = []
    const scope = SCOPES.includes(input.scope) ? input.scope : 'selection'
    const bookTitle = String(input.bookTitle ?? '').trim()
    const chapterTitle = String(input.chapterTitle ?? '').trim()
    if (bookTitle !== '') parts.push(`书名：《${bookTitle}》`)
    if (chapterTitle !== '') parts.push(`当前章节：${chapterTitle}`)
    if (isFirst) {
      parts.push(SCOPE_HINT[scope])
      const toc = Array.isArray(input.toc) ? input.toc.filter((item) => typeof item === 'string' && item.trim() !== '') : []
      if (toc.length > 0) {
        const preview = toc.slice(0, 60).map((item, index) => `${index + 1}. ${item}`).join('\n')
        parts.push(`目录（可能不全）：\n${preview}`)
      }
      // chapter 范围：后端预取的整章正文；book 范围：读者在这本书里的笔记摘要。
      const window = String(input.contextWindow ?? '').trim()
      if (window !== '') {
        const label = scope === 'book' ? '读者在这本书里的笔记' : '这一章的相关段落'
        parts.push(`${label}：\n${window}`)
      }
    }
    const quote = String(input.quote ?? '').trim()
    if (quote !== '') parts.push(`读者选中/引用的原文：\n${quote.slice(0, 4000)}`)
    const question = String(input.text ?? '').trim()
    if (question !== '') parts.push(isFirst ? question : `读者的追问：${question}`)
    else if (isFirst) parts.push(MODE_INSTRUCTION[input.mode] ?? MODE_INSTRUCTION.explain)
    return parts.join('\n\n')
  }

  /**
   * 跑一次生成。抽出来是为了能「空回答就再跑一次」——
   * 实测推理型模型偶发把整个预算烧在思考上、正文一字未出（finish: max-tokens），
   * 同一条请求立刻重发通常就正常了；这时答案还是空的，重试对读者完全无损。
   *
   * 每次调用都有自己的超时控制器：重试用的是**新的** signal，
   * 否则拿一个已经 abort 的 signal 再发一次，会立刻以 aborted 收场，等于没重试。
   */
  async function generate({ llm, provider, model, messages, onDelta, onReasoning }) {
    let answer = ''
    let failure = null
    let finish = null
    let replayState = undefined
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
      const stream = llm.stream({
        provider,
        model,
        system: SYSTEM,
        messages,
        maxTokens: MAX_TOKENS,
        temperature: 0.5,
        signal: controller.signal,
      })
      for await (const chunk of stream) {
        /* 思考过程也往外传。推理型模型要先想几十秒才吐正文，
           这段时间里前端只能干等；把 reasoning-delta 转出去，
           界面就能显示「正在想：……」而不是一个死掉的白框。 */
        if (chunk?.type === 'reasoning-delta' && typeof chunk.text === 'string') {
          if (typeof onReasoning === 'function') onReasoning(chunk.text)
        }
        if (chunk?.type === 'text-delta' && typeof chunk.text === 'string') {
          answer += chunk.text
          if (typeof onDelta === 'function') onDelta(chunk.text)
        }
        if (chunk?.type === 'finish') {
          // 保住 adapter 的 replay envelope，下一轮才能沿用同一份上下文。
          if (chunk.replayState !== undefined) replayState = chunk.replayState
          finish = chunk.reason ?? null
          if (chunk.reason?.kind === 'error') {
            failure = chunk.reason.failure?.message ?? '模型调用失败。'
          }
        }
      }
    } catch (error) {
      failure = error?.message ?? String(error)
    } finally {
      clearTimeout(timer)
    }
    return { answer, failure, finish, replayState }
  }

  return {
    /**
     * 提问。`onDelta(text)` 会在生成过程中反复回调；返回完整答案与 sessionId。
     */
    async ask(input) {
      const llm = ctx.get('llm')
      if (llm === undefined) throw new ProviderError('AI', '当前 profile 没有启用模型服务。')

      const sessionId = String(input.sessionId ?? '').trim()
      const existing = sessionOf(sessionId)
      const isFirst = existing === null
      const question = String(input.text ?? '').trim()
      const quote = String(input.quote ?? '').trim()
      if (isFirst && question === '' && quote === '') {
        throw new ProviderError('BADREQ', '没有选中任何文字，也没有提出问题。')
      }

      const prompt = composePrompt({ ...input, text: question, quote }, isFirst)
      const { provider, model } = selection()

      const history = existing === null ? [] : [...existing.messages]
      const messages = [...history, { role: 'user', content: [{ type: 'text', text: prompt }] }]

      let result = await generate({ llm, provider, model, messages, onDelta: input.onDelta, onReasoning: input.onReasoning })
      /* 空回答重试一次。只在「一个字都没出来」时重试：
         已经出了半句再重来会让读者看到答案突然重置。
         注意 generate() 内部各自持有超时控制器，所以这里是真正的新一次尝试。 */
      if (result.answer.trim() === '' && result.failure === null) {
        result = await generate({ llm, provider, model, messages, onDelta: input.onDelta, onReasoning: input.onReasoning })
      }

      const answer = result.answer
      const failure = result.failure
      const finish = result.finish
      const replayState = result.replayState

      if (answer.trim() === '') {
        /* 「模型没有返回内容」这句话对读者毫无用处，对排查也毫无用处。
           实测最常见的真因是推理型模型把预算全烧在思考上，正文一个字都没轮到。 */
        const kind = finish?.kind ?? ''
        if (failure === null) {
          if (kind === 'length') {
            throw new ProviderError('AI', `模型连续两次都只顾着思考，正文一个字没写（额度 ${MAX_TOKENS} token）。换个简单点的问法，或者在 Harness 里换个小一点的模型。`)
          }
          throw new ProviderError('AI', `模型没有返回内容（结束原因：${kind === '' ? '未收到' : kind}）。`)
        }
        throw new ProviderError('AI', failure)
      }

      // 只把成功的这一轮存进历史：失败的回答不该污染后续追问的上下文。
      const now = Date.now()
      prune(now)
      const key = sessionId !== '' ? sessionId : `ai_${now.toString(36)}${Math.random().toString(36).slice(2, 8)}`
      const current = sessionOf(key)
      // assistant 消息必须带 source（含 provider/model 与 replayState）。
      // 少了它，下一轮请求进 adapter 时会崩在 `message.source.replayState`。
      const nextMessages = [
        ...(current === null ? [] : current.messages),
        { role: 'user', content: [{ type: 'text', text: prompt }] },
        {
          role: 'assistant',
          source: { kind: 'model', provider, model, ...(replayState === undefined ? {} : { replayState }) },
          content: [{ type: 'text', text: answer.trim() }],
        },
      ]
      // 超长就丢掉最早的成对消息，永远保留 system 之外最近的一段。
      const trimmed = nextMessages.length > MAX_TURNS ? nextMessages.slice(nextMessages.length - MAX_TURNS) : nextMessages
      sessions.set(key, {
        messages: trimmed,
        updatedAt: now,
        bookId: String(input.bookId ?? current?.bookId ?? ''),
        turns: Math.floor(trimmed.length / 2),
      })

      return {
        answer: answer.trim(),
        provider,
        model,
        sessionId: key,
        turns: Math.floor(trimmed.length / 2),
        degraded: failure !== null,
      }
    },

    /** 开一段新对话：前端点「新话题」时调用，或在切换书籍时自动调用。 */
    reset(sessionId) {
      if (sessionId === undefined) {
        sessions.clear()
        return { cleared: true }
      }
      return { cleared: sessions.delete(String(sessionId)) }
    },

    /** 会话摘要，用于前端显示「已追问 N 轮」。 */
    info(sessionId) {
      const found = sessionOf(sessionId)
      if (found === null) return null
      return { sessionId: String(sessionId), turns: found.turns ?? 0, updatedAt: found.updatedAt, bookId: found.bookId }
    },
  }
}
