/**
 * 给 Agent 用的工具。
 *
 * 只往 UI 注入 slot 是不够的——那样 Harness 的 Agent 完全看不见书架，
 * 在对话框里问「《置身事内》第三章讲什么」它答不了。
 * 这里把服务层的读能力直接暴露成工具，Agent 与 UI 走同一份实现。
 *
 * 命名用 `bookworm_` 前缀，与 dsh-weread 的 `weread_*` 不冲突（两者可以共存：
 * weread 走官方 gateway，书蠹走 Cookie + 本地正文缓存）。
 */

/** 统一的结果壳：`text` 给模型读，`json` 给程序读。 */
const OUTPUT = {
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['text', 'json'],
    properties: {
      text: { type: 'string' },
      json: { type: 'string' },
    },
  },
  render(_args, value) {
    return [{ type: 'text', text: value.text }]
  },
}

function result(text, data) {
  return { text, json: JSON.stringify(data ?? null) }
}

function clip(text, limit = 120) {
  const value = String(text ?? '').replace(/\s+/g, ' ').trim()
  return value.length > limit ? `${value.slice(0, limit)}…` : value
}

function minutesOf(seconds) {
  const total = Math.round((Number(seconds) || 0) / 60)
  if (total < 60) return `${total} 分钟`
  return `${(total / 60).toFixed(1)} 小时`
}

/** 注册全部工具。名字被占用时跳过而不是抛错——不能让一个工具冲突拖垮整个插件。 */
export function registerTools(ctx, service) {
  const disposers = []
  try {
    for (const definition of defineTools(service)) {
      const dispose = registerIfFree(ctx, definition)
      if (typeof dispose === 'function') disposers.push(dispose)
    }
  } catch (error) {
    ctx.logger?.warn?.('[bookworm] tool registration failed: %s', error?.message ?? error)
  }
  return () => {
    for (const dispose of disposers) dispose()
  }
}

function registerIfFree(ctx, definition) {
  try {
    const existing =
      typeof ctx.tools.get === 'function'
        ? ctx.tools.get(definition.name)
        : typeof ctx.tools.has === 'function' && ctx.tools.has(definition.name)
    if (existing) {
      ctx.logger?.info?.('[bookworm] skip tool %s: already registered', definition.name)
      return () => {}
    }
  } catch {
    // 判断不了就直接尝试注册。
  }
  try {
    return ctx.tools.register(definition, {})
  } catch (error) {
    ctx.logger?.warn?.('[bookworm] skip tool %s: %s', definition.name, error?.message ?? error)
    return () => {}
  }
}

function defineTools(service) {
  return [
    /* ── 书架 ─────────────────────────────────────────────────── */
    {
      name: 'bookworm_shelf',
      description:
        '列出书蠹书架上的书（来自用户的微信读书账号），含本地进度、按书的累计阅读时长、微信读书云端进度。当用户问「我书架上有哪些书」「我最近在读什么」「哪本书读得最多」时使用。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          query: { type: 'string', description: '按书名或作者过滤，可省略。' },
          status: { type: 'string', enum: ['reading', 'finished', 'all'], description: '默认 all。' },
          limit: { type: 'integer', description: '最多返回多少本，默认 30，上限 200。' },
        },
      },
      output: OUTPUT,
      isConcurrencySafe: () => true,
      async execute(args) {
        const { books } = await service.searchShelf({ query: args?.query })
        const status = args?.status ?? 'all'
        const filtered = books.filter((book) =>
          status === 'finished' ? book.finished === true : status === 'reading' ? book.finished !== true : true,
        )
        const limit = Number.isFinite(args?.limit) ? Math.max(1, Math.min(200, args.limit)) : 30
        const items = filtered.slice(0, limit)
        if (items.length === 0) {
          return result('书架上没有符合条件的书。如果还没连接微信读书，先在书蠹设置里扫码。', { books: [] })
        }
        const lines = items.map((book, index) => {
          const percent = Number(book.percent) || 0
          const spent = Number(book.readSeconds) || 0
          const remote = Number(book.remote?.percent) || 0
          const bits = [`${index + 1}. 《${book.title || '未命名'}》`, book.author || '—']
          bits.push(`进度 ${percent}%`)
          if (spent > 0) bits.push(`本书读了 ${minutesOf(spent)}`)
          if (remote > 0 && percent === 0) bits.push(`微信读书 ${Math.round(remote)}%`)
          if (book.notes > 0) bits.push(`${book.notes} 条笔记`)
          bits.push(book.finished ? '已读完' : '在读')
          return bits.join(' · ')
        })
        const total = Math.round(books.reduce((sum, book) => sum + (Number(book.readSeconds) || 0), 0))
        lines.push('', `共 ${books.length} 本，本地累计阅读 ${minutesOf(total)}。`)
        return result(lines.join('\n'), { books: items, total })
      },
    },

    /* ── 正文搜索 ─────────────────────────────────────────────── */
    {
      name: 'bookworm_search',
      description:
        '在书蠹本地已缓存的书籍正文里做全文搜索，返回书名、章节、命中片段。当用户问「我在哪本书里看到过某个观点/某句话」时使用。只能搜到已经读过的章节。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['query'],
        properties: {
          query: { type: 'string', description: '要搜的原文关键词。' },
          limit: { type: 'integer', description: '最多返回多少条命中，默认 20。' },
        },
      },
      output: OUTPUT,
      isConcurrencySafe: () => true,
      async execute(args) {
        const query = String(args?.query ?? '').trim()
        if (query === '') return result('没有给出要搜索的关键词。', { hits: [] })
        const found = await service.search({ query, limit: Number(args?.limit) || 20 })
        if (found.hits.length === 0) {
          return result(
            `没有在已缓存的正文里找到「${query}」。共扫描 ${found.scanned} 章${found.skipped > 0 ? `，另有 ${found.skipped} 本书还没读过（正文未缓存）` : ''}。`,
            found,
          )
        }
        const lines = found.hits.map(
          (hit, index) =>
            `${index + 1}. 《${hit.bookTitle}》第 ${hit.chapterIndex + 1} 章 · ${hit.chapterTitle}\n   …${clip(hit.snippet, 200)}…`,
        )
        return result(
          `在 ${found.scanned} 章里找到 ${found.hits.length} 处「${query}」：\n\n${lines.join('\n')}`,
          found,
        )
      },
    },

    /* ── 读某一章 ─────────────────────────────────────────────── */
    {
      name: 'bookworm_chapter',
      description:
        '读出书蠹里某一章的正文（按需从微信读书拉取并缓存）。用于回答「这一章讲了什么」「帮我总结第三章」这类问题。章节较长时分页返回，用 offset 取下一段。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['bookId', 'chapterIndex'],
        properties: {
          bookId: { type: 'string', description: '书名或书架里的书 id 都行；传书名时按书名匹配。' },
          chapterIndex: { type: 'integer', description: '章序号，从 0 开始。' },
          offset: { type: 'integer', description: '从第几个块开始取，默认 0。' },
          limit: { type: 'integer', description: '本次最多取多少块，默认 60。' },
        },
      },
      output: OUTPUT,
      isConcurrencySafe: () => true,
      async execute(args) {
        const wanted = String(args?.bookId ?? '').trim()
        if (wanted === '') return result('没有给出 bookId 或书名。', { ok: false })
        // 允许传书名：Agent 更常拿到的是书名而不是内部 id。
        let bookId = wanted
        if (!wanted.startsWith('bk_')) {
          const { books } = await service.searchShelf({ query: wanted })
          if (books.length === 0) return result(`书架上没有《${wanted}》。`, { ok: false })
          bookId = books[0].id
        }
        const index = Number(args?.chapterIndex) || 0
        const loaded = await service.chapter({ bookId, index })
        const offset = Math.max(0, Number(args?.offset) || 0)
        const limit = Math.max(1, Math.min(200, Number(args?.limit) || 60))
        const slice = loaded.blocks.slice(offset, offset + limit)
        const next = offset + slice.length
        const lines = slice.map((block) => {
          if (block.t === 'hr') return '—'
          if (block.t === 'img') return '[插图]'
          if (block.t === 'h') return `## ${block.x}`
          if (block.t === 'q') return `> ${block.x}`
          if (block.t === 'li') return `- ${block.x}`
          return block.x
        })
        const tail =
          next < loaded.blocks.length
            ? `\n\n（还有 ${loaded.blocks.length - next} 段，用 offset=${next} 继续）`
            : ''
        return result(`《${loaded.title}》\n\n${lines.join('\n\n')}${tail}`, {
          title: loaded.title,
          total: loaded.blocks.length,
          offset,
          next,
          blocks: slice,
        })
      },
    },

    /* ── 划线 ─────────────────────────────────────────────────── */
    {
      name: 'bookworm_highlights',
      description:
        '取一本书的划线（高亮）与想法，数据来自用户的微信读书账号。当用户问「我在这本书里划过哪些句子」时使用。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['bookId'],
        properties: {
          bookId: { type: 'string', description: '书名或书架里的书 id。' },
          limit: { type: 'integer', description: '最多返回多少条，默认 40。' },
        },
      },
      output: OUTPUT,
      isConcurrencySafe: () => true,
      async execute(args) {
        const wanted = String(args?.bookId ?? '').trim()
        if (wanted === '') return result('没有给出 bookId 或书名。', { ok: false })
        let bookId = wanted
        if (!wanted.startsWith('bk_')) {
          const { books } = await service.searchShelf({ query: wanted })
          if (books.length === 0) return result(`书架上没有《${wanted}》。`, { ok: false })
          bookId = books[0].id
        }
        const data = await service.bookmarks({ bookId })
        const limit = Math.max(1, Math.min(200, Number(args?.limit) || 40))
        const flat = []
        for (const chapter of data.chapters ?? []) {
          for (const mark of chapter.highlights ?? []) {
            flat.push({ kind: '划线', chapterTitle: chapter.chapterTitle, text: mark.text })
            if (flat.length >= limit) break
          }
          for (const thought of chapter.thoughts ?? []) {
            const body = thought.content ? thought.content : `（针对「${thought.abstract ?? ''}」的想法）`
            flat.push({ kind: '想法', chapterTitle: chapter.chapterTitle, text: body })
            if (flat.length >= limit) break
          }
          if (flat.length >= limit) break
        }
        if (flat.length === 0) return result('这本书在微信读书里还没有划线或想法。', data)
        const source = data.source === 'gateway' ? '' : '（来自浏览器缓存，可能不全；配置 API Key 可拿全量）'
        return result(
          `共 ${data.highlightCount ?? flat.length} 条划线、${data.thoughtCount ?? 0} 条想法${source}\n` +
            flat.map((mark, index) => `${index + 1}. [${mark.kind}] ${clip(mark.text, 200)}${mark.chapterTitle ? `（${mark.chapterTitle}）` : ''}`).join('\n'),
          { count: data.count, highlightCount: data.highlightCount, thoughtCount: data.thoughtCount, items: flat },
        )
      },
    },

    /* ── 笔记 ─────────────────────────────────────────────────── */
    {
      name: 'bookworm_notes',
      description:
        '读或写书蠹的读书笔记。action=list 列出笔记（可按书、关键词、标签过滤）；action=add 新增一条。当用户问「我的笔记」「记一下这句话」时使用。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['action'],
        properties: {
          action: { type: 'string', enum: ['list', 'add'], description: 'list 或 add。' },
          bookId: { type: 'string', description: '书 id 或书名，可省略（list 时表示全部）。' },
          query: { type: 'string', description: 'list 时的关键词。' },
          tag: { type: 'string', description: 'list 时按标签过滤。' },
          quote: { type: 'string', description: 'add 时的引文。' },
          note: { type: 'string', description: 'add 时的笔记正文。' },
          chapterIndex: { type: 'integer', description: 'add 时所属章序号。' },
          tags: { type: 'array', items: { type: 'string' }, description: 'add 时的标签。' },
          limit: { type: 'integer', description: 'list 时最多返回多少条，默认 30。' },
        },
      },
      output: OUTPUT,
      isConcurrencySafe: () => true,
      async execute(args) {
        const action = args?.action === 'add' ? 'add' : 'list'
        if (action === 'add') {
          const quote = String(args?.quote ?? '').trim()
          const note = String(args?.note ?? '').trim()
          if (quote === '' && note === '') return result('这条笔记既没有引文也没有正文，不写。', { ok: false })
          let bookId = String(args?.bookId ?? '').trim()
          let bookTitle = ''
          if (bookId !== '' && !bookId.startsWith('bk_')) {
            const { books } = await service.searchShelf({ query: bookId })
            if (books.length > 0) {
              bookTitle = books[0].title
              bookId = books[0].id
            }
          }
          const created = await service.notesAdd({
            bookId,
            bookTitle,
            chapterIndex: Number(args?.chapterIndex) || 0,
            quote,
            note,
            tags: Array.isArray(args?.tags) ? args.tags : [],
            mode: 'note',
          })
          return result(`已记下一条笔记${quote !== '' ? `：${clip(quote, 60)}` : ''}。`, created)
        }

        let bookId = String(args?.bookId ?? '').trim()
        if (bookId !== '' && !bookId.startsWith('bk_')) {
          const { books } = await service.searchShelf({ query: bookId })
          bookId = books.length > 0 ? books[0].id : bookId
        }
        const data = await service.notes({
          bookId: bookId === '' ? undefined : bookId,
          query: args?.query,
          tag: args?.tag,
          limit: Number(args?.limit) || 30,
        })
        if (data.items.length === 0) return result('还没有笔记。', data)
        const lines = data.items.map((note, index) => {
          const where = note.chapterTitle ? `《${note.bookTitle || '—'}》${note.chapterTitle}` : `《${note.bookTitle || '—'}》`
          const body = [note.quote ? `> ${clip(note.quote, 100)}` : '', note.note ? clip(note.note, 200) : '']
            .filter(Boolean)
            .join('\n   ')
          const tags = Array.isArray(note.tags) && note.tags.length > 0 ? ` 〔${note.tags.join(' ')}〕` : ''
          return `${index + 1}. ${where}${tags}\n   ${body}`
        })
        return result(`${lines.join('\n\n')}\n\n共 ${data.items.length} 条。`, data)
      },
    },
    /* ── 跨书搜索云端笔记 ─────────────────────────────────────── */
    {
      name: 'bookworm_search_notes',
      description:
        '跨书搜索用户在微信读书里做过的划线与想法（云端）。当用户说「我好像在哪本书里划过关于某个话题的句子」「帮我找找关于 X 的划线」「我写过什么关于 X 的想法」时使用。注意：需要配置 API Key；首轮会按预算增量扫描，结果可能不完整，返回里的 remaining 表示还有多少本没扫。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['query'],
        properties: {
          query: { type: 'string', description: '要搜的关键词，支持中英文。' },
          limit: { type: 'integer', description: '最多返回多少条，默认 30。' },
          budgetMs: { type: 'integer', description: '本次最多花多少毫秒拉数据，默认 8000，上限 30000。' },
          refresh: { type: 'boolean', description: '是否强制重新拉取（忽略本地缓存），默认 false。' },
        },
      },
      output: OUTPUT,
      isConcurrencySafe: () => true,
      async execute(args) {
        const query = String(args?.query ?? '').trim()
        if (query === '') return result('没有给出搜索词。', { ok: false })
        const data = await service.searchNotes({
          query,
          limit: Number(args?.limit) || 30,
          budgetMs: Number(args?.budgetMs) || 8000,
          refresh: args?.refresh === true,
        })
        if (data.hits.length === 0) {
          return result(
            data.partial
              ? `在已扫描的 ${data.scanned}/${data.total} 本书里没有找到「${query}」，还有 ${data.remaining} 本没扫（可加大 budgetMs 或再问一次继续）。`
              : `微信读书的划线里没有找到「${query}」。`,
            data,
          )
        }
        const lines = data.hits.map((hit, index) => {
          const where = `《${hit.bookTitle || '—'}》${hit.chapterTitle ? ` · ${hit.chapterTitle}` : ''}`
          const kind = hit.kind === 'thought' ? '想法' : '划线'
          return `${index + 1}. [${kind}] ${clip(hit.text || hit.abstract, 180)}\n   ${where}`
        })
        const notes = []
        if (data.truncated) notes.push(`结果被条数上限截断，只给出最近的 ${data.hitCount} 条（可以调大 limit 或换更具体的词）`)
        if (data.partial) notes.push(`已扫描 ${data.scanned}/${data.total} 本，还有 ${data.remaining} 本没扫，结果可能不完整`)
        const tail = notes.length > 0 ? `\n\n（${notes.join('；')}）` : ''
        return result(`找到 ${data.hitCount} 条关于「${query}」的笔记：\n\n${lines.join('\n\n')}${tail}`, data)
      },
    },

    /* ── 云端笔记概览 ─────────────────────────────────────────── */
    {
      name: 'bookworm_notes_overview',
      description:
        '微信读书云端笔记的全景：多少本书有笔记、总共有多少划线/想法/书签、笔记最多的书。当用户问「我的笔记都散在哪些书里」「我一共划了多少线」时使用。',
      parameters: { type: 'object', additionalProperties: false, required: [], properties: {} },
      output: OUTPUT,
      isConcurrencySafe: () => true,
      async execute() {
        const data = await service.notesOverview()
        const top = (data.books ?? [])
          .slice(0, 12)
          .map((book, index) => {
            const parts = []
            if (book.noteCount > 0) parts.push(`${book.noteCount} 划线`)
            if (book.reviewCount > 0) parts.push(`${book.reviewCount} 想法`)
            if (book.bookmarkCount > 0) parts.push(`${book.bookmarkCount} 书签`)
            return `${index + 1}. 《${book.title || '—'}》${parts.length > 0 ? ` — ${parts.join('、')}` : ''}`
          })
        return result(
          `微信读书云端笔记：${data.bookCount} 本书，共 ${data.total} 条（${data.highlightCount} 划线、${data.thoughtCount} 想法、${data.bookmarkCount} 书签）。\n\n笔记最多的书：\n${top.join('\n')}`,
          data,
        )
      },
    },
  ]
}
