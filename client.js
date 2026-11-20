/**
 * 书蠹（bookworm）界面。
 *
 * 只做一件事：把微信读书的书读好，并且随时能问 AI。
 *
 * 相比「灯下」去掉的：本地文件导入、GitHub 书库、PDF/EPUB 解析、番茄小说、书城广场。
 * 换来的：结构化正文（标题/引文/列表/图片）、流式多轮 AI、微信读书划线、
 * 全书架正文搜索、按书阅读时长、可编辑带标签的笔记。
 *
 * 所有颜色都走宿主的 `--dsw-alias-*` 变量，所以深浅色自动跟随。
 */
window.__ModuleLoader__.load({
  id: 'dsh-bookworm',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useState, useEffect, useRef, useMemo, useCallback } = React

    const NS = 'bookworm'
    const API = '/bookworm/api'
    const FLUSH_MS = 5000
    const SAVE_SETTINGS_DELAY = 600

    const DEFAULT_SETTINGS = {
      theme: 'follow',
      fontFamily: 'serif',
      fontSize: 19,
      lineHeight: 1.9,
      measure: 42,
      mode: 'scroll',
      justify: true,
      chromeAutoHide: true,
      dailyGoalSeconds: 1800,
      askMode: 'explain',
    }

    /* ── 文案 ─────────────────────────────────────────────────── */

    const ZH = {
      'app.title': '书蠹',
      'app.subtitle': '微信读书 + 随时发问',
      'nav.shelf': '书架',
      'nav.notes': '笔记',
      'nav.stats': '统计',
      'nav.settings': '设置',

      'shelf.search': '搜书名、作者，或书里的任意一句话',
      'shelf.filter.all': '全部',
      'shelf.filter.reading': '在读',
      'shelf.filter.finished': '读完',
      'shelf.sort.recent': '最近',
      'shelf.sort.added': '加入',
      'shelf.sort.title': '书名',
      'shelf.empty': '书架还是空的',
      'shelf.emptyHint': '连上微信读书，174 本书和你的阅读进度会一次同步过来。',
      'shelf.connect': '连接微信读书',
      'shelf.minutes': '{n} 分钟',
      'shelf.hours': '{n} 小时',
      'shelf.notes': '{n} 条笔记',
      'shelf.percent': '{n}%',
      'shelf.continue': '继续读',
      'shelf.resume': '接着上次读',
      'shelf.stat.books': '本书',
      'shelf.stat.weread': '微信读书',
      'shelf.stat.local': '本书架',
      'shelf.searchHits': '书里 {n} 处提到「{q}」',
      'shelf.searchNone': '书里没有找到「{q}」',
      'shelf.searchSkipped': '还有 {n} 本没读过正文，搜不到',

      'reader.back': '书架',
      'reader.toc': '目录',
      'reader.notes': '笔记',
      'reader.settings': '排版',
      'reader.prev': '上一章',
      'reader.next': '下一章',
      'reader.finish': '读完',
      'reader.finished': '已读完',
      'reader.loading': '正在取这一章…',
      'reader.chapter': '第 {i}/{n} 章',
      'reader.page': '{a}/{b}',
      'reader.highlights': '划线与想法',
      'reader.noHighlights': '这本书在微信读书里还没有划线或想法。',
      'reader.thought': '想法',
      'reader.thoughtOn': '针对「{q}」',
      'reader.highlightsFromCache': '来自浏览器缓存，可能不全。配置 API Key 可拿全量划线与想法。',
      'reader.jumpToChapter': '跳到这一章',
      'reader.jumpMiss': '书蠹里还没有这本书的目录，取到目录后就能跳了。',

      'ai.title': '问 AI',
      'ai.ask': '问 AI',
      'ai.explain': '解释',
      'ai.expand': '补充背景',
      'ai.note': '记笔记',
      'ai.placeholder': '接着问…',
      'ai.send': '发送',
      'ai.thinking': '正在想…',
      'ai.thinkingSeconds': ' 已等 {n}s',
      'ai.reasoning': '它的思考过程',
      'ai.stop': '停止',
      'ai.reset': '新对话',
      'ai.copy': '复制',
      'ai.save': '存为笔记',
      'ai.close': '关闭',
      'ai.saved': '已存为笔记',
      'ai.needModel': '还没有可用的默认模型，先在 Harness 里选一个。',
      'ai.scope.selection': '这段话',
      'ai.scope.chapter': '这一章',
      'ai.scope.book': '整本书',
      'ai.scopeHint.selection': '围绕你选中的文字回答。',
      'ai.scopeHint.chapter': '把整章正文交给 AI，适合问「这一章在讲什么」。',
      'ai.scopeHint.book': '给 AI 目录和你在这本书里的笔记，适合问主线与回顾。',
      'ai.empty': '选一段文字点「解释」，或直接在下面提问。',
      'ai.autoSaved': '已自动存入笔记',
      'ai.clearQuote': '不用这段引用',
      'ai.enterHint': 'Enter 发送 · Shift+Enter 换行',
      'ai.turnCount': '第 {n} 轮',
      'ai.expandPanel': '在大页面里继续这段对话',

      'ask.title': '和书聊',
      'ask.sub': '离开正文也能接着问：选一本你在读的书，之前问过的会串起来。',
      'ask.noBook': '不指定书，随便聊聊',
      'ask.openBook': '打开这本书',
      'ask.tab': '对话',

      'notes.title': '读书笔记',
      'notes.empty': '还没有笔记',
      'notes.emptyHint': '在正文里划一句，点「问 AI」或「记笔记」。',
      'notes.search': '搜引文、笔记、标签',
      'notes.allTags': '全部标签',
      'notes.edit': '编辑',
      'notes.save': '保存',
      'notes.cancel': '取消',
      'notes.delete': '删除',
      'notes.tags': '标签，逗号分隔',
      'notes.jump': '跳到正文',
      'notes.export': '导出 Markdown',
      'notes.exportBook': '导出本书',
      'notes.quoteOnly': '（只存了引文）',
      'notes.sourceLocal': '书蠹笔记',
      'notes.sourceCloud': '微信读书',
      'notes.cloudHint': '微信读书云端的划线与想法，共 {n} 本书 · {m} 条笔记',
      'notes.cloudSearch': '搜书名 / 作者',
      'notes.cloudSort': '排序',
      'notes.sortNotes': '按笔记数',
      'notes.sortTitle': '按书名',
      'notes.sortRecent': '按最近阅读',
      'notes.cloudLoading': '正在读取微信读书笔记本…',
      'notes.cloudNoKey': '在「设置」里配置官方 API Key 后，就能在这里看到微信读书云端的全部划线与想法。',
      'notes.cloudError': '读取失败：{e}',
      'notes.hlCount': '划线 {n}',
      'notes.thCount': '想法 {n}',
      'notes.bmCount': '书签 {n}',
      'notes.offShelf': '不在书架',
      'notes.noToc': '目录待补',
      'notes.offShelfHint': '这本书在微信读书里有笔记，但还没同步到书蠹书架，暂时没有正文可跳。回到书架刷新一次就会带下来。',
      'notes.noTocHint': '书已经在书架里了，打开时书蠹会自动补上目录，划线位置可以照常定位。',
      'notes.cloudEmpty': '这本书还没有划线或想法',
      'notes.cloudExpand': '展开划线与想法',
      'notes.cloudCollapse': '收起',
      'notes.cloudLoadMore': '点书名展开划线与想法',
      'notes.abstractLabel': '原文',
      'notes.thoughtLabel': '想法',
      'notes.highlightLabel': '划线',
      'notes.scopeTitle': '按书浏览',
      'notes.scopeContent': '搜内容',
      'notes.searchContentPlaceholder': '搜一句话，比如「习惯」',
      'notes.searchContentGo': '搜索',
      'notes.searchContentHint': '想不起那句话在哪本书？直接搜内容，会去微信读书云端逐本找。',
      'notes.searchingHint': '正在逐本翻微信读书的划线…',
      'notes.searchResultSummary': '「{q}」找到 {n} 条 · 已翻 {s}/{a} 本',
      'notes.searchPartial': '还有 {n} 本没翻完，再搜一次会接着找。',
      'notes.searchTruncated': '只列出最近的 {n} 条，用更具体的词能收窄范围。',
      'notes.searchNoHit': '这几本里没有匹配的划线，换个词试试。',

      'stats.title': '阅读统计',
  'stats.pageSub': '书蠹自己记的时间和微信读书官方数据分开统计，互不干扰',
      'stats.today': '今天',
      'stats.week': '最近七天',
      'stats.total': '累计',
      'stats.streak': '连续',
      'stats.days': '天',
      'stats.books': '读完',
      'stats.goal': '今日目标',
      'stats.goalDone': '今日目标已达成',
      'stats.byBook': '按书统计',
      'stats.noBookData': '还没有按书的阅读记录，打开一本书读几分钟就有。',
      'stats.wereadTotal': '微信读书累计',
      'stats.wereadTotalHint': '这些时长来自微信读书云端，书蠹只读取，不回写',
      'stats.cloudTitle': '微信读书官方统计',
      'stats.cloudSub': '来自你的微信读书账号 · 书蠹只读取，不回写',
      'stats.period': '统计周期',
      'stats.weekly': '本周',
      'stats.monthly': '本月',
      'stats.annually': '今年',
      'stats.overall': '总计',
      'stats.readTime': '阅读时长',
      'stats.listenTime': '听书时长',
      'stats.readDays': '阅读天数',
      'stats.dayAverage': '日均时长',
      'stats.compare': '环比',
      'stats.readRate': '阅读效率',
      'stats.trend': '阅读趋势',
      'stats.noKey': '在「设置」里配置官方 API Key，就能看到微信读书的完整统计。',
      'stats.cloudError': '统计读取失败：{e}',
      'stats.preferCategory': '偏好类别',
      'stats.preferAuthor': '偏好作者',
      'stats.preferBooks': '我的书单',
      'stats.medals': '勋章墙',
      'stats.favLabel': '我的最爱',
      'stats.recentLabel': '近期偏爱',
      'stats.oftenLabel': '常读常新',
      'stats.noMedals': '本期暂无勋章',
      'stats.daysUnit': '天',
      'stats.booksUnit': '本',

      'settings.title': '设置',
      'settings.weread': '微信读书',
      'settings.wereadDesc': '扫码登录，或在下面粘贴 Cookie。书蠹只读取你的书架、进度和划线，不回写。',
      'settings.apiKey': '官方 API Key（划线与想法）',
      'settings.apiKeyDesc': '微信读书官方 Skill 的 Key（wrk- 开头）。配置后能读到完整的划线、想法和笔记本，浏览器 Cookie 方式拿不到这些。',
      'settings.apiKeyLink': '去领取 Key',
      'settings.apiKeyPlaceholder': 'wrk-…',
      'settings.apiKeySave': '保存 Key',
      'settings.apiKeyClear': '清空 Key',
      'settings.apiKeyOn': '已配置：{k}',
      'settings.apiKeyOff': '未配置（划线走浏览器缓存，可能不全）',
      'settings.apiKeySaved': 'API Key 已保存',
      'settings.credCookie': '登录态（Cookie / 扫码）',
      'settings.credCookieOk': '在用。书架、阅读进度、统计正常工作。',
      'settings.credCookieOff': '未登录。书架、进度、统计都读不到，先扫码登录。',
      'settings.credCookieExpired': '已失效（常见于手机上改过密码或退出登录）。书架和进度会停更，扫码重登即可恢复，数据不会丢。',
      'settings.credKey': '官方 API Key',
      'settings.credKeyOk': '已配置。云端划线、想法、笔记本、跨书搜索都能用。',
      'settings.credKeyOff': '未配置。划线只能走浏览器缓存，可能不全；笔记本和跨书搜索用不了。',
      'settings.apiKeyCleared': '已清空 API Key，划线回落到浏览器缓存。',
      'settings.qr': '扫码登录',
      'settings.qrWaiting': '用微信扫描二维码',
      'settings.qrScanning': '扫到了，正在确认…',
      'settings.qrSyncing': '登录成功，正在同步书架…',
      'settings.qrDone': '已连接',
      'settings.qrError': '登录失败',
      'settings.qrRefresh': '刷新二维码',
      'settings.cookie': '或者粘贴 Cookie',
      'settings.cookiePlaceholder': 'wr_vid=…; wr_skey=…',
      'settings.cookieSave': '保存并同步',
      'settings.sync': '同步书架',
      'settings.syncing': '正在同步…',
      'settings.synced': '同步完成：新增 {a} 本，更新 {u} 本',
      'settings.logout': '断开连接',
      'settings.connected': '已连接',
      'settings.notConnected': '未连接',
      'settings.expired': '登录已失效，重新扫码',
      'settings.reading': '阅读',
      'settings.goal': '每日目标',
      'settings.goalUnit': '分钟',
      'settings.askMode': '划词默认动作',
      'settings.data': '数据',
      'settings.exportShelf': '导出书架',
      'settings.exportNotes': '导出全部笔记',
      'settings.storage': '数据位置',
      'settings.pending': '等 host 提供接口',
      'settings.theme': '纸张',
      'settings.font': '字体',
      'settings.size': '字号',
      'settings.lineHeight': '行距',
      'settings.measure': '每行字数',
      'settings.mode': '翻页',
      'settings.justify': '两端对齐',
      'settings.autoHide': '工具条自动隐藏',
      'theme.follow': '跟随界面',
      'theme.paper': '纸白',
      'theme.sepia': '米黄',
      'theme.ink': '夜墨',
      'theme.moss': '护眼',
      'theme.night': '深夜',
      'font.serif': '宋体',
      'font.sans': '黑体',
      'font.kai': '楷体',
      'mode.scroll': '滚动',
      'mode.paged': '分页',

      'common.retry': '重试',
      'common.loading': '加载中…',
      'common.confirm': '确定',
      'common.cancel': '取消',
      'common.close': '关闭',
      'common.error': '出错了',
      'common.minute': '分钟',
      'common.hour': '小时',
      'common.day': '天',
      'boot.failed': '书蠹没能启动',
      'boot.hint': '把下面这段贴给我。',
    }

    const EN = {
      'app.title': 'Bookworm',
      'app.subtitle': 'WeRead, with a tutor on call',
      'nav.shelf': 'Shelf',
      'nav.notes': 'Notes',
      'nav.stats': 'Stats',
      'nav.settings': 'Settings',

      'shelf.search': 'Search titles, authors, or any sentence in your books',
      'shelf.filter.all': 'All',
      'shelf.filter.reading': 'Reading',
      'shelf.filter.finished': 'Finished',
      'shelf.sort.recent': 'Recent',
      'shelf.sort.added': 'Added',
      'shelf.sort.title': 'Title',
      'shelf.empty': 'Your shelf is empty',
      'shelf.emptyHint': 'Connect WeRead and your books arrive with their reading progress.',
      'shelf.connect': 'Connect WeRead',
      'shelf.minutes': '{n} min',
      'shelf.hours': '{n} h',
      'shelf.notes': '{n} notes',
      'shelf.percent': '{n}%',
      'shelf.continue': 'Continue',
      'shelf.resume': 'Pick up where you left off',
      'shelf.stat.books': 'books',
      'shelf.stat.weread': 'WeRead',
      'shelf.stat.local': 'Here',
      'shelf.searchHits': '{n} matches for “{q}”',
      'shelf.searchNone': 'Nothing in your books for “{q}”',
      'shelf.searchSkipped': '{n} books have no cached text yet',

      'reader.back': 'Shelf',
      'reader.toc': 'Contents',
      'reader.notes': 'Notes',
      'reader.settings': 'Type',
      'reader.prev': 'Previous',
      'reader.next': 'Next',
      'reader.finish': 'Mark read',
      'reader.finished': 'Finished',
      'reader.loading': 'Fetching this chapter…',
      'reader.chapter': 'Chapter {i}/{n}',
      'reader.page': '{a}/{b}',
      'reader.highlights': 'Highlights & thoughts',
      'reader.noHighlights': 'No highlights or thoughts in WeRead for this book yet.',
      'reader.thought': 'Thought',
      'reader.thoughtOn': 'On "{q}"',
      'reader.highlightsFromCache': 'From browser cache — may be incomplete. Set an API Key for full highlights and thoughts.',
      'reader.jumpToChapter': 'Jump to this chapter',
      'reader.jumpMiss': 'Bookworm has no table of contents for this book yet; it can jump once the TOC is available.',

      'ai.title': 'Ask AI',
      'ai.ask': 'Ask AI',
      'ai.explain': 'Explain',
      'ai.expand': 'Context',
      'ai.note': 'Note',
      'ai.placeholder': 'Ask a follow-up…',
      'ai.send': 'Send',
      'ai.thinking': 'Thinking…',
      'ai.thinkingSeconds': ' {n}s so far',
      'ai.reasoning': 'How it is thinking',
      'ai.stop': 'Stop',
      'ai.reset': 'New chat',
      'ai.copy': 'Copy',
      'ai.save': 'Save as note',
      'ai.close': 'Close',
      'ai.saved': 'Saved as note',
      'ai.needModel': 'No default model yet — pick one in Harness first.',
      'ai.scope.selection': 'This passage',
      'ai.scope.chapter': 'This chapter',
      'ai.scope.book': 'Whole book',
      'ai.scopeHint.selection': 'Answers about the text you selected.',
      'ai.scopeHint.chapter': 'Sends the whole chapter, so “what is this chapter about?” works.',
      'ai.scopeHint.book': 'Gives the AI the table of contents and your notes on this book.',
      'ai.empty': 'Select a passage and tap Explain, or just ask below.',
      'ai.autoSaved': 'Saved to notes',
      'ai.clearQuote': 'Drop this quote',
      'ai.enterHint': 'Enter to send · Shift+Enter for a new line',
      'ai.turnCount': 'turn {n}',
      'ai.expandPanel': 'Continue this chat on the full page',

      'ask.title': 'Talk to a book',
      'ask.sub': 'Keep asking after you leave the page: pick a book you are reading and earlier turns carry over.',
      'ask.noBook': 'No book — just ask',
      'ask.openBook': 'Open this book',
      'ask.tab': 'Chat',

      'notes.title': 'Notes',
      'notes.empty': 'No notes yet',
      'notes.emptyHint': 'Select a passage and choose Ask AI or Note.',
      'notes.search': 'Search quotes, notes, tags',
      'notes.allTags': 'All tags',
      'notes.edit': 'Edit',
      'notes.save': 'Save',
      'notes.cancel': 'Cancel',
      'notes.delete': 'Delete',
      'notes.tags': 'Tags, comma separated',
      'notes.jump': 'Jump to text',
      'notes.export': 'Export Markdown',
      'notes.exportBook': 'Export this book',
      'notes.quoteOnly': '(quote only)',
      'notes.sourceLocal': 'Bookworm notes',
      'notes.sourceCloud': 'WeRead cloud',
      'notes.cloudHint': 'Your WeRead highlights & thoughts across {n} books · {m} notes',
      'notes.cloudSearch': 'Search title / author',
      'notes.cloudSort': 'Sort',
      'notes.sortNotes': 'By note count',
      'notes.sortTitle': 'By title',
      'notes.sortRecent': 'By recent',
      'notes.cloudLoading': 'Loading WeRead notebooks…',
      'notes.cloudNoKey': 'Add your official API Key in Settings to see all WeRead highlights and thoughts here.',
      'notes.cloudError': 'Failed to load: {e}',
      'notes.hlCount': '{n} highlights',
      'notes.thCount': '{n} thoughts',
      'notes.bmCount': '{n} bookmarks',
      'notes.offShelf': 'Not on shelf',
      'notes.noToc': 'TOC pending',
      'notes.offShelfHint': 'This book has notes in WeRead but is not on the Bookworm shelf yet, so there is no text to jump to. Refresh the shelf once to pull it in.',
      'notes.noTocHint': 'The book is on your shelf; Bookworm will fetch its table of contents when you open it, and the highlight position still resolves.',
      'notes.cloudEmpty': 'No highlights or thoughts in this book yet',
      'notes.cloudExpand': 'Expand highlights & thoughts',
      'notes.cloudCollapse': 'Collapse',
      'notes.cloudLoadMore': 'Tap a title to expand highlights & thoughts',
      'notes.abstractLabel': 'Original',
      'notes.thoughtLabel': 'Thought',
      'notes.highlightLabel': 'Highlight',
      'notes.scopeTitle': 'Browse books',
      'notes.scopeContent': 'Search text',
      'notes.searchContentPlaceholder': 'Search a phrase, e.g. “habit”',
      'notes.searchContentGo': 'Search',
      'notes.searchContentHint': 'Cannot recall which book it was in? Search the text and we will dig through your WeRead highlights.',
      'notes.searchingHint': 'Digging through your WeRead highlights book by book…',
      'notes.searchResultSummary': '{n} hits for “{q}” · scanned {s}/{a} books',
      'notes.searchPartial': '{n} books not scanned yet — search again to keep going.',
      'notes.searchTruncated': 'Showing the most recent {n} only; a more specific word narrows it down.',
      'notes.searchNoHit': 'No matching highlights in the books scanned so far. Try another word.',

      'stats.title': 'Reading stats',
  'stats.pageSub': 'Bookworm’s own timing and WeRead’s official figures are kept separate',
      'stats.today': 'Today',
      'stats.week': 'Last 7 days',
      'stats.total': 'Total',
      'stats.streak': 'Streak',
      'stats.days': 'days',
      'stats.books': 'Finished',
      'stats.goal': 'Daily goal',
      'stats.goalDone': 'Daily goal reached',
      'stats.byBook': 'By book',
      'stats.noBookData': 'No per-book time yet — read a few minutes and it appears.',
      'stats.wereadTotal': 'WeRead total',
      'stats.wereadTotalHint': 'Read from WeRead’s cloud; Bookworm never writes back',
      'stats.cloudTitle': 'WeRead official stats',
      'stats.cloudSub': 'From your WeRead account · Bookworm only reads, never writes back',
      'stats.period': 'Period',
      'stats.weekly': 'This week',
      'stats.monthly': 'This month',
      'stats.annually': 'This year',
      'stats.overall': 'All time',
      'stats.readTime': 'Reading time',
      'stats.listenTime': 'Listening time',
      'stats.readDays': 'Reading days',
      'stats.dayAverage': 'Daily average',
      'stats.compare': 'Change',
      'stats.readRate': 'Read rate',
      'stats.trend': 'Reading trend',
      'stats.noKey': 'Add your official API Key in Settings to see full WeRead stats.',
      'stats.cloudError': 'Failed to load stats: {e}',
      'stats.preferCategory': 'Favorite categories',
      'stats.preferAuthor': 'Favorite authors',
      'stats.preferBooks': 'My books',
      'stats.medals': 'Medals',
      'stats.favLabel': 'Favorites',
      'stats.recentLabel': 'Recently loved',
      'stats.oftenLabel': 'Revisited',
      'stats.noMedals': 'No medals this period',
      'stats.daysUnit': 'days',
      'stats.booksUnit': 'books',

      'settings.title': 'Settings',
      'settings.weread': 'WeRead',
      'settings.wereadDesc': 'Sign in by QR or paste a cookie. Bookworm reads your shelf, progress and highlights only.',
      'settings.apiKey': 'Official API Key (highlights & thoughts)',
      'settings.apiKeyDesc': 'WeRead official Skill key (starts with wrk-). With it, Bookworm reads your full highlights, thoughts and notebooks — browser cookies cannot provide these.',
      'settings.apiKeyLink': 'Get a key',
      'settings.apiKeyPlaceholder': 'wrk-…',
      'settings.apiKeySave': 'Save key',
      'settings.apiKeyClear': 'Clear key',
      'settings.apiKeyOn': 'Configured: {k}',
      'settings.apiKeyOff': 'Not set (highlights fall back to browser cache, may be incomplete)',
      'settings.apiKeySaved': 'API Key saved',
      'settings.credCookie': 'Sign-in (cookie / QR)',
      'settings.credCookieOk': 'Working. Shelf, progress and stats are live.',
      'settings.credCookieOff': 'Not signed in. Shelf, progress and stats are unavailable — scan the QR code to start.',
      'settings.credCookieExpired': 'Expired (usually after changing your password or signing out on the phone). Shelf and progress stop updating; scan again to restore — your data is kept.',
      'settings.credKey': 'Official API Key',
      'settings.credKeyOk': 'Configured. Cloud highlights, thoughts, notebooks and cross-book search all work.',
      'settings.credKeyOff': 'Not set. Highlights fall back to the browser cache (may be incomplete); notebooks and cross-book search are unavailable.',
      'settings.apiKeyCleared': 'API Key cleared; highlights now fall back to browser cache.',
      'settings.qr': 'Sign in with QR',
      'settings.qrWaiting': 'Scan the code with WeChat',
      'settings.qrScanning': 'Scanned, confirming…',
      'settings.qrSyncing': 'Signed in, syncing shelf…',
      'settings.qrDone': 'Connected',
      'settings.qrError': 'Sign-in failed',
      'settings.qrRefresh': 'Refresh code',
      'settings.cookie': 'Or paste a cookie',
      'settings.cookiePlaceholder': 'wr_vid=…; wr_skey=…',
      'settings.cookieSave': 'Save and sync',
      'settings.sync': 'Sync shelf',
      'settings.syncing': 'Syncing…',
      'settings.synced': 'Synced: {a} added, {u} updated',
      'settings.logout': 'Disconnect',
      'settings.connected': 'Connected',
      'settings.notConnected': 'Not connected',
      'settings.expired': 'Session expired, sign in again',
      'settings.reading': 'Reading',
      'settings.goal': 'Daily goal',
      'settings.goalUnit': 'min',
      'settings.askMode': 'Default select action',
      'settings.data': 'Data',
      'settings.exportShelf': 'Export shelf',
      'settings.exportNotes': 'Export all notes',
      'settings.storage': 'Data location',
      'settings.pending': 'waiting for a host API',
      'settings.theme': 'Paper',
      'settings.font': 'Font',
      'settings.size': 'Size',
      'settings.lineHeight': 'Line height',
      'settings.measure': 'Line width',
      'settings.mode': 'Turn pages',
      'settings.justify': 'Justify',
      'settings.autoHide': 'Auto-hide toolbar',
      'theme.follow': 'Follow theme',
      'theme.paper': 'Paper',
      'theme.sepia': 'Sepia',
      'theme.ink': 'Ink',
      'theme.moss': 'Eye-care',
      'theme.night': 'Night',
      'font.serif': 'Serif',
      'font.sans': 'Sans',
      'font.kai': 'Kai',
      'mode.scroll': 'Scroll',
      'mode.paged': 'Paged',

      'common.retry': 'Retry',
      'common.loading': 'Loading…',
      'common.confirm': 'OK',
      'common.cancel': 'Cancel',
      'common.close': 'Close',
      'common.error': 'Something went wrong',
      'common.minute': 'min',
      'common.hour': 'h',
      'common.day': 'days',
      'boot.failed': 'Bookworm failed to start',
      'boot.hint': 'Paste the trace below.',
    }

    /* ── 样式 ─────────────────────────────────────────────────── */

    const CSS = `
.ws-root {
  --ws-paper: var(--dsw-alias-bg-base);
  --ws-ink: var(--dsw-alias-label-primary);
  --ws-ink-soft: var(--dsw-alias-label-secondary);
  --ws-ink-faint: var(--dsw-alias-label-tertiary);
  --ws-line: var(--dsw-alias-border-l1);
  --ws-line-soft: var(--dsw-alias-border-l2);
  --ws-accent: var(--dsw-alias-brand-primary);
  --ws-layer: var(--dsw-alias-bg-layer-1);
  --ws-hover: var(--dsw-alias-interactive-bg-hover);
  --ws-font-size: 19px;
  --ws-line-height: 1.9;
  --ws-measure: 42;
  --ws-gap: 72px;
  /* 内容列宽：宽屏下不让一行文字横跨 1900px，否则标题、榜单、表单全被拉散。
     三个档位对应三类页面，padding 用 max(最小外边距, (可用宽度 - 目标宽度)/2) 实现自动居中，
     不需要额外的包裹层，窄屏也不会被挤坏。 */
  --ws-gutter: 24px;
  --ws-content-wide: 1440px;   /* 书架网格：越多列越好 */
  --ws-content: 1120px;        /* 统计 / 笔记：阅读舒适区 */
  --ws-content-narrow: 820px;  /* 设置：单列表单不能拉太长 */
  --ws-pad-wide: max(var(--ws-gutter), calc((100% - var(--ws-content-wide)) / 2));
  --ws-pad: max(var(--ws-gutter), calc((100% - var(--ws-content)) / 2));
  --ws-pad-narrow: max(var(--ws-gutter), calc((100% - var(--ws-content-narrow)) / 2));
  /* 间距刻度：所有 gap/padding 只从这里取，节奏才稳。 */
  --ws-1: 4px;
  --ws-2: 8px;
  --ws-3: 12px;
  --ws-4: 16px;
  --ws-5: 20px;
  --ws-6: 28px;
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  color: var(--ws-ink);
  background: var(--ws-paper);
  font-size: 14px;
  line-height: 1.6;
  /* 全局 UI 字体栈：中文优先系统黑体，西文走现代无衬线，数字等宽对齐。 */
  font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB",
    "Microsoft YaHei UI", "Microsoft YaHei", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
  /* 纸张纹理强度：0 = 无纹理，1 = 细腻的纤维颗粒。 */
  --ws-grain: 0.5;
}
/* 纸张：全部在宿主底色上做一点点混合，不写死任何颜色，深浅色都能跟。 */
.ws-root[data-theme="paper"] {
  --ws-paper: color-mix(in oklab, var(--dsw-alias-bg-base) 96%, var(--dsw-static-amber-300, #d8c9a8));
  --ws-grain: 0.55;
}
.ws-root[data-theme="sepia"] {
  --ws-paper: color-mix(in oklab, var(--dsw-alias-bg-base) 88%, var(--dsw-static-amber-500, #c9a86a));
  --ws-grain: 0.7;
}
/* 护眼：淡淡的豆沙绿，长时间阅读更柔和。 */
.ws-root[data-theme="moss"] {
  --ws-paper: color-mix(in oklab, var(--dsw-alias-bg-base) 88%, var(--dsw-static-green-200, #b7d7b0));
  --ws-grain: 0.45;
}
.ws-root[data-theme="ink"] {
  --ws-paper: color-mix(in oklab, var(--dsw-alias-bg-base) 82%, #000);
  --ws-ink: color-mix(in oklab, var(--dsw-alias-label-primary) 88%, #fff);
  --ws-grain: 0.25;
}
/* 深夜：接近纯黑的底 + 低对比文字，夜间不刺眼。 */
.ws-root[data-theme="night"] {
  --ws-paper: color-mix(in oklab, var(--dsw-alias-bg-base) 55%, #050608);
  --ws-ink: color-mix(in oklab, var(--dsw-alias-label-primary) 80%, #9aa0aa);
  --ws-ink-soft: color-mix(in oklab, var(--dsw-alias-label-secondary) 78%, #9aa0aa);
  --ws-ink-faint: color-mix(in oklab, var(--dsw-alias-label-tertiary) 70%, #7a808a);
  --ws-line: color-mix(in oklab, var(--dsw-alias-border-l1) 50%, #1a1c20);
  --ws-grain: 0.18;
}
.ws-root * { box-sizing: border-box; }
.ws-root button { font: inherit; color: inherit; background: none; border: 0; cursor: pointer; }
.ws-root input, .ws-root textarea, .ws-root select { font: inherit; color: inherit; }
.ws-scroll { overflow-y: auto; overscroll-behavior: contain; }
/* 四个主页面都吃掉顶栏之外的全部高度，否则滚动条不出现、页面撑不满。
   页面自身是滚动容器，所以内部块必须 flex none，否则高度不够时会被压扁
   （曾经的 bug：继续阅读卡被压成一条，封面只露半张）。 */
.ws-shelf, .ws-stats, .ws-settings, .ws-notes {
  flex: 1; min-height: 0; overflow-y: auto;
}
.ws-shelf > *, .ws-stats > *, .ws-settings > *, .ws-notes > * { flex: none; }
.ws-scroll::-webkit-scrollbar { width: 8px; height: 8px; }
.ws-scroll::-webkit-scrollbar-thumb {
  background: var(--dsw-alias-scrollbar-thumb, var(--ws-line-soft));
  border-radius: 4px;
}
.ws-scroll::-webkit-scrollbar-track { background: transparent; }

/* 顶栏 */
.ws-top {
  display: flex; align-items: center; gap: 6px;
  padding: 0 20px; height: 54px; flex: none;
  border-bottom: 1px solid var(--ws-line);
  background: var(--dsw-alias-bg-base);
  position: relative; z-index: 5;
}
.ws-brand { display: flex; align-items: baseline; gap: 9px; margin-right: 20px; flex: none; }
.ws-brand-name { font-size: 16px; font-weight: 650; letter-spacing: .04em; line-height: 1; }
.ws-brand-sub {
  font-size: 11px; color: var(--ws-ink-faint); line-height: 1;
  padding-left: 9px; border-left: 1px solid var(--ws-line);
}
.ws-tabs { display: flex; align-items: center; gap: 2px; flex: 1; min-width: 0; height: 100%; overflow-x: auto; }
.ws-tabs::-webkit-scrollbar { height: 0; }
.ws-tab {
  position: relative; display: flex; align-items: center; height: 100%;
  padding: 0 13px; border-radius: 0;
  color: var(--ws-ink-soft); font-size: 13px; white-space: nowrap;
  transition: color .12s;
}
.ws-tab:hover { color: var(--ws-ink); }
.ws-tab[data-active="true"] { color: var(--ws-ink); font-weight: 600; }
.ws-tab[data-active="true"]::after {
  content: ''; position: absolute; left: 13px; right: 13px; bottom: 0; height: 2px;
  border-radius: 2px 2px 0 0; background: var(--ws-accent);
}

/* 通用控件 */
.ws-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  height: 30px; padding: 0 12px; border-radius: 8px;
  border: 1px solid var(--ws-line); background: var(--ws-layer);
  color: var(--ws-ink); font-size: 13px; line-height: 1;
  transition: background .12s, border-color .12s, opacity .12s;
  white-space: nowrap; flex: none;
}
.ws-btn:hover:not(:disabled) { background: var(--ws-hover); }
.ws-btn:active:not(:disabled) { transform: translateY(.5px); }
.ws-btn:disabled { opacity: .45; cursor: default; }
.ws-btn[data-kind="primary"] {
  background: var(--dsw-alias-button-primary-fill, var(--ws-accent));
  border-color: transparent;
  color: var(--dsw-alias-label-primary-foreground, #fff);
  font-weight: 500;
}
.ws-btn[data-kind="primary"]:hover:not(:disabled) {
  background: var(--dsw-alias-button-primary-hover, var(--ws-accent));
  filter: brightness(1.05);
}
.ws-btn[data-kind="ghost"] { border-color: transparent; background: transparent; color: var(--ws-ink-soft); }
.ws-btn[data-kind="ghost"]:hover:not(:disabled) { background: var(--ws-hover); color: var(--ws-ink); }
.ws-btn[data-kind="danger"] {
  color: var(--dsw-alias-state-error-primary);
  border-color: color-mix(in oklab, var(--dsw-alias-state-error-primary) 30%, transparent);
}
.ws-btn[data-icon="true"] { width: 30px; padding: 0; }
.ws-input, .ws-select, .ws-area {
  width: 100%; padding: 7px 11px; border-radius: 8px;
  border: 1px solid var(--ws-line); background: var(--ws-layer);
  color: var(--ws-ink); font-size: 13px; outline: none;
  transition: border-color .12s, background .12s;
}
.ws-input::placeholder, .ws-area::placeholder { color: var(--ws-ink-faint); }
.ws-input:focus, .ws-area:focus, .ws-select:focus {
  border-color: var(--ws-accent);
  background: var(--ws-paper);
}
.ws-area { resize: vertical; min-height: 68px; line-height: 1.65; padding: 9px 11px; }
.ws-chip {
  padding: 4px 11px; border-radius: 999px; border: 1px solid var(--ws-line);
  color: var(--ws-ink-soft); font-size: 12px; white-space: nowrap;
  transition: background .12s, color .12s, border-color .12s;
}
.ws-chip:hover { background: var(--ws-hover); color: var(--ws-ink); }
.ws-chip[data-active="true"] {
  border-color: var(--ws-accent); color: var(--ws-accent);
  background: color-mix(in oklab, var(--ws-accent) 10%, transparent);
}
.ws-hint { font-size: 12.5px; color: var(--ws-ink-soft); line-height: 1.65; }
.ws-error { font-size: 12.5px; color: var(--dsw-alias-state-error-primary); line-height: 1.65; }
.ws-ok { font-size: 12.5px; color: var(--dsw-alias-state-success-primary); }
.ws-link { font-size: 12.5px; color: var(--dsw-alias-link, var(--ws-accent)); text-decoration: none; border-bottom: 1px solid currentColor; }
.ws-link:hover { opacity: .8; }
.ws-row { display: flex; align-items: center; gap: var(--ws-2); }
.ws-spacer { flex: 1; }
/* 分隔线只用于设置页的分区，父级已经有 gap，这里再加 margin 会撑出 80px 空洞 */
.ws-divider { height: 1px; background: var(--ws-line); margin: 0; }
/* 小标题（「本周趋势」「最近在读」这类）：不能再用 faint，否则整页没有层级。
   用中性偏深的灰 + 字重，视觉上比正文弱、比说明强。 */
.ws-label {
  font-size: 12.5px; font-weight: 600; color: var(--ws-ink-soft);
  letter-spacing: .02em; margin-bottom: var(--ws-2);
}

/* 书架 */
.ws-shelf {
  padding: var(--ws-5) var(--ws-pad-wide) var(--ws-6);
  display: flex; flex-direction: column; gap: var(--ws-4);
}
.ws-shelf-tools { display: flex; gap: var(--ws-2); align-items: center; flex-wrap: wrap; }
.ws-shelf-search { flex: 1; min-width: 220px; position: relative; }
.ws-shelf-grid {
  display: grid; gap: var(--ws-4) 14px;
  grid-template-columns: repeat(auto-fill, minmax(152px, 1fr));
}
.ws-card {
  display: flex; flex-direction: column; gap: 9px;
  padding: 10px; border-radius: 12px; border: 1px solid transparent;
  text-align: left; transition: background .12s, border-color .12s, transform .12s;
}
.ws-card:hover { background: var(--ws-hover); border-color: var(--ws-line); transform: translateY(-1px); }
.ws-card:active { transform: translateY(0); }
.ws-cover {
  position: relative; aspect-ratio: 3 / 4; border-radius: 8px; overflow: hidden;
  background: var(--ws-layer); border: 1px solid var(--ws-line);
  display: flex; align-items: flex-end; padding: 9px;
  box-shadow: 0 2px 8px rgb(0 0 0 / .06);
}
.ws-cover img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.ws-cover[data-big="true"] { box-shadow: 0 4px 16px rgb(0 0 0 / .1); }
.ws-cover-title {
  position: relative; font-size: 12px; font-weight: 600; line-height: 1.4;
  color: var(--ws-ink-soft); display: -webkit-box; -webkit-line-clamp: 4;
  -webkit-box-orient: vertical; overflow: hidden; word-break: break-word;
}
.ws-card-title {
  font-size: 13px; font-weight: 600; line-height: 1.5; letter-spacing: .005em;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
  /* 两行标题恒定占位，卡片底部元信息才在同一条基线上，网格不会参差。 */
  min-height: calc(1.5em * 2);
}
.ws-card-meta {
  font-size: 11.5px; color: var(--ws-ink-soft);
  display: flex; gap: 7px; flex-wrap: wrap; align-items: center;
  font-variant-numeric: tabular-nums;
  min-height: 1.2em;
}
/* 「云端读了多久 + 书蠹自己又读了多少」——后者是增量，弱化显示 */
.ws-card-meta-tag { color: var(--ws-ink-faint); }
/* 书架底部汇总行：跟卡片元信息长得像，但需要自己的字号和留白 */
.ws-shelf-summary {
  display: flex; gap: 14px; flex-wrap: wrap; align-items: center;
  padding-top: 2px; font-size: 12.5px; color: var(--ws-ink-soft);
  font-variant-numeric: tabular-nums;
}
.ws-shelf-summary > span { display: inline-flex; align-items: center; gap: 5px; }
.ws-shelf-summary > span + span::before {
  content: ''; width: 1px; height: 10px; background: var(--ws-line);
  margin-right: 9px; display: inline-block;
}
.ws-bar { height: 3px; border-radius: 2px; background: var(--ws-line-soft); overflow: hidden; }
.ws-bar > i { display: block; height: 100%; background: var(--ws-accent); border-radius: 2px; }
.ws-badge {
  font-size: 10px; padding: 1px 6px; border-radius: 5px;
  background: color-mix(in oklab, var(--dsw-alias-state-success-primary) 16%, transparent);
  color: var(--dsw-alias-state-success-primary);
}

/* 继续阅读 */
.ws-continue {
  display: flex; align-items: center; gap: var(--ws-4); padding: 14px 18px;
  border-radius: 14px; border: 1px solid var(--ws-line); background: var(--ws-layer);
  position: relative; overflow: hidden;
  flex: none;
}
.ws-continue::before {
  content: ''; position: absolute; inset: 0 auto 0 0; width: 3px;
  background: var(--ws-accent);
}
.ws-continue-cover {
  width: 46px; flex: none; border-radius: 6px; overflow: hidden;
  background: var(--ws-hover); aspect-ratio: 3 / 4;
}
.ws-continue-cover .ws-cover {
  aspect-ratio: auto; height: 100%; border: 0; border-radius: 0; padding: 4px;
}
.ws-continue-cover .ws-cover-title { font-size: 9px; -webkit-line-clamp: 3; }
.ws-continue-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.ws-continue-kicker {
  font-size: 10.5px; font-weight: 700; letter-spacing: .1em;
  color: var(--ws-accent); text-transform: uppercase;
}
.ws-continue-title {
  font-size: 15.5px; font-weight: 650; line-height: 1.4; letter-spacing: .005em;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.ws-continue-author { font-size: 12px; color: var(--ws-ink-soft); }
.ws-continue-meta {
  font-size: 11.5px; color: var(--ws-ink-soft);
  display: flex; gap: 12px; flex-wrap: wrap; margin-top: 3px;
  font-variant-numeric: tabular-nums;
}

/* 搜索命中（书架全文检索）：书名单行 + 摘要两行，可点击跳正文 */
.ws-hits { display: flex; flex-direction: column; gap: 6px; }
.ws-hit {
  padding: 10px 12px; border-radius: 9px; border: 1px solid var(--ws-line);
  background: var(--ws-layer); text-align: left; display: flex; flex-direction: column; gap: 4px;
  transition: background .12s, border-color .12s;
}
.ws-hit:hover { background: var(--ws-hover); border-color: color-mix(in oklab, var(--ws-accent) 24%, var(--ws-line)); }
.ws-hit-book { font-size: 11.5px; color: var(--ws-ink-soft); }
.ws-hit-text { font-size: 13px; line-height: 1.65; color: var(--ws-ink); }
.ws-hit-text mark { background: color-mix(in oklab, var(--ws-accent) 26%, transparent); color: inherit; border-radius: 2px; }

/* 阅读器 */
.ws-reader { position: relative; display: flex; flex-direction: column; flex: 1; min-height: 0; background: var(--ws-paper); }
.ws-reader-top {
  display: flex; align-items: center; gap: 8px; padding: 9px 14px;
  border-bottom: 1px solid var(--ws-line); flex: none;
  transition: opacity .22s, transform .22s;
}
.ws-reader-top[data-hidden="true"] { opacity: 0; transform: translateY(-100%); pointer-events: none; position: absolute; inset: 0 0 auto; z-index: 5; background: var(--ws-paper); }
.ws-reader-title { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.ws-reader-book { font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ws-reader-chapter { font-size: 11px; color: var(--ws-ink-faint); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ws-reader-body { flex: 1; min-height: 0; position: relative; }
/* 纸张纹理：两层极淡的交叉渐变模拟纤维颗粒，强度由 --ws-grain 控制。
   纯 CSS 实现，无需图片资源；深色纸张下自动减弱。 */
.ws-reader-body::before {
  content: ''; position: absolute; inset: 0; pointer-events: none; z-index: 0;
  opacity: var(--ws-grain, 0);
  background-image:
    repeating-linear-gradient(0deg, transparent 0 3px, color-mix(in oklab, var(--ws-ink) 2.2%, transparent) 3px 4px),
    repeating-linear-gradient(90deg, transparent 0 4px, color-mix(in oklab, var(--ws-ink) 1.6%, transparent) 4px 5px);
}
.ws-paper-inner {
  position: relative; z-index: 1;
  /* 列宽 = 每行字数 × 正文字号。这里必须用 --ws-font-size 而不是 1em：
     1em 会取 .ws-root 的 14px（UI 字号），算出 34×14=476px，
     而正文实际按 19px 渲染，等于每行只剩 25 个字 —— 这就是正文偏窄的真正原因。 */
  max-width: calc(var(--ws-measure) * var(--ws-font-size) + 2 * var(--ws-gap));
  margin: 0 auto; padding: 34px var(--ws-gap) 90px;
}
.ws-text {
  font-size: var(--ws-font-size); line-height: var(--ws-line-height);
  color: var(--ws-ink); letter-spacing: .01em;
}
.ws-text[data-font="serif"] {
  font-family: "Songti SC", "STSong", "Noto Serif SC", "Source Han Serif SC", "SimSun", Georgia, serif;
}
.ws-text[data-font="sans"] {
  font-family: "PingFang SC", "Noto Sans SC", "Microsoft YaHei UI", "Microsoft YaHei", system-ui, sans-serif;
}
.ws-text[data-font="kai"] {
  font-family: "Kaiti SC", "STKaiti", "KaiTi", "楷体", "Noto Serif SC", "Songti SC", serif;
  letter-spacing: .02em;
}
.ws-text[data-justify="true"] p { text-align: justify; }
.ws-text p { margin: 0 0 .92em; text-indent: 2em; }
.ws-text h1, .ws-text h2, .ws-text h3, .ws-text h4 {
  margin: 1.5em 0 .7em; line-height: 1.35; font-weight: 600; text-indent: 0;
}
.ws-text h1 { font-size: 1.5em; }
.ws-text h2 { font-size: 1.28em; }
.ws-text h3 { font-size: 1.12em; }
.ws-text h4, .ws-text h5, .ws-text h6 { font-size: 1em; }
.ws-text blockquote {
  margin: .9em 0; padding: .1em 0 .1em 1em;
  border-left: 3px solid var(--ws-line-soft); color: var(--ws-ink-soft);
  text-indent: 0;
}
.ws-text ul { margin: .6em 0; padding-left: 1.4em; }
.ws-text li { margin: .3em 0; }
.ws-text hr { border: 0; height: 1px; background: var(--ws-line); margin: 1.6em 0; }
.ws-text figure { margin: 1.2em 0; }
.ws-text img { max-width: 100%; height: auto; border-radius: 4px; display: block; margin: 1em auto; }
.ws-text .ws-dupe { display: none; }
.ws-text mark[data-note="1"] {
  background: color-mix(in oklab, var(--dsw-static-amber-500, #d9a441) 32%, transparent);
  color: inherit; border-radius: 2px; padding: 0 1px;
}
.ws-text mark[data-note="1"][data-focus="1"] {
  outline: 2px solid var(--ws-accent); outline-offset: 1px;
}
/* 分页模式：columns 简写里给纯数字是「列数」不是「列宽」。
   原来写 columns: var(--ws-measure) 等于要求浏览器把正文切成 34 列，
   1900px 下每列约 56px，完全没法读。这里必须写 column-width。 */
.ws-paged {
  column-width: calc(var(--ws-measure) * var(--ws-font-size));
  column-gap: calc(var(--ws-gap) * 2);
  column-fill: auto; height: 100%;
  /* 多列元素本身必须占满这个「一列宽」的外框（见 .ws-paged-host），
     这样它排出来的后续列会横向溢到框外，由外框 overflow:hidden 裁掉；
     翻页时把这个元素整体左移「一列 + 一个列间距」，就露出下一列。 */
  width: 100%;
}
/* 分页模式下真正限制「一页 = 一列」的是这个外框。
   直接给 .ws-paged 限宽是不行的：它内部的列会溢出到框外，
   翻页后视口里会出现两三列并排。
   只加纵向内边距（和滚动模式 .ws-paper-inner 的上下留白对齐）；
   横向内边距不能加，那会压缩列宽、让每行字数变少。 */
.ws-paged-host {
  width: calc(var(--ws-measure) * var(--ws-font-size));
  max-width: 100%;
  margin: 0 auto;
  padding: 34px 0 90px;
  overflow: hidden;
}

.ws-reader-foot {
  display: flex; align-items: center; gap: 10px; padding: 9px 14px;
  border-top: 1px solid var(--ws-line); flex: none;
  transition: opacity .22s, transform .22s;
}
.ws-reader-foot[data-hidden="true"] { opacity: 0; transform: translateY(100%); pointer-events: none; position: absolute; inset: auto 0 0; z-index: 5; background: var(--ws-paper); }
.ws-track { flex: 1; height: 20px; display: flex; align-items: center; cursor: pointer; }
.ws-track-inner { position: relative; width: 100%; height: 4px; border-radius: 2px; background: var(--ws-line-soft); }
.ws-track-fill { position: absolute; inset: 0 auto 0 0; background: var(--ws-accent); border-radius: 2px; }
.ws-track-dot {
  position: absolute; top: 50%; width: 10px; height: 10px; border-radius: 50%;
  background: var(--ws-accent); transform: translate(-50%, -50%);
  box-shadow: 0 0 0 3px color-mix(in oklab, var(--ws-accent) 20%, transparent);
}
.ws-reader-meta { font-size: 11px; color: var(--ws-ink-faint); white-space: nowrap; }

/* 划词工具条 */
.ws-selbar {
  position: fixed; z-index: 60; display: flex; align-items: center; gap: 2px;
  padding: 4px; border-radius: 10px; background: var(--dsw-alias-bg-overlay, var(--ws-layer));
  border: 1px solid var(--ws-line); box-shadow: 0 8px 26px rgb(0 0 0 / .16);
}
.ws-selbar button {
  padding: 5px 9px; border-radius: 7px; font-size: 12px; white-space: nowrap;
}
.ws-selbar button:hover { background: var(--ws-hover); }

/* 抽屉 */
.ws-scrim {
  position: absolute; inset: 0; z-index: 40;
  background: color-mix(in oklab, var(--dsw-alias-bg-base) 55%, transparent);
}
.ws-drawer {
  position: absolute; inset: 0 0 0 auto; z-index: 41;
  width: min(420px, 100%); display: flex; flex-direction: column;
  background: var(--ws-paper); border-left: 1px solid var(--ws-line);
  box-shadow: -12px 0 34px rgb(0 0 0 / .14);
}
.ws-drawer[data-side="left"] { inset: 0 auto 0 0; border-left: 0; border-right: 1px solid var(--ws-line); box-shadow: 12px 0 34px rgb(0 0 0 / .14); }
.ws-drawer-head {
  display: flex; align-items: center; gap: 8px; padding: 12px 14px;
  border-bottom: 1px solid var(--ws-line); flex: none;
}
.ws-drawer-title { flex: 1; font-size: 14px; font-weight: 600; }
.ws-drawer-body { flex: 1; min-height: 0; overflow-y: auto; padding: 14px; }
.ws-drawer-foot { flex: none; padding: 10px 14px; border-top: 1px solid var(--ws-line); }

/* 目录 */
.ws-toc-item {
  display: flex; gap: 10px; width: 100%; text-align: left;
  padding: 8px 10px; border-radius: 7px; font-size: 13px; line-height: 1.5;
}
.ws-toc-item:hover { background: var(--ws-hover); }
.ws-toc-item[data-active="true"] { background: var(--ws-hover); font-weight: 600; color: var(--ws-accent); }
.ws-toc-index { flex: none; width: 2.2em; color: var(--ws-ink-faint); font-variant-numeric: tabular-nums; }
.ws-toc-title { flex: 1; min-width: 0; }
.ws-toc-dot { flex: none; width: 5px; height: 5px; border-radius: 50%; background: var(--ws-accent); align-self: center; }

/* AI —— 阅读页右侧常驻一栏。
   原来这里是盖住正文的遮罩抽屉：每问一句正文就看不见了，也留不住多轮对话。 */
.ws-reader-main { flex: 1; min-height: 0; display: flex; align-items: stretch; }
.ws-reader-main > .ws-reader-body { flex: 1; min-width: 0; }
.ws-ai-side {
  flex: none; width: min(392px, 42%); min-width: 300px;
  border-left: 1px solid var(--ws-line); background: var(--ws-layer);
}
.ws-ai-scope {
  flex: none; padding: 9px 14px 8px; border-bottom: 1px solid var(--ws-line);
  display: flex; flex-direction: column; gap: 6px; align-items: flex-start;
}
.ws-ai-empty { font-size: 12.5px; color: var(--ws-ink-faint); line-height: 1.7; padding: 10px 2px; }
.ws-msg-quote {
  max-width: 92%; padding: 6px 10px; border-radius: 8px; border-left: 2px solid var(--ws-accent);
  background: var(--ws-hover); font-size: 11.5px; line-height: 1.6; color: var(--ws-ink-soft);
  display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;
}
.ws-ai-quote {
  flex: none; margin: 0 14px; padding: 8px 11px; border-radius: 8px;
  background: var(--ws-hover); font-size: 12px; line-height: 1.6; color: var(--ws-ink-soft);
  max-height: 92px; overflow-y: auto;
  display: flex; align-items: flex-start; gap: 6px;
}
.ws-ai-quote-text { flex: 1; min-width: 0; }

/* 对话页：离开正文之后的长期对话 */
.ws-ask-page {
  flex: 1; min-height: 0; display: flex; flex-direction: column;
  padding: 0 var(--ws-pad); gap: var(--ws-4);
}
.ws-ask-head { flex: none; display: flex; align-items: flex-end; justify-content: space-between; gap: var(--ws-4); padding-top: var(--ws-5); }
.ws-ask-pick { flex: none; display: flex; align-items: center; gap: var(--ws-2); }
.ws-ask-pick .ws-select { width: auto; min-width: 180px; max-width: 320px; }
.ws-ask-body {
  flex: 1; min-height: 0; display: flex; flex-direction: column;
  border: 1px solid var(--ws-line); border-radius: 12px; overflow: hidden;
  margin-bottom: var(--ws-5); background: var(--ws-layer);
}
.ws-ask-body .ws-ai-side { width: 100%; min-width: 0; border-left: none; }

.ws-ai { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.ws-ai-log { flex: 1; min-height: 0; overflow-y: auto; padding: 14px; display: flex; flex-direction: column; gap: 12px; }
.ws-msg { display: flex; flex-direction: column; gap: 4px; }
.ws-msg[data-role="user"] { align-items: flex-end; }
.ws-bubble {
  max-width: 92%; padding: 9px 12px; border-radius: 12px;
  font-size: 13px; line-height: 1.72; white-space: pre-wrap; word-break: break-word;
}
.ws-msg[data-role="user"] .ws-bubble {
  background: color-mix(in oklab, var(--ws-accent) 14%, var(--ws-layer));
  border: 1px solid color-mix(in oklab, var(--ws-accent) 26%, transparent);
}
.ws-msg[data-role="assistant"] .ws-bubble {
  background: var(--ws-layer); border: 1px solid var(--ws-line);
}
.ws-msg-tools { display: flex; gap: 4px; opacity: .5; transition: opacity .12s; }
.ws-msg:hover .ws-msg-tools { opacity: 1; }
.ws-msg-tools button { font-size: 11px; padding: 2px 6px; border-radius: 5px; color: var(--ws-ink-faint); }
.ws-msg-tools button:hover { background: var(--ws-hover); color: var(--ws-ink); }
.ws-caret {
  display: inline-block; width: 6px; height: 14px; margin-left: 2px;
  background: var(--ws-accent); vertical-align: text-bottom;
  animation: ws-blink 1s steps(2) infinite;
}
@keyframes ws-blink { 0%, 50% { opacity: 1; } 50.01%, 100% { opacity: 0; } }
/* 等待首字的那一行。模型要先思考 80 秒以上才吐正文，秒数得肉眼可见地在动，
   否则读者会以为这一栏已经死了。 */
.ws-ai-wait { display: inline-flex; align-items: baseline; gap: 0; }
.ws-ai-elapsed { color: var(--ws-ink-faint); font-size: 11.5px; font-variant-numeric: tabular-nums; }
/* 思考过程。模型先想 100 秒才写正文，这段就是那 100 秒的可见内容。
   用 details 收起来，开始答之后读者可以自行折叠。 */
.ws-ai-think {
  max-width: 92%; margin-bottom: 6px; padding: 7px 10px; border-radius: 8px;
  background: var(--ws-hover); border: 1px dashed var(--ws-line);
  font-size: 11.5px; line-height: 1.65; color: var(--ws-ink-soft);
}
.ws-ai-think > summary { cursor: pointer; color: var(--ws-ink-faint); font-size: 11px; user-select: none; }
.ws-ai-think-body {
  margin-top: 5px; max-height: 180px; overflow-y: auto;
  white-space: pre-wrap; word-break: break-word;
}
.ws-ai-composer { flex: none; padding: 10px 14px 12px; border-top: 1px solid var(--ws-line); display: flex; flex-direction: column; gap: 7px; }
.ws-ai-input-row { display: flex; gap: 7px; align-items: flex-end; }

/* 笔记 */
.ws-note {
  padding: 11px 12px; border-radius: 10px; border: 1px solid var(--ws-line);
  background: var(--ws-layer); display: flex; flex-direction: column; gap: 6px;
}
.ws-note-quote {
  font-size: 13px; line-height: 1.65; color: var(--ws-ink-soft);
  border-left: 2px solid var(--ws-accent); padding-left: 9px;
  display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden;
}
.ws-note-body { font-size: 13px; line-height: 1.7; white-space: pre-wrap; }
.ws-hl-mark { font-size: 13px; line-height: 1.65; color: var(--ws-ink-soft); border-left: 2px solid var(--ws-accent); padding-left: 9px; cursor: pointer; }
.ws-hl-thought { font-size: 13px; line-height: 1.65; color: var(--ws-ink); background: var(--ws-hover); border-radius: 6px; padding: 8px 10px; }
.ws-hl-kind { font-size: 10px; text-transform: uppercase; letter-spacing: .05em; color: var(--dsw-alias-state-business-primary, var(--ws-accent)); font-weight: 600; }
.ws-hl-source { font-size: 11px; color: var(--ws-ink-faint); padding: 0 2px 10px; }
/* 章节小标题可点：从划线直接回到正文那一章 */
.ws-hl-jump {
  display: inline-flex; align-items: center; gap: 5px;
  background: none; border: 0; padding: 0; margin: 0 0 6px;
  cursor: pointer; text-align: left; color: var(--ws-ink-soft);
  font-family: inherit;
}
.ws-hl-jump:hover { color: var(--ws-accent); }
.ws-hl-jump:disabled { cursor: default; color: var(--ws-ink-faint); }
.ws-hl-jump:disabled:hover { color: var(--ws-ink-faint); }
.ws-hl-jump:disabled::after { content: ''; }
.ws-hl-jump::after { content: '→'; font-size: 10px; opacity: .55; }
.ws-hl-jump:hover::after { opacity: 1; }
.ws-note-meta { font-size: 11px; color: var(--ws-ink-faint); display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.ws-tag {
  font-size: 11px; padding: 1px 6px; border-radius: 4px;
  background: color-mix(in oklab, var(--ws-accent) 12%, transparent); color: var(--ws-accent);
}

/* 统计 */
.ws-page-head { display: flex; flex-direction: column; gap: 4px; }
.ws-page-title { font-size: 19px; font-weight: 680; letter-spacing: -.01em; color: var(--ws-ink); }
.ws-page-sub { font-size: 12.5px; color: var(--ws-ink-soft); line-height: 1.65; max-width: 62ch; }
.ws-stats {
  padding: var(--ws-5) var(--ws-pad) var(--ws-6);
  display: flex; flex-direction: column; gap: var(--ws-5);
}
.ws-tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: var(--ws-3); }
.ws-tile {
  padding: 14px 16px; border-radius: 12px; border: 1px solid var(--ws-line);
  background: var(--ws-layer); display: flex; flex-direction: column; gap: 3px;
}
.ws-tile-value { font-size: 24px; font-weight: 650; letter-spacing: -.01em; font-variant-numeric: tabular-nums; line-height: 1.2; }
.ws-tile-label { font-size: 11.5px; color: var(--ws-ink-soft); }
/* 柱子不铺满整行：宽度封顶 72px，否则 9 个数据点会被拉成一根根 160px 的宽板子 */
.ws-bars { display: flex; align-items: flex-end; gap: 8px; height: 116px; max-width: 820px; }
.ws-bar-col { flex: 1; max-width: 72px; display: flex; flex-direction: column; align-items: center; gap: 5px; height: 100%; }
.ws-bar-track { flex: 1; width: 100%; display: flex; align-items: flex-end; }
.ws-bar-fill {
  width: 100%; border-radius: 5px 5px 0 0; min-height: 2px;
  background: color-mix(in oklab, var(--ws-accent) 55%, transparent);
  transition: background .12s;
}
.ws-bar-fill[data-today="true"] { background: var(--ws-accent); }
.ws-bar-label { font-size: 10.5px; color: var(--ws-ink-faint); font-variant-numeric: tabular-nums; }
.ws-rank { display: flex; flex-direction: column; gap: 2px; }
.ws-rank-row {
  display: flex; align-items: center; gap: 12px; font-size: 13px;
  padding: 5px 0; border-bottom: 1px solid var(--ws-line-soft);
}
.ws-rank-row:last-child { border-bottom: 0; }
.ws-rank-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ws-rank-bar { width: 120px; height: 4px; border-radius: 3px; background: var(--ws-line-soft); overflow: hidden; flex: none; }
.ws-rank-bar > i { display: block; height: 100%; background: var(--ws-accent); border-radius: 3px; }
.ws-rank-time {
  flex: none; font-size: 12px; color: var(--ws-ink-soft);
  font-variant-numeric: tabular-nums; width: 5.2em; text-align: right;
}
.ws-goal { display: flex; align-items: center; gap: 12px; }
.ws-goal-text { font-size: 13px; font-weight: 600; }
.ws-goal-pct { font-size: 12px; color: var(--ws-ink-soft); font-variant-numeric: tabular-nums; }

/* 设置：单列，用窄列宽，表单一行别拉到 1200px 那么长 */
.ws-settings {
  padding: var(--ws-5) var(--ws-pad-narrow) var(--ws-6);
  display: flex; flex-direction: column; gap: var(--ws-6);
}
.ws-section { display: flex; flex-direction: column; gap: var(--ws-3); }
.ws-section-title {
  font-size: 14px; font-weight: 650; letter-spacing: .01em; color: var(--ws-ink);
}
.ws-section-desc {
  font-size: 12.5px; color: var(--ws-ink-soft); line-height: 1.7;
  max-width: 52ch; text-wrap: pretty;
}
.ws-field { display: flex; flex-direction: column; gap: 6px; }
.ws-qr {
  width: 168px; height: 168px; border-radius: 10px; overflow: hidden;
  background: #fff; display: flex; align-items: center; justify-content: center;
  border: 1px solid var(--ws-line);
}
.ws-qr svg { width: 100%; height: 100%; display: block; }
.ws-slider { display: flex; align-items: center; gap: 10px; }
.ws-slider input[type="range"] { flex: 1; accent-color: var(--ws-accent); }
.ws-slider-value { width: 3.4em; text-align: right; font-variant-numeric: tabular-nums; font-size: 12px; color: var(--ws-ink-soft); }
/* 分段控件：按内容宽度收缩，绝不撑满整行。
   曾经的 bug：button 用 flex:1，三四个按钮就把 1600px 铺满，看着像巨型标签。 */
.ws-seg {
  display: inline-flex; gap: 2px; padding: 3px; border-radius: 9px;
  background: var(--ws-hover); flex: none; align-self: flex-start;
}
.ws-seg button {
  flex: none; padding: 5px 12px; border-radius: 6px; font-size: 12.5px;
  color: var(--ws-ink-soft); white-space: nowrap; transition: background .12s, color .12s;
}
.ws-seg button:hover { color: var(--ws-ink); }
.ws-seg button[data-active="true"] {
  background: var(--ws-layer); color: var(--ws-ink); font-weight: 600;
  box-shadow: 0 1px 2px rgb(0 0 0 / .07);
}
.ws-switch {
  width: 36px; height: 20px; border-radius: 999px; background: var(--ws-line-soft);
  position: relative; transition: background .14s; flex: none;
}
.ws-switch[data-on="true"] { background: var(--ws-accent); }
.ws-switch::after {
  content: ''; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px;
  border-radius: 50%; background: var(--ws-paper); transition: transform .14s;
}
.ws-switch[data-on="true"]::after { transform: translateX(16px); }

/* 空状态 / 边界 */
.ws-empty {
  flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 9px; padding: 40px 20px; text-align: center;
}
.ws-empty-title { font-size: 15px; font-weight: 600; }
.ws-empty-body { font-size: 12px; color: var(--ws-ink-faint); max-width: 340px; line-height: 1.7; }
.ws-skeleton {
  height: 12px; border-radius: 4px; background: var(--dsw-alias-bg-skeleton, var(--ws-hover));
  animation: ws-pulse 1.4s ease-in-out infinite;
}
@keyframes ws-pulse { 0%, 100% { opacity: .55; } 50% { opacity: 1; } }
.ws-boundary { padding: 30px; max-width: 720px; margin: 0 auto; }
.ws-boundary pre {
  font-size: 11px; line-height: 1.5; padding: 12px; border-radius: 8px;
  background: var(--ws-layer); border: 1px solid var(--ws-line);
  overflow: auto; max-height: 320px; white-space: pre-wrap; word-break: break-all;
}

/* 笔记/统计页：来源切换 + 微信读书云视图 */
.ws-notes-shell {
  flex: 1; min-height: 0; overflow: hidden;
  display: flex; flex-direction: column; gap: var(--ws-4);
  padding: var(--ws-5) var(--ws-pad) var(--ws-6);
}
/* 笔记来源切换：一段式小标签，跟着内容宽度走，不铺满整行。 */
.ws-source-seg {
  display: inline-flex; gap: 2px; padding: 3px; border-radius: 9px;
  background: var(--ws-hover); flex: none; align-self: flex-start;
}
.ws-source-seg button {
  flex: none; padding: 5px 14px; border-radius: 6px; font-size: 12.5px;
  color: var(--ws-ink-soft); white-space: nowrap; transition: background .12s, color .12s;
}
.ws-source-seg button:hover { color: var(--ws-ink); }
.ws-source-seg button[data-active="true"] {
  background: var(--ws-layer); color: var(--ws-ink); font-weight: 600;
  box-shadow: 0 1px 2px rgb(0 0 0 / .07);
}
.ws-notes-shell > .ws-shelf { padding: 0; }
.ws-cloud-summary { font-size: 12.5px; color: var(--ws-ink-soft); padding: 2px 2px 12px; }
.ws-cloud-list { display: flex; flex-direction: column; gap: 7px; }
.ws-cloud-book {
  border: 1px solid var(--ws-line); border-radius: 11px; background: var(--ws-layer);
  overflow: hidden; transition: border-color .12s, background .12s;
}
.ws-cloud-book:hover { border-color: color-mix(in oklab, var(--ws-accent) 22%, var(--ws-line)); }
.ws-cloud-book[data-open="true"] { border-color: color-mix(in oklab, var(--ws-accent) 42%, var(--ws-line)); }
.ws-cloud-book-head {
  display: flex; align-items: center; gap: 12px; width: 100%; padding: 10px 12px; text-align: left;
  background: transparent;
}
.ws-cloud-book-head:hover { background: var(--ws-hover); }
.ws-cloud-cover {
  flex: none; width: 36px; height: 49px; border-radius: 5px; overflow: hidden;
  background: var(--ws-hover); display: flex; align-items: center; justify-content: center;
  font-size: 12px; color: var(--ws-ink-soft); box-shadow: 0 1px 3px rgb(0 0 0 / .1);
}
.ws-cloud-cover img { width: 100%; height: 100%; object-fit: cover; }
.ws-cloud-book-meta { flex: 1; min-width: 0; }
.ws-cloud-book-title { font-size: 13.5px; font-weight: 600; letter-spacing: .005em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ws-cloud-book-author { font-size: 12px; color: var(--ws-ink-soft); margin-top: 1px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* 计数行原来是 faint + 11px，在浅色主题下几乎看不见 */
.ws-cloud-book-counts {
  display: flex; flex-wrap: wrap; gap: 4px 12px; margin-top: 4px;
  font-size: 11.5px; color: var(--ws-ink-soft); font-variant-numeric: tabular-nums;
}
.ws-cloud-caret { flex: none; color: var(--ws-ink-faint); font-size: 13px; }
.ws-cloud-off {
  padding: 1px 6px; border-radius: 999px; font-size: 10.5px;
  color: var(--ws-ink-soft); background: var(--ws-line-soft);
  border: 1px solid var(--ws-line); cursor: help; white-space: nowrap;
}
.ws-cloud-book-body { padding: 6px 14px 14px; border-top: 1px solid var(--ws-line-soft); background: var(--ws-paper); }
.ws-cloud-chapter { padding: 9px 0; }
.ws-cloud-chapter + .ws-cloud-chapter { border-top: 1px solid var(--ws-line-soft); }
.ws-cloud-chapter .ws-label { margin-bottom: 7px; }
.ws-cloud-stats { display: flex; flex-direction: column; gap: var(--ws-4); padding: 4px 0; }
.ws-cloud-stats-head .ws-label { font-size: 15px; margin-bottom: 2px; }
.ws-cloud-stats-head .ws-hint { margin-top: 0; }
.ws-cloud-statline {
  display: flex; flex-wrap: wrap; gap: 6px 18px; font-size: 12.5px;
  color: var(--ws-ink-soft); font-variant-numeric: tabular-nums;
}
.ws-cloud-stat-stats { display: flex; flex-wrap: wrap; gap: 8px; }
.ws-cloud-stat-pill {
  display: flex; align-items: baseline; gap: 6px; padding: 7px 12px; border-radius: 9px;
  border: 1px solid var(--ws-line); background: var(--ws-layer);
  font-size: 12.5px; color: var(--ws-ink-soft);
}
.ws-cloud-stat-pill-num { font-size: 17px; font-weight: 700; color: var(--ws-accent); font-variant-numeric: tabular-nums; }
.ws-cloud-prefers { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: var(--ws-4); }
.ws-cloud-books { display: grid; grid-template-columns: repeat(auto-fill, minmax(98px, 1fr)); gap: var(--ws-3); }
.ws-cloud-book-chip { min-width: 0; }
.ws-cloud-book-chip .ws-cover { width: 100%; aspect-ratio: 3 / 4; }
.ws-cloud-book-chip-title {
  font-size: 11.5px; margin-top: 6px; color: var(--ws-ink);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.ws-cloud-book-chip-tag { font-size: 10.5px; color: var(--ws-ink-soft); margin-top: 1px; }
.ws-cloud-medals { display: flex; flex-wrap: wrap; gap: 8px; }
.ws-cloud-medal {
  min-width: 96px; padding: 10px 12px; border-radius: 10px; text-align: center;
  border: 1px solid color-mix(in oklab, var(--ws-accent) 26%, var(--ws-line));
  background: color-mix(in oklab, var(--ws-accent) 6%, var(--ws-layer));
}
.ws-cloud-medal-name { font-size: 12.5px; font-weight: 600; }
.ws-cloud-medal-rank { font-size: 10.5px; color: var(--ws-ink-soft); margin-top: 3px; }

/* 笔记页：按书浏览 / 搜内容 的切换段 */
.ws-scope-seg { display: inline-flex; padding: 3px; border-radius: 9px; border: 1px solid var(--ws-line); background: var(--ws-layer); flex: 0 0 auto; gap: 2px; }
.ws-scope-seg button {
  height: 30px; padding: 0 14px; border: 0; border-radius: 7px; background: transparent;
  font: inherit; font-size: 12.5px; color: var(--ws-ink-soft); cursor: pointer; white-space: nowrap;
  transition: background .12s, color .12s;
}
.ws-scope-seg button:hover { color: var(--ws-ink); }
.ws-scope-seg button[data-active] {
  background: color-mix(in oklab, var(--ws-accent) 14%, var(--ws-layer));
  color: var(--ws-accent); font-weight: 600;
}

/* 内容搜索结果（笔记页专用）。
   注意：不能复用书架的 .ws-hit —— 那套是「书名 · 章节 / 摘要」两行结构，
   这里需要「类型胶囊 + 书名 + 章节」的头部和带竖线的引文，混用会互相覆盖。 */
.ws-nhit {
  padding: 12px 14px; border-radius: 11px; border: 1px solid var(--ws-line);
  background: var(--ws-layer); display: flex; flex-direction: column; gap: 7px;
}
.ws-nhit-head { display: flex; align-items: baseline; flex-wrap: wrap; gap: 8px; }
.ws-nhit-kind {
  flex: 0 0 auto; padding: 1px 8px; border-radius: 999px; font-size: 10.5px;
  border: 1px solid color-mix(in oklab, var(--ws-accent) 34%, var(--ws-line));
  color: var(--ws-accent); white-space: nowrap;
}
.ws-nhit-book { font-size: 12.5px; font-weight: 600; color: var(--ws-ink); min-width: 0; }
.ws-nhit-chapter { font-size: 11.5px; color: var(--ws-ink-soft); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ws-nhit-text {
  font-size: 13.5px; line-height: 1.75; color: var(--ws-ink);
  border-left: 2px solid color-mix(in oklab, var(--ws-accent) 40%, var(--ws-line));
  padding-left: 11px;
}

/* 设置页：两条通道的状态卡（哪条断了、代价是什么，一眼看清） */
.ws-cred { display: grid; grid-template-columns: repeat(auto-fit, minmax(268px, 1fr)); gap: var(--ws-2); margin: 2px 0; }
.ws-cred-item {
  display: flex; gap: 10px; align-items: flex-start; padding: 11px 13px; border-radius: 11px;
  border: 1px solid var(--ws-line); background: var(--ws-layer);
}
.ws-cred-dot {
  flex: 0 0 auto; width: 7px; height: 7px; margin-top: 6px; border-radius: 50%;
  background: var(--ws-ink-faint); box-shadow: 0 0 0 3px color-mix(in oklab, var(--ws-ink-faint) 18%, transparent);
}
.ws-cred-item[data-ok] .ws-cred-dot {
  background: var(--dsw-alias-state-success-primary, #3fa45b);
  box-shadow: 0 0 0 3px color-mix(in oklab, var(--dsw-alias-state-success-primary, #3fa45b) 18%, transparent);
}
.ws-cred-body { min-width: 0; }
.ws-cred-title { font-size: 12.5px; font-weight: 650; color: var(--ws-ink); }
.ws-cred-desc { font-size: 12px; line-height: 1.65; color: var(--ws-ink-soft); margin-top: 3px; }
`

    /* ── 请求层 ───────────────────────────────────────────────── */

    class AppError extends Error {
      constructor(code, message) {
        super(message)
        this.code = code
      }
    }

    async function call(path, options = {}) {
      const response = await fetch(API + path, {
        method: options.method ?? 'GET',
        headers: options.body === undefined ? undefined : { 'content-type': 'application/json' },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: options.signal,
      })
      let payload = null
      try {
        payload = await response.json()
      } catch {
        throw new AppError('INTERNAL', `服务返回了无法解析的内容（HTTP ${response.status}）。`)
      }
      if (payload === null || typeof payload !== 'object') throw new AppError('INTERNAL', '服务没有返回内容。')
      if (payload.ok !== true) {
        throw new AppError(String(payload.code ?? 'INTERNAL'), String(payload.error ?? '请求失败。'))
      }
      return payload
    }

    const get = (path) => call(path)
    const post = (path, body, options = {}) => call(path, { ...options, method: 'POST', body })
    const patch = (path, body) => call(path, { method: 'PATCH', body })
    const del = (path, body) => call(path, { method: 'DELETE', body })

    /** 流式提问：SSE 逐段回传，`onDelta` 每拿到一小段就调一次。 */
    async function askStream(payload, handlers = {}) {
      const response = await fetch(`${API}/ask`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...payload, stream: true }),
        signal: handlers.signal,
      })
      if (response.body === null) {
        // 极端情况（或代理不支持流）：退回一次性 JSON。
        const data = await response.json()
        if (data.ok !== true) throw new AppError(String(data.code ?? 'INTERNAL'), String(data.error ?? '提问失败。'))
        handlers.onDelta?.(data.answer ?? '')
        return data
      }
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let done = null
      while (true) {
        const read = await reader.read()
        if (read.done) break
        buffer += decoder.decode(read.value, { stream: true })
        let cut
        while ((cut = buffer.indexOf('\n\n')) >= 0) {
          const chunk = buffer.slice(0, cut)
          buffer = buffer.slice(cut + 2)
          const event = /^event: (.+)$/m.exec(chunk)?.[1]?.trim() ?? 'message'
          const raw = /^data: (.+)$/m.exec(chunk)?.[1] ?? ''
          if (raw === '') continue
          let data = null
          try {
            data = JSON.parse(raw)
          } catch {
            continue
          }
          if (event === 'delta') handlers.onDelta?.(String(data.text ?? ''))
          else if (event === 'reasoning') handlers.onReasoning?.(String(data.text ?? ''))
          else if (event === 'done') done = data
          else if (event === 'error') throw new AppError(String(data.code ?? 'INTERNAL'), String(data.error ?? '提问失败。'))
        }
      }
      return done
    }

    /* ── 小工具 ───────────────────────────────────────────────── */

    function clamp(value, min, max) {
      const parsed = Number(value)
      if (!Number.isFinite(parsed)) return min
      return Math.min(max, Math.max(min, parsed))
    }

    function fmtDuration(seconds) {
      const total = Math.max(0, Math.round(Number(seconds) || 0))
      if (total < 60) return `${total} 秒`
      const minutes = Math.round(total / 60)
      if (minutes < 60) return `${minutes} 分钟`
      const hours = total / 3600
      return `${hours >= 10 ? Math.round(hours) : hours.toFixed(1)} 小时`
    }

    function fmtWhen(ms) {
      const value = Number(ms) || 0
      if (value <= 0) return ''
      const delta = Date.now() - value
      if (delta < 60_000) return '刚刚'
      if (delta < 3_600_000) return `${Math.round(delta / 60_000)} 分钟前`
      if (delta < 86_400_000) return `${Math.round(delta / 3_600_000)} 小时前`
      const date = new Date(value)
      return `${date.getMonth() + 1} 月 ${date.getDate()} 日`
    }

    function dayKeyOf(ms) {
      const date = new Date(ms)
      return `${date.getMonth() + 1}/${date.getDate()}`
    }

    function normalizeSettings(input) {
      const next = { ...DEFAULT_SETTINGS }
      if (input === null || typeof input !== 'object') return next
      if (['follow', 'paper', 'sepia', 'ink', 'moss', 'night'].includes(input.theme)) next.theme = input.theme
      if (['serif', 'sans', 'kai'].includes(input.fontFamily)) next.fontFamily = input.fontFamily
      if (['scroll', 'paged'].includes(input.mode)) next.mode = input.mode
      if (Number.isFinite(input.fontSize)) next.fontSize = clamp(input.fontSize, 14, 34)
      if (Number.isFinite(input.lineHeight)) next.lineHeight = clamp(input.lineHeight, 1.3, 2.6)
      if (Number.isFinite(input.measure)) next.measure = clamp(input.measure, 20, 60)
      if (typeof input.justify === 'boolean') next.justify = input.justify
      if (typeof input.chromeAutoHide === 'boolean') next.chromeAutoHide = input.chromeAutoHide
      if (Number.isFinite(input.dailyGoalSeconds)) next.dailyGoalSeconds = clamp(input.dailyGoalSeconds, 300, 14400)
      if (['explain', 'expand'].includes(input.askMode)) next.askMode = input.askMode
      return next
    }

    async function download(filename, text, type = 'text/markdown;charset=utf-8') {
      const blob = new Blob([text], { type })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = filename
      anchor.click()
      setTimeout(() => URL.revokeObjectURL(url), 4000)
    }

    async function copyText(text) {
      try {
        await navigator.clipboard.writeText(text)
        return true
      } catch {
        return false
      }
    }

    /* ── 图标 ─────────────────────────────────────────────────── */

    const icon = (paths, props = {}) =>
      h(
        'svg',
        {
          width: 16,
          height: 16,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.7,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          ...props,
        },
        paths.map((d, index) => h('path', { key: index, d })),
      )

    const IcoBook = (props) => icon(['M4 4.5A1.5 1.5 0 0 1 5.5 3H19v18H5.5A1.5 1.5 0 0 1 4 19.5z', 'M8 3v18'], props)
    const IcoList = (props) => icon(['M8 6h13', 'M8 12h13', 'M8 18h13', 'M3 6h.01', 'M3 12h.01', 'M3 18h.01'], props)
    const IcoNote = (props) => icon(['M5 3h9l5 5v13H5z', 'M14 3v5h5', 'M8 13h8', 'M8 17h5'], props)
    const IcoChart = (props) => icon(['M4 20V10', 'M10 20V4', 'M16 20v-7', 'M22 20H2'], props)
    const IcoGear = (props) => icon(
      ['M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 7 19.4a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 15a1.7 1.7 0 0 0-1.6-1H1a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 3 9a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 9 3V3a2 2 0 1 1 4 0v.1A1.7 1.7 0 0 0 15 4.6a1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 19.4 9v.1a1.7 1.7 0 0 0 1.6 1h.1a2 2 0 1 1 0 4H21a1.7 1.7 0 0 0-1.6 1z'],
      props,
    )
    const IcoSearch = (props) => icon(['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z', 'M21 21l-4.3-4.3'], props)
    const IcoArrowLeft = (props) => icon(['M19 12H5', 'M12 19l-7-7 7-7'], props)
    const IcoArrowRight = (props) => icon(['M5 12h14', 'M12 5l7 7-7 7'], props)
    const IcoClose = (props) => icon(['M18 6L6 18', 'M6 6l12 12'], props)
    const IcoSparkle = (props) => icon(['M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z', 'M18 16l.9 2.1L21 19l-2.1.9L18 22l-.9-2.1L15 19l2.1-.9z'], props)
    const IcoType = (props) => icon(['M4 7V4h16v3', 'M9 20h6', 'M12 4v16'], props)
    const IcoSend = (props) => icon(['M22 2L11 13', 'M22 2l-7 20-4-9-9-4z'], props)
    const IcoRefresh = (props) => icon(['M23 4v6h-6', 'M1 20v-6h6', 'M3.5 9a9 9 0 0 1 14.9-3.4L23 10', 'M20.5 15a9 9 0 0 1-14.9 3.4L1 14'], props)
    const IcoExternal = (props) => icon(['M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6', 'M15 3h6v6', 'M10 14L21 3'], props)

    /* ── 文本渲染（保留层级） ─────────────────────────────────── */

    /**
     * 把块渲染成元素。
     *
     * 这是「灯下」最根本的一处修复：它把所有块都当 `<p>`，所以微信读书的书里
     * 标题、引文、列表全部消失。这里按 `t` 分派，层次回来了。
     */
    function renderBlocks(blocks, options = {}) {
      const nodes = []
      const noteIndex = options.noteIndex ?? new Map()
      const focusQuote = options.focusQuote ?? ''
      for (let index = 0; index < blocks.length; index += 1) {
        const block = blocks[index] ?? {}
        const text = String(block.x ?? '')
        const key = `b${index}`
        if (block.t === 'hr') {
          nodes.push(h('hr', { key }))
          continue
        }
        if (block.t === 'img') {
          nodes.push(
            h('figure', { key }, [
              h('img', { key: 'i', src: String(block.src ?? ''), loading: 'lazy', alt: '' }),
            ]),
          )
          continue
        }
        // 首块与章名重复时并不隐藏（那是数据层该做的），但样式上不抢戏。
        const marks = noteIndex.get(index)
        let content = text
        if (marks !== undefined && marks.length > 0) {
          content = highlightText(text, marks, focusQuote)
        }
        if (block.t === 'h') {
          const level = clamp(block.level ?? 2, 1, 6)
          nodes.push(h(`h${level}`, { key }, content))
        } else if (block.t === 'q') {
          nodes.push(h('blockquote', { key }, content))
        } else if (block.t === 'li') {
          nodes.push(h('ul', { key }, h('li', {}, content)))
        } else {
          nodes.push(h('p', { key }, content))
        }
      }
      return nodes
    }

    /** 在段落里把命中的笔记引文包成 <mark>，便于看见「我在这里写过」。 */
    function highlightText(text, quotes, focusQuote) {
      const spans = []
      let cursor = 0
      const ranges = []
      for (const quote of quotes) {
        const needle = String(quote ?? '').trim().slice(0, 60)
        if (needle === '') continue
        const at = text.indexOf(needle)
        if (at < 0) continue
        ranges.push({ start: at, end: at + needle.length, focus: focusQuote !== '' && needle === focusQuote.trim().slice(0, 60) })
      }
      if (ranges.length === 0) return text
      ranges.sort((left, right) => left.start - right.start)
      let serial = 0
      for (const range of ranges) {
        if (range.start < cursor) continue
        if (range.start > cursor) spans.push(text.slice(cursor, range.start))
        spans.push(
          h(
            'mark',
            { key: `m${serial}`, 'data-note': '1', 'data-focus': range.focus ? '1' : undefined },
            text.slice(range.start, range.end),
          ),
        )
        serial += 1
        cursor = range.end
      }
      if (cursor < text.length) spans.push(text.slice(cursor))
      return spans
    }

    /* ── 书架卡 ───────────────────────────────────────────────── */

    function Cover(props) {
      const { book, big, compact } = props
      const [broken, setBroken] = useState(false)
      const cover = String(book?.cover ?? '')
      const title = String(book?.title ?? '')
      // 没有封面、或者封面挂了，才显示文字兜底；否则不要在封面图上再压一遍书名。
      const showFallback = cover === '' || broken
      return h(
        'div',
        { className: 'ws-cover', 'data-big': big === true ? 'true' : undefined },
        showFallback ? h('div', { className: 'ws-cover-title' }, title) : null,
        compact === true && showFallback
          ? null
          : cover !== '' && !broken
            ? h('img', { src: cover, alt: '', loading: 'lazy', onError: () => setBroken(true) })
            : null,
      )
    }

    function BookCard(props) {
      const { book, onOpen } = props
      const percent = clamp(book?.percent ?? 0, 0, 100)
      /* 云端 readingTime 才是「这本书在微信读书里读了多久」的真实数字；
         readSeconds 只是书蠹自己这次读的，通常为 0，单独显示会让人以为没读过。 */
      const cloudSeconds = Number(book?.remote?.readingTime) || 0
      const localSeconds = Number(book?.readSeconds) || 0
      return h(
        'button',
        { className: 'ws-card', onClick: () => onOpen(book), title: book?.title ?? '' },
        h(Cover, { book }),
        h('div', { className: 'ws-card-title' }, String(book?.title ?? '')),
        h(
          'div',
          { className: 'ws-card-meta' },
          percent > 0 ? h('span', {}, `${percent}%`) : null,
          cloudSeconds > 0 ? h('span', {}, fmtDuration(cloudSeconds)) : null,
          cloudSeconds > 0 && localSeconds > 0 ? h('span', { className: 'ws-card-meta-tag' }, `+${fmtDuration(localSeconds)}`) : null,
          cloudSeconds === 0 && localSeconds > 0 ? h('span', {}, fmtDuration(localSeconds)) : null,
          (book?.notes ?? 0) > 0 ? h('span', {}, `${book.notes} 条笔记`) : null,
          book?.finished === true ? h('span', { className: 'ws-badge' }, '读完') : null,
        ),
        h('div', { className: 'ws-bar' }, h('i', { style: { width: `${percent}%` } })),
      )
    }

    function ContinueBar(props) {
      const { book, onOpen } = props
      const percent = clamp(book?.percent ?? 0, 0, 100)
      const remote = book?.remote ?? null
      // 这里读的是 `remote.percent` / `remote.readingTime`，与 store 写入的字段名一致。
      // 灯下读的是 `remote.progress` / `remote.seconds`，两个字段并不存在，所以永远空白。
      const remotePercent = Number(remote?.percent) || 0
      const remoteSeconds = Number(remote?.readingTime) || 0
      return h(
        'div',
        { className: 'ws-continue' },
        h('div', { className: 'ws-continue-cover' }, h(Cover, { book })),
        h(
          'div',
          { className: 'ws-continue-body' },
          h('div', { className: 'ws-continue-kicker' }, '继续阅读'),
          h('div', { className: 'ws-continue-title' }, String(book?.title ?? '')),
          h('div', { className: 'ws-continue-author' }, String(book?.author ?? '')),
          h(
            'div',
            { className: 'ws-continue-meta' },
            percent > 0 ? `${percent}%` : '还没开始',
            remoteSeconds > 0 ? `微信读书 ${fmtDuration(remoteSeconds)}` : '',
            (book?.readSeconds ?? 0) > 0 ? `书蠹 ${fmtDuration(book.readSeconds)}` : '',
          ),
        ),
        h(
          'button',
          { className: 'ws-btn', 'data-kind': 'primary', onClick: () => onOpen(book) },
          '继续读',
        ),
      )
    }

    /* ── 书架页 ───────────────────────────────────────────────── */

    function ShelfPage(props) {
      const { t, shelf, stats, loading, onOpen, onConnect, onSearch } = props
      const [filter, setFilter] = useState('all')
      const [sort, setSort] = useState('recent')
      const [query, setQuery] = useState('')
      const [hits, setHits] = useState(null)
      const [searching, setSearching] = useState(false)

      // 正文字搜索：输入停顿 420ms 后查本地缓存，命中就在书架上方列出。
      useEffect(() => {
        const needle = query.trim()
        if (needle.length < 2) {
          setHits(null)
          return undefined
        }
        const timer = setTimeout(async () => {
          setSearching(true)
          try {
            const data = await get(`/search?query=${encodeURIComponent(needle)}&limit=30`)
            setHits({ hits: data.hits ?? [], skipped: data.skipped ?? 0 })
          } catch {
            setHits({ hits: [], skipped: 0 })
          } finally {
            setSearching(false)
          }
        }, 420)
        return () => clearTimeout(timer)
      }, [query])

      const books = useMemo(() => {
        const needle = query.trim().toLowerCase()
        let list = shelf
        if (filter === 'reading') list = list.filter((book) => book.finished !== true)
        else if (filter === 'finished') list = list.filter((book) => book.finished === true)
        if (needle !== '') {
          list = list.filter((book) =>
            `${book.title}\n${book.author}`.toLowerCase().includes(needle),
          )
        }
        const sorted = [...list]
        if (sort === 'title') sorted.sort((left, right) => String(left.title).localeCompare(String(right.title), 'zh'))
        else if (sort === 'added') sorted.sort((left, right) => (right.addedAt ?? 0) - (left.addedAt ?? 0))
        else sorted.sort((left, right) => (right.lastOpenedAt ?? 0) - (left.lastOpenedAt ?? 0))
        return sorted
      }, [shelf, filter, sort, query])

      // 「继续读」优先选真正读过的那本；都没读过就退到云端进度最高的一本，
      // 这样 174 本刚同步进来时首页也不是空的（灯下这里会一片空白）。
      const resume = useMemo(() => {
        const opened = shelf.filter((book) => (book.lastOpenedAt ?? 0) > 0 && book.finished !== true)
        if (opened.length > 0) {
          opened.sort((left, right) => (right.lastOpenedAt ?? 0) - (left.lastOpenedAt ?? 0))
          return opened[0]
        }
        const remote = shelf.filter((book) => Number(book?.remote?.percent ?? 0) > 0 && book.finished !== true)
        if (remote.length > 0) {
          remote.sort((left, right) => Number(right.remote.percent) - Number(left.remote.percent))
          return remote[0]
        }
        return null
      }, [shelf])

      const wereadSeconds = useMemo(
        () => shelf.reduce((sum, book) => sum + (Number(book?.remote?.readingTime) || 0), 0),
        [shelf],
      )

      if (loading) {
        return h(
          'div',
          { className: 'ws-shelf ws-scroll' },
          h('div', { className: 'ws-skeleton', style: { width: '38%' } }),
          h('div', { className: 'ws-skeleton', style: { width: '64%' } }),
          h('div', { className: 'ws-skeleton', style: { width: '52%' } }),
        )
      }

      if (shelf.length === 0) {
        return h(
          'div',
          { className: 'ws-empty' },
          h(IcoBook, { width: 30, height: 30, strokeWidth: 1.2 }),
          h('div', { className: 'ws-empty-title' }, t('shelf.empty')),
          h('div', { className: 'ws-empty-body' }, t('shelf.emptyHint')),
          h('button', { className: 'ws-btn', 'data-kind': 'primary', onClick: onConnect }, t('shelf.connect')),
        )
      }

      return h(
        'div',
        { className: 'ws-shelf ws-scroll' },
        resume !== null ? h(ContinueBar, { book: resume, onOpen }) : null,
        h(
          'div',
          { className: 'ws-shelf-tools' },
          h(
            'div',
            { className: 'ws-shelf-search' },
            h('input', {
              className: 'ws-input',
              placeholder: t('shelf.search'),
              value: query,
              onChange: (event) => setQuery(event.target.value),
            }),
          ),
          ['all', 'reading', 'finished'].map((key) =>
            h(
              'button',
              { key, className: 'ws-chip', 'data-active': filter === key, onClick: () => setFilter(key) },
              t(`shelf.filter.${key}`),
            ),
          ),
          h(
            'select',
            { className: 'ws-select', style: { width: 'auto' }, value: sort, onChange: (event) => setSort(event.target.value) },
            ['recent', 'added', 'title'].map((key) => h('option', { key, value: key }, t(`shelf.sort.${key}`))),
          ),
        ),
        hits !== null && hits.hits.length > 0
          ? h(
              'div',
              {},
              h('div', { className: 'ws-label' }, t('shelf.searchHits').replace('{n}', String(hits.hits.length)).replace('{q}', query.trim())),
              h(
                'div',
                { className: 'ws-hits' },
                hits.hits.slice(0, 12).map((hit, index) =>
                  h(
                    'button',
                    {
                      key: `${hit.bookId}-${hit.chapterIndex}-${index}`,
                      className: 'ws-hit',
                      onClick: () => onOpen({ id: hit.bookId }, { chapterIndex: hit.chapterIndex, quote: hit.snippet }),
                    },
                    h('span', { className: 'ws-hit-book' }, `${hit.bookTitle} · ${hit.chapterTitle}`),
                    h('span', { className: 'ws-hit-text' }, hit.snippet),
                  ),
                ),
              ),
              hits.skipped > 0
                ? h('div', { className: 'ws-hint', style: { marginTop: 6 } }, t('shelf.searchSkipped').replace('{n}', String(hits.skipped)))
                : null,
            )
          : null,
        hits !== null && hits.hits.length === 0 && !searching && query.trim().length >= 2
          ? h('div', { className: 'ws-hint' }, t('shelf.searchNone').replace('{q}', query.trim()))
          : null,
        h(
          'div',
          { className: 'ws-shelf-summary' },
          h('span', {}, `${shelf.length} ${t('shelf.stat.books')}`),
          wereadSeconds > 0 ? h('span', {}, `${t('shelf.stat.weread')} ${fmtDuration(wereadSeconds)}`) : null,
          (stats?.seconds ?? 0) > 0 ? h('span', {}, `${t('shelf.stat.local')} ${fmtDuration(stats.seconds)}`) : null,
        ),
        h(
          'div',
          { className: 'ws-shelf-grid' },
          books.map((book) => h(BookCard, { key: book.id, book, onOpen: (item) => onOpen(item) })),
        ),
      )
    }

    /* ── 阅读器 ───────────────────────────────────────────────── */

    function Reader(props) {
      const { t, settings, bookId, initialChapter, initialChapterUid, initialQuote, onSettings, onExit, onNotesChanged, onAskPage } = props
      const [meta, setMeta] = useState(null)
      const [toc, setToc] = useState([])
      const [chapterIndex, setChapterIndex] = useState(initialChapter ?? 0)
      const [chapter, setChapter] = useState(null)
      const [status, setStatus] = useState('loading')
      const [error, setError] = useState('')
      const [drawer, setDrawer] = useState('')
      const [chromeHidden, setChromeHidden] = useState(false)
      const [selection, setSelection] = useState(null)
      const [notes, setNotes] = useState([])
      const [page, setPage] = useState(0)
      const [pages, setPages] = useState(1)
      const [scrollPercent, setScrollPercent] = useState(0)
      /* 常驻对话栏：不再是「一问一答一次弹窗」，而是一条可持续追问的对话线。
         原来 state 只有 question/answer 两个字段，关掉面板整段对话就没了。 */
      const [chatOpen, setChatOpen] = useState(false)
      const [chat, setChat] = useState({ sessionId: '', turns: 0, messages: [], history: [], status: 'idle', error: '' })
      /* 收尾写笔记时要读「最新的」对话状态。askAi 是 useCallback，
         依赖里不放 messages（否则每帧都换新函数、输入框反复失焦），
         所以用 ref 兜住最新值。 */
      const chatRef = useRef(chat)
      chatRef.current = chat
      /* 提问范围：选中 / 本章 / 全书。原来只能问「选中的那一段」。 */
      const [scope, setScope] = useState('selection')
      const abortRef = useRef(null)
      const [highlights, setHighlights] = useState(null)
      const [fontOpen, setFontOpen] = useState(false)
      /* 目录还没取到时，划线跳正文点了没反应会让人莫名其妙——给一句明确的话。 */
      const [jumpMissed, setJumpMissed] = useState(false)

      const scrollRef = useRef(null)
      const pagedRef = useRef(null)
      const tickRef = useRef(Date.now())
      const lastFlushRef = useRef(0)
      const restoreRef = useRef(null)
      const pendingQuoteRef = useRef(initialQuote ?? '')
      const idleRef = useRef(0)

      /* 打开一本书：拿目录与进度 */
      useEffect(() => {
        let alive = true
        setStatus('loading')
        get(`/book?bookId=${encodeURIComponent(bookId)}`)
          .then((data) => {
            if (!alive) return
            setMeta(data.book ?? null)
            const list = data.toc ?? []
            setToc(list)
            /* 云端划线带的是 chapterUid，本地目录按 index 排；先换算成 index 才能跳对章。 */
            let target = initialChapter ?? Number(data.book?.progress?.chapterIndex ?? 0)
            const wantedUid = String(initialChapterUid ?? '')
            if (initialChapter === undefined || initialChapter === null) {
              if (wantedUid !== '') {
                const found = list.findIndex((item) => String(item.chapterUid ?? '') === wantedUid)
                if (found >= 0) target = found
              }
            }
            setChapterIndex(clamp(target, 0, Math.max(0, list.length - 1)))
            if (data.tocError) setError(String(data.tocError))
          })
          .catch((failure) => {
            if (!alive) return
            setStatus('error')
            setError(failure.message ?? String(failure))
          })
        return () => {
          alive = false
        }
      }, [bookId, initialChapter, initialChapterUid])

      /* 取当前章 */
      useEffect(() => {
        if (meta === null) return undefined
        let alive = true
        setStatus('loading')
        get(`/chapter?bookId=${encodeURIComponent(bookId)}&index=${chapterIndex}`)
          .then((data) => {
            if (!alive) return
            setChapter({ title: data.title ?? '', blocks: data.blocks ?? [] })
            setStatus('ready')
            setPage(0)
            restoreRef.current = 'restoring'
          })
          .catch((failure) => {
            if (!alive) return
            setStatus('error')
            setError(failure.message ?? String(failure))
          })
        return () => {
          alive = false
        }
      }, [bookId, chapterIndex, meta])

      /* 笔记（用于正文里画高亮） */
      const reloadNotes = useCallback(async () => {
        try {
          const data = await get(`/notes?bookId=${encodeURIComponent(bookId)}`)
          setNotes(data.items ?? [])
        } catch {
          setNotes([])
        }
      }, [bookId])

      useEffect(() => {
        void reloadNotes()
      }, [reloadNotes])

      /* 章节 → 块索引 → 引文，用于高亮 */
      const noteIndex = useMemo(() => {
        const map = new Map()
        if (chapter === null) return map
        for (const note of notes) {
          if (Number(note.chapterIndex) !== chapterIndex) continue
          const needle = String(note.quote ?? '').trim().slice(0, 60)
          if (needle === '') continue
          for (let index = 0; index < chapter.blocks.length; index += 1) {
            if (String(chapter.blocks[index]?.x ?? '').includes(needle)) {
              const list = map.get(index) ?? []
              list.push(note.quote)
              map.set(index, list)
              break
            }
          }
        }
        return map
      }, [notes, chapter, chapterIndex])

      /* 进度上报：每 5 秒一次，只在真有变化或真读了一段时间才写 */
      const snapshotRef = useRef({ chapterIndex: 0, percent: 0 })
      useEffect(() => {
        snapshotRef.current = { chapterIndex, percent: settings.mode === 'paged' ? (pages > 1 ? page / (pages - 1) : 0) : scrollPercent }
      }, [chapterIndex, pages, page, scrollPercent, settings.mode])

      useEffect(() => {
        const timer = setInterval(() => {
          const now = Date.now()
          const spent = Math.min(600, Math.round((now - tickRef.current) / 1000))
          if (spent < 1 && now - lastFlushRef.current < FLUSH_MS) return
          const snapshot = snapshotRef.current
          lastFlushRef.current = now
          tickRef.current = now
          void post('/progress', {
            bookId,
            chapterIndex: snapshot.chapterIndex,
            percent: snapshot.percent,
            seconds: spent,
          }).catch(() => undefined)
        }, FLUSH_MS)
        return () => clearInterval(timer)
      }, [bookId])

      /* 分页测量 */
      const recompute = useCallback(() => {
        if (settings.mode !== 'paged') {
          setPages(1)
          return
        }
        const container = pagedRef.current
        if (container === null) return
        const style = window.getComputedStyle(container)
        const gap = Number.parseFloat(style.columnGap) || 0
        const stride = Math.max(1, container.clientWidth + gap)
        const total = Math.max(1, Math.round((container.scrollWidth + gap) / stride))
        setPages(total)
        if (restoreRef.current === 'restoring') {
          setPage(clamp(Number(meta?.progress?.percent ?? 0) > 0 ? Math.round((Number(meta.progress.percent) || 0) * (total - 1)) : 0, 0, total - 1))
          restoreRef.current = null
        }
      }, [settings.mode, meta])

      useEffect(() => {
        recompute()
        const onResize = () => recompute()
        window.addEventListener('resize', onResize)
        return () => window.removeEventListener('resize', onResize)
      }, [recompute, chapter, settings.fontSize, settings.lineHeight, settings.measure, settings.fontFamily])

      /* 滚动 → 章内百分比 */
      const onScroll = useCallback(() => {
        const element = scrollRef.current
        if (element === null) return
        const max = element.scrollHeight - element.clientHeight
        const ratio = max <= 0 ? 0 : clamp(element.scrollTop / max, 0, 1)
        setScrollPercent(ratio)
        if (element.scrollTop > 4) setSelection(null)
      }, [])

      /* 划词 */
      const captureSelection = useCallback(() => {
        const active = window.getSelection()
        if (active === null || active.isCollapsed) {
          setSelection(null)
          return
        }
        const text = String(active.toString() ?? '').trim()
        if (text.length < 2) {
          setSelection(null)
          return
        }
        const range = active.getRangeAt(0)
        const rect = range.getBoundingClientRect()
        setSelection({
          text: text.slice(0, 2000),
          top: rect.top > 74 ? rect.top - 46 : rect.bottom + 12,
          left: clamp(rect.left + rect.width / 2, 150, window.innerWidth - 150),
        })
      }, [])

      /* 自动隐藏工具条 */
      const pokeChrome = useCallback(() => {
        setChromeHidden(false)
        idleRef.current += 1
        const token = idleRef.current
        setTimeout(() => {
          if (idleRef.current === token && settings.chromeAutoHide) setChromeHidden(true)
        }, 2600)
      }, [settings.chromeAutoHide])

      /* 翻页 / 翻章 */
      const turn = useCallback(
        (delta) => {
          setSelection(null)
          if (settings.mode === 'paged') {
            const next = page + delta
            if (next >= 0 && next < pages) {
              setPage(next)
              return
            }
            if (next >= pages) {
              if (chapterIndex < toc.length - 1) setChapterIndex(chapterIndex + 1)
              return
            }
            if (chapterIndex > 0) {
              setChapterIndex(chapterIndex - 1)
              restoreRef.current = 'last'
            }
            return
          }
          const element = scrollRef.current
          if (element === null) return
          element.scrollBy({ top: delta * element.clientHeight * 0.86, behavior: 'smooth' })
        },
        [settings.mode, page, pages, chapterIndex, toc.length],
      )

      useEffect(() => {
        const onKey = (event) => {
          const tag = String(event.target?.tagName ?? '').toLowerCase()
          if (tag === 'input' || tag === 'textarea' || tag === 'select' || event.target?.isContentEditable) return
          if (event.key === 'ArrowRight' || event.key === 'j' || event.key === ' ') {
            event.preventDefault()
            turn(1)
          } else if (event.key === 'ArrowLeft' || event.key === 'k') {
            event.preventDefault()
            turn(-1)
          } else if (event.key === 't') {
            setDrawer(drawer === 'toc' ? '' : 'toc')
          } else if (event.key === 'n') {
            setDrawer(drawer === 'notes' ? '' : 'notes')
          } else if (event.key === 'Escape') {
            if (selection !== null) setSelection(null)
            else if (chatOpen) setChatOpen(false)
            else if (drawer !== '') setDrawer('')
          }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
      }, [turn, drawer, selection, chatOpen])

      /* 跳到正文里被引用的位置 */
      useEffect(() => {
        const quote = pendingQuoteRef.current
        if (quote === '' || chapter === null || status !== 'ready') return
        const needle = quote.trim().slice(0, 24)
        let target = -1
        for (let index = 0; index < chapter.blocks.length; index += 1) {
          if (String(chapter.blocks[index]?.x ?? '').includes(needle)) {
            target = index
            break
          }
        }
        if (target < 0) {
          pendingQuoteRef.current = ''
          return
        }
        pendingQuoteRef.current = ''
        const host = scrollRef.current ?? pagedRef.current
        if (host === null) return
        setTimeout(() => {
          const found = host.querySelectorAll('p, h1, h2, h3, h4, h5, h6, blockquote, li')[target]
          found?.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
        }, 60)
      }, [chapter, status])

      const bookIdRef = useRef(bookId)
      bookIdRef.current = bookId

      const total = Math.max(1, toc.length)
      const innerPercent = settings.mode === 'paged' ? (pages > 1 ? page / (pages - 1) : 0) : scrollPercent
      const overall = clamp(Math.round(((chapterIndex + clamp(innerPercent, 0, 1)) / total) * 100), 0, 100)
      /* 划词默认动作：设置里那个 `askMode` 以前只能存不能读，
         现在真的决定工具条上第一个按钮是「解释」还是「提问」。 */
      const primaryMode = settings.askMode === 'expand' ? 'expand' : 'explain'
      const otherMode = primaryMode === 'explain' ? 'expand' : 'explain'

      /* 提问 —— 多轮。每轮把「问 + 答」都推进 messages，所以能看见整段对话、
         能连续追问，关掉侧栏再打开也还在（存在组件 state 里，随阅读会话存活）。 */
      const askAi = useCallback(
        async (mode, text, options = {}) => {
          const question = String(text ?? '').trim()
          const quote = String(options.quote ?? '').trim()
          const askScope = options.scope ?? scope
          if (question === '' && quote === '') return
          const controller = new AbortController()
          abortRef.current = controller
          const userTurn = { id: `u${Date.now()}`, role: 'user', text: question !== '' ? question : `（请解释这段：${quote.slice(0, 40)}…）`, quote, mode }
          setChat((current) => ({
            ...current,
            status: 'streaming',
            error: '',
            messages: [...current.messages, userTurn, { id: `a${Date.now()}`, role: 'assistant', text: '' }],
          }))
          setChatOpen(true)
          /* 答案同时攒在局部变量里：用在 onDelta 里顺手拼，
             比事后从 React state 里读更可靠（setState 是异步的）。 */
          let answerText = ''
          try {
            const done = await askStream(
              {
                bookId,
                bookTitle: meta?.title,
                chapterIndex,
                chapterTitle: chapter?.title ?? toc[chapterIndex]?.title ?? '',
                quote,
                text: question,
                mode,
                scope: askScope,
                sessionId: chat.sessionId === '' ? undefined : chat.sessionId,
                withToc: true,
              },
              {
                signal: controller.signal,
                /* 思考过程单独攒。实测模型要先想 100 秒才吐正文，
                   但 reasoning 在 1 秒内就开始流了——
                   把它显示出来，那一百秒就不是白屏，而是「正在想这些」。 */
                onReasoning: (piece) => {
                  setChat((current) => {
                    const messages = [...current.messages]
                    const last = messages[messages.length - 1]
                    if (last?.role === 'assistant') {
                      messages[messages.length - 1] = { ...last, reasoning: (last.reasoning ?? '') + piece }
                    }
                    return { ...current, messages }
                  })
                },
                onDelta: (delta) => {
                  answerText += delta
                  setChat((current) => {
                    const messages = [...current.messages]
                    const last = messages[messages.length - 1]
                    if (last?.role === 'assistant') messages[messages.length - 1] = { ...last, text: (last.text ?? '') + delta }
                    return { ...current, messages }
                  })
                },
              },
            )
            setChat((current) => ({ ...current, status: 'done', sessionId: done?.sessionId ?? current.sessionId, turns: done?.turns ?? current.turns + 1 }))
            /* 问答留在书里：一次对话落成**一条**笔记。
               第一轮新建，后续追问改写同一条——否则连续问十句就在笔记里堆十条，
               读者打开笔记列表会淹没在碎片里。 */
            if (answerText.trim() !== '') {
              /* 用自增的 history 记账，而不是去 state 里翻 messages：
                 streaming 期间每帧都在改 messages，收尾时读到的顺序和内容容易对不上。
                 history 只在每轮结束时追加一次，天然稳定。 */
              const history = [...(Array.isArray(chatRef.current.history) ? chatRef.current.history : []), { q: question !== '' ? question : quote, a: answerText }]
              const transcript = history
                .map((turn) => `问：${String(turn.q ?? '')}\n\n答：${String(turn.a ?? '')}`)
                .filter((block) => !/^问：\s*\n\n答：\s*$/.test(block))
                .join('\n\n———\n\n')
              const noteId = String(chatRef.current.noteId ?? '')
              setChat((current) => ({ ...current, history }))
              try {
                if (noteId === '') {
                  const saved = await post('/notes', {
                    bookId,
                    bookTitle: meta?.title ?? '',
                    chapterIndex,
                    chapterTitle: chapter?.title ?? toc[chapterIndex]?.title ?? '',
                    quote: (quote !== '' ? quote : question).slice(0, 4000),
                    note: transcript,
                    mode: 'ask',
                  })
                  const id = String(saved?.note?.id ?? saved?.id ?? '')
                  if (id !== '') setChat((latest) => ({ ...latest, noteId: id }))
                } else {
                  await patch('/notes', { id: noteId, patch: { note: transcript } })
                }
                await reloadNotes()
                onNotesChanged?.()
              } catch {
                undefined
              }
            }
          } catch (failure) {
            if (String(failure?.name) === 'AbortError') {
              setChat((current) => ({ ...current, status: 'done' }))
              return
            }
            setChat((current) => ({ ...current, status: 'error', error: failure?.message ?? String(failure) }))
          } finally {
            abortRef.current = null
          }
        },
        [bookId, chapterIndex, chapter, meta, toc, scope, chat.sessionId, reloadNotes, onNotesChanged],
      )

      /** 停止生成。原来 abort 只是被存进 state，从来没有按钮去调用它，
          只能等 180 秒超时。 */
      const stopAi = useCallback(() => {
        abortRef.current?.abort()
        abortRef.current = null
        setChat((current) => ({ ...current, status: 'done' }))
      }, [])

      /* 不再需要「手动保存」这一步：每轮回答落地时已经自动写成笔记了。 */

      const bodyStyle = {
        '--ws-font-size': `${settings.fontSize}px`,
        '--ws-line-height': String(settings.lineHeight),
        '--ws-measure': String(settings.measure),
        '--ws-gap': settings.measure >= 40 ? '88px' : '72px',
      }

      if (status === 'error') {
        return h(
          'div',
          { className: 'ws-empty' },
          h('div', { className: 'ws-empty-title' }, t('common.error')),
          h('div', { className: 'ws-empty-body' }, error),
          h('div', { className: 'ws-row' }, h('button', { className: 'ws-btn', onClick: onExit }, t('reader.back'))),
        )
      }

      const blocks = chapter?.blocks ?? []
      const body =
        settings.mode === 'paged'
          ? h(
              'div',
              {
                className: 'ws-reader-body ws-paged-host',
                /* 「一页 = 一列」的限宽和裁剪都落在这个外框上。
                   若把 width 直接给下面的 .ws-paged，它排出来的后续列会溢出到框外，
                   翻页后视口里会同时露出两三列。 */
                style: { ...bodyStyle, overflow: 'hidden' },
              },
              h(
                'div',
                {
                  className: 'ws-text ws-paged',
                  /* ref 必须挂在这个多列元素上。挂外层容器时 clientWidth/scrollWidth
                     量的都是外层，「总页数」恒等于 1，分页翻页其实是坏的。 */
                  ref: pagedRef,
                  'data-font': settings.fontFamily,
                  'data-justify': String(settings.justify),
                  style: {
                    ...bodyStyle,
                    height: '100%',
                    /* 每一列之间还夹着一个 column-gap，所以翻页步进是
                       「一列宽 + 一个列间距」，不能只按 100% 翻。 */
                    transform: `translate3d(calc(${-100 * page}% - ${page} * var(--ws-gap) * 2), 0, 0)`,
                    transition: 'transform .24s ease',
                  },
                },
                renderBlocks(blocks, { noteIndex, focusQuote: pendingQuoteRef.current }),
              ),
            )
          : h(
              'div',
              { className: 'ws-reader-body ws-scroll', ref: scrollRef, onScroll, onMouseUp: captureSelection },
              h(
                'div',
                { className: 'ws-paper-inner' },
                h(
                  'div',
                  {
                    className: 'ws-text',
                    'data-font': settings.fontFamily,
                    'data-justify': String(settings.justify),
                    style: bodyStyle,
                  },
                  renderBlocks(blocks, { noteIndex }),
                ),
              ),
            )

      return h(
        'div',
        { className: 'ws-reader', onMouseMove: pokeChrome },
        h(
          'div',
          { className: 'ws-reader-top', 'data-hidden': String(chromeHidden) },
          h('button', { className: 'ws-btn', 'data-kind': 'ghost', onClick: onExit }, h(IcoArrowLeft), t('reader.back')),
          h(
            'div',
            { className: 'ws-reader-title' },
            h('div', { className: 'ws-reader-book' }, String(meta?.title ?? '')),
            h('div', { className: 'ws-reader-chapter' }, String(chapter?.title ?? '') || t('reader.loading')),
          ),
          h(
            'button',
            { className: 'ws-btn', 'data-kind': 'ghost', title: t('reader.toc'), onClick: () => setDrawer('toc') },
            h(IcoList),
          ),
          h(
            'button',
            {
              className: 'ws-btn',
              'data-kind': 'ghost',
              title: t('reader.highlights'),
              onClick: async () => {
                setDrawer('highlights')
                if (highlights !== null) return
                try {
                  const data = await get(`/bookmarks?bookId=${encodeURIComponent(bookId)}`)
                  setHighlights(data)
                } catch (failure) {
                  setHighlights({ count: 0, chapters: [], error: failure.message })
                }
              },
            },
            t('reader.highlights'),
          ),
          h(
            'button',
            { className: 'ws-btn', 'data-kind': 'ghost', title: t('reader.notes'), onClick: () => setDrawer('notes') },
            h(IcoNote),
            notes.length > 0 ? h('span', { className: 'ws-badge' }, String(notes.length)) : null,
          ),
          h(
            'button',
            {
              className: 'ws-btn',
              'data-kind': chatOpen ? 'primary' : 'ghost',
              title: t('ai.title'),
              onClick: () => setChatOpen((open) => !open),
            },
            h(IcoSparkle),
          ),
          h(
            'button',
            { className: 'ws-btn', 'data-kind': 'ghost', title: t('reader.settings'), onClick: () => setFontOpen((open) => !open) },
            h(IcoType),
          ),
        ),

        /* 正文与对话栏并排：对话栏是常驻的一「栏」，不是盖住正文的遮罩。
           用户明确要「出一栏用于对话」——用遮罩等于每问一句正文就看不见了。 */
        h(
          'div',
          { className: 'ws-reader-main' },
          status === 'loading'
            ? h(
                'div',
                { className: 'ws-reader-body ws-scroll' },
                h(
                  'div',
                  { className: 'ws-paper-inner', style: bodyStyle },
                  [0, 1, 2, 3, 4, 5].map((index) =>
                    h('div', { key: index, className: 'ws-skeleton', style: { marginBottom: 14, width: `${88 - index * 7}%` } }),
                  ),
                ),
              )
            : body,
          chatOpen
            ? h(AiPanel, {
                t,
                state: chat,
                scope,
                /* 换范围要开新的一轮上下文：后端只在「首问」时拼上下文，
                   沿用旧 sessionId 的话，切到「这一章」也不会真的把整章发过去。 */
                onScope: (value) => {
                  setScope(value)
                  setChat((current) => ({ ...current, sessionId: '', turns: 0 }))
                },
                onClose: () => setChatOpen(false),
                onAsk: (question) => {
                  const pending = String(chat.pendingQuote ?? '')
                  void askAi('ask', question, { quote: pending, scope })
                  if (pending !== '') setChat((current) => ({ ...current, pendingQuote: '' }))
                },
                quote: String(chat.pendingQuote ?? ''),
                onClearQuote: () => setChat((current) => ({ ...current, pendingQuote: '' })),
                onStop: stopAi,
                onExpand: onAskPage === undefined ? undefined : () => onAskPage(bookId),
                onReset: async () => {
                  try {
                    await post('/ask/reset', { sessionId: chat.sessionId })
                  } catch {
                    undefined
                  }
                  setChat({ sessionId: '', turns: 0, messages: [], history: [], status: 'idle', error: '' })
                },
              })
            : null,
        ),

        fontOpen
          ? h(SettingsPanel, {
              t,
              settings,
              onChange: onSettings,
              onClose: () => setFontOpen(false),
            })
          : null,

        h(
          'div',
          { className: 'ws-reader-foot', 'data-hidden': String(chromeHidden) },
          h('button', { className: 'ws-btn', 'data-kind': 'ghost', onClick: () => setChapterIndex(Math.max(0, chapterIndex - 1)) }, h(IcoArrowLeft)),
          h(
            'div',
            {
              className: 'ws-track',
              onClick: (event) => {
                const rect = event.currentTarget.getBoundingClientRect()
                const ratio = clamp((event.clientX - rect.left) / rect.width, 0, 1)
                const target = Math.round(ratio * (total - 1))
                if (target !== chapterIndex) setChapterIndex(target)
              },
            },
            h(
              'div',
              { className: 'ws-track-inner' },
              h('div', { className: 'ws-track-fill', style: { width: `${overall}%` } }),
              h('div', { className: 'ws-track-dot', style: { left: `${overall}%` } }),
            ),
          ),
          h('span', { className: 'ws-reader-meta' }, t('reader.chapter').replace('{i}', String(chapterIndex + 1)).replace('{n}', String(total))),
          settings.mode === 'paged' ? h('span', { className: 'ws-reader-meta' }, t('reader.page').replace('{a}', String(page + 1)).replace('{b}', String(pages))) : null,
          h('span', { className: 'ws-reader-meta' }, `${overall}%`),
          h('button', { className: 'ws-btn', 'data-kind': 'ghost', onClick: () => setChapterIndex(Math.min(total - 1, chapterIndex + 1)) }, h(IcoArrowRight)),
        ),

        selection !== null
          ? h(
              'div',
              { className: 'ws-selbar', style: { top: selection.top, left: selection.left, transform: 'translateX(-50%)' } },
              h(
                'button',
                {
                  onClick: () => {
                    setSelection(null)
                    /* 传递方式改了：原文放进 quote，问题留空，
                       这样后端才会用 explain 的指令去解释这段，
                       而不是把原文本当成「读者的问题」。 */
                    void askAi(primaryMode, '', { quote: selection.text, scope: 'selection' })
                  },
                },
                h(IcoSparkle),
                ' ',
                t(`ai.${primaryMode}`),
              ),
              h(
                'button',
                {
                  onClick: () => {
                    setSelection(null)
                    void askAi(otherMode, '', { quote: selection.text, scope: 'selection' })
                  },
                },
                t(`ai.${otherMode}`),
              ),
              h(
                'button',
                {
                  onClick: async () => {
                    const text = selection.text
                    setSelection(null)
                    try {
                      await post('/notes', {
                        bookId,
                        bookTitle: meta?.title ?? '',
                        chapterIndex,
                        chapterTitle: chapter?.title ?? toc[chapterIndex]?.title ?? '',
                        quote: text.slice(0, 4000),
                        note: '',
                        mode: 'note',
                      })
                      await reloadNotes()
                      onNotesChanged?.()
                    } catch {
                      undefined
                    }
                  },
                },
                t('ai.note'),
              ),
              h(
                'button',
                {
                  onClick: () => {
                    setSelection(null)
                    /* 「直接问」：把选中原文带上作为引用，打开侧栏等读者输入问题。
                       原来是直接把原文当问题发出去，等于让模型猜读者想问什么。 */
                    setChat((current) => ({
                      ...current,
                      messages: current.messages,
                      pendingQuote: selection.text,
                    }))
                    setChatOpen(true)
                    setScope('selection')
                  },
                },
                t('ai.ask'),
              ),
            )
          : null,

        drawer === 'toc'
          ? h(
              'div',
              {},
              h('div', { className: 'ws-scrim', onClick: () => setDrawer('') }),
              h(
                'div',
                { className: 'ws-drawer', 'data-side': 'left' },
                h(
                  'div',
                  { className: 'ws-drawer-head' },
                  h('div', { className: 'ws-drawer-title' }, t('reader.toc')),
                  h('button', { className: 'ws-btn', 'data-kind': 'ghost', onClick: () => setDrawer('') }, h(IcoClose)),
                ),
                h(
                  'div',
                  { className: 'ws-drawer-body' },
                  toc.map((item) =>
                    h(
                      'button',
                      {
                        key: item.index,
                        className: 'ws-toc-item',
                        'data-active': item.index === chapterIndex,
                        onClick: () => {
                          setChapterIndex(item.index)
                          setDrawer('')
                        },
                      },
                      h('span', { className: 'ws-toc-index' }, String(item.index + 1)),
                      h('span', { className: 'ws-toc-title' }, String(item.title ?? '')),
                      item.index === chapterIndex ? h('span', { className: 'ws-toc-dot' }) : null,
                    ),
                  ),
                ),
              ),
            )
          : null,

        drawer === 'notes'
          ? h(
              'div',
              {},
              h('div', { className: 'ws-scrim', onClick: () => setDrawer('') }),
              h(NoteDrawer, {
                t,
                notes: notes.filter((note) => Number(note.chapterIndex) === chapterIndex),
                allNotes: notes,
                bookId,
                onClose: () => setDrawer(''),
                onJump: (note) => {
                  setDrawer('')
                  if (Number(note.chapterIndex) !== chapterIndex) setChapterIndex(Number(note.chapterIndex))
                  else pendingQuoteRef.current = String(note.quote ?? '')
                  pendingQuoteRef.current = String(note.quote ?? '')
                },
                onChanged: reloadNotes,
              }),
            )
          : null,

        drawer === 'highlights'
          ? h(
              'div',
              {},
              h('div', { className: 'ws-scrim', onClick: () => setDrawer('') }),
              h(
                'div',
                { className: 'ws-drawer' },
                h(
                  'div',
                  { className: 'ws-drawer-head' },
                  h('div', { className: 'ws-drawer-title' }, t('reader.highlights')),
                  h('button', { className: 'ws-btn', 'data-kind': 'ghost', onClick: () => setDrawer('') }, h(IcoClose)),
                ),
                h(
                  'div',
                  { className: 'ws-drawer-body' },
                  highlights === null
                    ? h('div', { className: 'ws-hint' }, t('common.loading'))
                    : highlights.chapters.length === 0
                      ? h('div', { className: 'ws-hint' }, highlights.error ?? t('reader.noHighlights'))
                      : h(
                          'div',
                          {},
                          highlights.source !== undefined && highlights.source !== 'gateway'
                            ? h('div', { className: 'ws-hl-source' }, t('reader.highlightsFromCache'))
                            : null,
                          jumpMissed ? h('div', { className: 'ws-hint' }, t('reader.jumpMiss')) : null,
                          highlights.chapters.map((group) =>
                            h(
                              'div',
                              { key: group.chapterUid, style: { marginBottom: 16 } },
                              h(
                                'button',
                                {
                                  className: 'ws-label ws-hl-jump',
                                  /* 划线是按 chapterUid 归类的，本地目录按 index，换算后才能跳对章。 */
                                  onClick: () => {
                                    const target = toc.findIndex((item) => String(item.chapterUid ?? '') === String(group.chapterUid ?? ''))
                                    if (target >= 0) {
                                      setJumpMissed(false)
                                      setChapterIndex(target)
                                      setDrawer('')
                                    } else {
                                      setJumpMissed(true)
                                    }
                                  },
                                  title: t('reader.jumpToChapter'),
                                },
                                String(group.chapterTitle ?? ''),
                              ),
                              ...(group.highlights ?? []).map((mark, index) =>
                                h(
                                  'div',
                                  {
                                    key: `h-${group.chapterUid}-${index}`,
                                    className: 'ws-hl-mark',
                                    style: { marginBottom: 6 },
                                    onClick: () => {
                                      pendingQuoteRef.current = String(mark.text ?? '')
                                      setDrawer('')
                                    },
                                  },
                                  String(mark.text ?? ''),
                                ),
                              ),
                              ...(group.thoughts ?? []).map((thought, index) =>
                                h(
                                  'div',
                                  { key: `t-${group.chapterUid}-${index}`, className: 'ws-hl-thought', style: { marginBottom: 6 } },
                                  h('div', { className: 'ws-hl-kind' }, t('reader.thought')),
                                  thought.abstract
                                    ? h('div', { className: 'ws-hl-source' }, t('reader.thoughtOn').replace('{q}', String(thought.abstract)))
                                    : null,
                                  h('div', null, String(thought.content ?? '')),
                                ),
                              ),
                            ),
                          ),
                        ),
                ),
              ),
            )
          : null,

        /* 旧的遮罩式 AI 抽屉已移除：现在是常驻的 .ws-ai-side 一栏。 */
      )
    }

    /* ── AI 面板 ──────────────────────────────────────────────── */

    function AiPanel(props) {
      const { t, state, scope, onScope, onClose, onAsk, onStop, onReset, quote, onClearQuote, onExpand } = props
      const [draft, setDraft] = useState('')
      const logRef = useRef(null)
      const inputRef = useRef(null)
      /* 等第一个字的时间。实测推理模型要先想 80 秒以上才吐正文，
         这段时间里界面如果只写「正在想…」而不动，读者会以为卡死了——
         有秒数在跳，就知道它还活着。 */
      const [elapsed, setElapsed] = useState(0)

      useEffect(() => {
        inputRef.current?.focus?.()
      }, [])

      useEffect(() => {
        if (state.status !== 'streaming') {
          setElapsed(0)
          return
        }
        const startedAt = Date.now()
        setElapsed(0)
        const timer = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000)
        return () => clearInterval(timer)
      }, [state.status])

      useEffect(() => {
        const element = logRef.current
        if (element === null) return
        element.scrollTop = element.scrollHeight
      }, [state.messages, state.status])

      const streaming = state.status === 'streaming'
      const messages = Array.isArray(state.messages) ? state.messages : []

      const send = () => {
        const question = draft.trim()
        if (streaming) return
        if (question === '' && String(quote ?? '') === '') return
        setDraft('')
        onAsk(question)
      }

      return h(
        'div',
        { className: 'ws-ai ws-ai-side' },
        h(
          'div',
          { className: 'ws-drawer-head' },
          h('div', { className: 'ws-drawer-title' }, t('ai.title')),
          onExpand === undefined
            ? null
            : h('button', { className: 'ws-btn', 'data-kind': 'ghost', title: t('ai.expandPanel'), onClick: onExpand }, h(IcoArrowRight)),
          h('button', { className: 'ws-btn', 'data-kind': 'ghost', title: t('ai.reset'), onClick: onReset }, h(IcoRefresh)),
          /* 对话页里没有「关掉」这回事——那一栏就是页面本身。
             给个按了没反应的关闭按钮比不给更糟。 */
          onClose === undefined
            ? null
            : h('button', { className: 'ws-btn', 'data-kind': 'ghost', title: t('ai.close'), onClick: onClose }, h(IcoClose)),
        ),
        /* 范围选择：选中 / 本章 / 全书。放在最上头，因为它决定「这个问题能问多大」，
           读者每次提问前都该看见自己现在问的是哪一层。 */
        h(
          'div',
          { className: 'ws-ai-scope' },
          h(
            'div',
            { className: 'ws-seg' },
            ['selection', 'chapter', 'book'].map((value) =>
              h(
                'button',
                {
                  key: value,
                  'data-active': String(scope === value),
                  onClick: () => onScope(value),
                },
                t(`ai.scope.${value}`),
              ),
            ),
          ),
          h('span', { className: 'ws-hint' }, t(`ai.scopeHint.${scope}`)),
        ),
        String(quote ?? '') !== ''
          ? h(
              'div',
              { className: 'ws-ai-quote' },
              h('div', { className: 'ws-ai-quote-text' }, String(quote)),
              h('button', { className: 'ws-btn', 'data-kind': 'ghost', title: t('ai.clearQuote'), onClick: onClearQuote }, h(IcoClose)),
            )
          : null,
        h(
          'div',
          { className: 'ws-ai-log ws-scroll', ref: logRef },
          messages.length === 0
            ? h('div', { className: 'ws-ai-empty' }, t('ai.empty'))
            : messages.map((message) =>
                h(
                  'div',
                  { key: message.id, className: 'ws-msg', 'data-role': message.role },
                  String(message.quote ?? '') !== ''
                    ? h('div', { className: 'ws-msg-quote' }, String(message.quote))
                    : null,
                  /* 思考过程。只在还没有正文的时候显示——一旦开始写答案，
                     这些推理就是过程噪声，挡着读者看答案。 */
                  message.role === 'assistant' && String(message.text ?? '') === '' && String(message.reasoning ?? '') !== ''
                    ? h(
                        'details',
                        { className: 'ws-ai-think', open: true },
                        h('summary', null, t('ai.reasoning')),
                        h('div', { className: 'ws-ai-think-body' }, String(message.reasoning ?? '')),
                      )
                    : null,
                  h(
                    'div',
                    { className: 'ws-bubble' },
                    message.role === 'assistant' && String(message.text ?? '') === '' && streaming
                      ? h(
                          'span',
                          { className: 'ws-ai-wait' },
                          t('ai.thinking'),
                          elapsed > 0
                            ? h('span', { className: 'ws-ai-elapsed' }, t('ai.thinkingSeconds').replace('{n}', String(elapsed)))
                            : null,
                        )
                      : String(message.text ?? ''),
                    message.role === 'assistant' && streaming && message === messages[messages.length - 1]
                      ? h('span', { className: 'ws-caret' })
                      : null,
                  ),
                  message.role === 'assistant' && String(message.text ?? '') !== ''
                    ? h(
                        'div',
                        { className: 'ws-msg-tools' },
                        h('button', { onClick: () => void copyText(String(message.text ?? '')) }, t('ai.copy')),
                        h('button', { disabled: true, title: t('ai.autoSaved') }, t('ai.autoSaved')),
                      )
                    : null,
                ),
              ),
          String(state.error ?? '') !== '' ? h('div', { className: 'ws-error' }, String(state.error)) : null,
        ),
        h(
          'div',
          { className: 'ws-ai-composer' },
          h(
            'div',
            { className: 'ws-ai-input-row' },
            h('textarea', {
              ref: inputRef,
              className: 'ws-area',
              rows: 1,
              style: { minHeight: 38, maxHeight: 120 },
              placeholder: t('ai.placeholder'),
              value: draft,
              onChange: (event) => setDraft(event.target.value),
              onKeyDown: (event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  send()
                }
              },
            }),
            streaming
              ? h('button', { className: 'ws-btn', 'data-kind': 'ghost', title: t('ai.stop'), onClick: onStop }, t('ai.stop'))
              : h(
                  'button',
                  {
                    className: 'ws-btn',
                    'data-kind': 'primary',
                    disabled: draft.trim() === '' && String(quote ?? '') === '',
                    onClick: send,
                  },
                  h(IcoSend),
                ),
          ),
          h(
            'div',
            { className: 'ws-hint' },
            `${t('ai.enterHint')}${state.turns > 0 ? ` · ${t('ai.turnCount').replace('{n}', String(state.turns))}` : ''}`,
          ),
        ),
      )
    }

    /* ── 笔记抽屉 ─────────────────────────────────────────────── */

    function NoteDrawer(props) {
      const { t, notes, allNotes, bookId, onClose, onJump, onChanged } = props
      const [editing, setEditing] = useState('')
      const [draft, setDraft] = useState('')
      const [tagDraft, setTagDraft] = useState('')
      const [error, setError] = useState('')

      const save = async (note) => {
        try {
          await patch('/notes', {
            id: note.id,
            patch: {
              note: draft,
              tags: tagDraft.split(/[,，]/).map((tag) => tag.trim()).filter((tag) => tag !== ''),
            },
          })
          setEditing('')
          await onChanged()
        } catch (failure) {
          setError(failure.message ?? String(failure))
        }
      }

      const remove = async (note) => {
        try {
          await del('/notes', { id: note.id })
          await onChanged()
        } catch (failure) {
          setError(failure.message ?? String(failure))
        }
      }

      return h(
        'div',
        { className: 'ws-drawer' },
        h(
          'div',
          { className: 'ws-drawer-head' },
          h('div', { className: 'ws-drawer-title' }, `${t('notes.title')} · ${allNotes.length}`),
          h('button', { className: 'ws-btn', 'data-kind': 'ghost', onClick: onClose }, h(IcoClose)),
        ),
        h(
          'div',
          { className: 'ws-drawer-body' },
          error !== '' ? h('div', { className: 'ws-error', style: { marginBottom: 8 } }, error) : null,
          notes.length === 0
            ? h('div', { className: 'ws-hint' }, t('notes.emptyHint'))
            : notes.map((note) =>
                h(
                  'div',
                  { key: note.id, className: 'ws-note', style: { marginBottom: 10 } },
                  h(
                    'div',
                    { className: 'ws-note-quote', onClick: () => onJump(note), title: t('notes.jump') },
                    String(note.quote ?? ''),
                  ),
                  editing === note.id
                    ? h(
                        'div',
                        { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
                        h('textarea', {
                          className: 'ws-area',
                          value: draft,
                          onChange: (event) => setDraft(event.target.value),
                        }),
                        h('input', {
                          className: 'ws-input',
                          placeholder: t('notes.tags'),
                          value: tagDraft,
                          onChange: (event) => setTagDraft(event.target.value),
                        }),
                        h(
                          'div',
                          { className: 'ws-row' },
                          h('button', { className: 'ws-btn', 'data-kind': 'primary', onClick: () => save(note) }, t('notes.save')),
                          h('button', { className: 'ws-btn', 'data-kind': 'ghost', onClick: () => setEditing('') }, t('notes.cancel')),
                        ),
                      )
                    : h(
                        'div',
                        { className: 'ws-note-body' },
                        String(note.note ?? '') === '' ? t('notes.quoteOnly') : String(note.note ?? ''),
                      ),
                  editing === note.id
                    ? null
                    : h(
                        'div',
                        { className: 'ws-note-meta' },
                        ...(Array.isArray(note.tags) ? note.tags.map((tag) => h('span', { key: tag, className: 'ws-tag' }, tag)) : []),
                        h('span', {}, String(note.chapterTitle ?? '')),
                        h('span', {}, fmtWhen(note.updatedAt ?? note.createdAt)),
                        h('span', { className: 'ws-spacer' }),
                        h(
                          'button',
                          {
                            className: 'ws-btn',
                            'data-kind': 'ghost',
                            style: { padding: '2px 6px', fontSize: 11 },
                            onClick: () => {
                              setEditing(note.id)
                              setDraft(String(note.note ?? ''))
                              setTagDraft(Array.isArray(note.tags) ? note.tags.join(', ') : '')
                            },
                          },
                          t('notes.edit'),
                        ),
                        h(
                          'button',
                          {
                            className: 'ws-btn',
                            'data-kind': 'ghost',
                            style: { padding: '2px 6px', fontSize: 11 },
                            onClick: () => void remove(note),
                          },
                          t('notes.delete'),
                        ),
                      ),
                ),
              ),
        ),
      )
    }

    /* ── 排版面板 ─────────────────────────────────────────────── */

    function SettingsPanel(props) {
      const { t, settings, onChange, onClose } = props
      const set = (patch) => onChange({ ...settings, ...patch })
      return h(
        'div',
        {
          className: 'ws-drawer',
          style: { inset: 'auto 12px 60px auto', width: 'min(340px, calc(100% - 24px))', borderRadius: 12, border: '1px solid var(--ws-line)' },
        },
        h(
          'div',
          { className: 'ws-drawer-head' },
          h('div', { className: 'ws-drawer-title' }, t('reader.settings')),
          h('button', { className: 'ws-btn', 'data-kind': 'ghost', onClick: onClose }, h(IcoClose)),
        ),
        h(
          'div',
          { className: 'ws-drawer-body', style: { display: 'flex', flexDirection: 'column', gap: 14 } },
          h(
            'div',
            { className: 'ws-field' },
            h('div', { className: 'ws-label' }, t('settings.theme')),
            h(
              'div',
              { className: 'ws-seg' },
              ['follow', 'paper', 'sepia', 'moss', 'ink', 'night'].map((key) =>
                h(
                  'button',
                  { key, 'data-active': settings.theme === key, onClick: () => set({ theme: key }) },
                  t(`theme.${key}`),
                ),
              ),
            ),
          ),
          h(
            'div',
            { className: 'ws-field' },
            h('div', { className: 'ws-label' }, t('settings.font')),
            h(
              'div',
              { className: 'ws-seg' },
              ['serif', 'sans', 'kai'].map((key) =>
                h('button', { key, 'data-active': settings.fontFamily === key, onClick: () => set({ fontFamily: key }) }, t(`font.${key}`)),
              ),
            ),
          ),
          h(
            'div',
            { className: 'ws-field' },
            h('div', { className: 'ws-label' }, `${t('settings.size')} · ${settings.fontSize}px`),
            h('div', { className: 'ws-slider' }, h('input', {
              type: 'range', min: 14, max: 34, step: 1, value: settings.fontSize,
              onChange: (event) => set({ fontSize: Number(event.target.value) }),
            })),
          ),
          h(
            'div',
            { className: 'ws-field' },
            h('div', { className: 'ws-label' }, `${t('settings.lineHeight')} · ${settings.lineHeight.toFixed(1)}`),
            h('div', { className: 'ws-slider' }, h('input', {
              type: 'range', min: 1.3, max: 2.6, step: 0.1, value: settings.lineHeight,
              onChange: (event) => set({ lineHeight: Number(event.target.value) }),
            })),
          ),
          h(
            'div',
            { className: 'ws-field' },
            h('div', { className: 'ws-label' }, `${t('settings.measure')} · ${settings.measure}`),
            h('div', { className: 'ws-slider' }, h('input', {
              type: 'range', min: 20, max: 60, step: 2, value: settings.measure,
              onChange: (event) => set({ measure: Number(event.target.value) }),
            })),
          ),
          h(
            'div',
            { className: 'ws-field' },
            h('div', { className: 'ws-label' }, t('settings.mode')),
            h(
              'div',
              { className: 'ws-seg' },
              ['scroll', 'paged'].map((key) =>
                h('button', { key, 'data-active': settings.mode === key, onClick: () => set({ mode: key }) }, t(`mode.${key}`)),
              ),
            ),
          ),
          h(
            'label',
            { className: 'ws-row', style: { cursor: 'pointer' } },
            h('input', { type: 'checkbox', checked: settings.justify, onChange: (event) => set({ justify: event.target.checked }) }),
            h('span', { style: { fontSize: 13 } }, t('settings.justify')),
          ),
          h(
            'label',
            { className: 'ws-row', style: { cursor: 'pointer' } },
            h('input', { type: 'checkbox', checked: settings.chromeAutoHide, onChange: (event) => set({ chromeAutoHide: event.target.checked }) }),
            h('span', { style: { fontSize: 13 } }, t('settings.autoHide')),
          ),
        ),
      )
    }

    /* ── 笔记页 ───────────────────────────────────────────────── */

    function LocalNotesPage(props) {
      const { t, onJump } = props
      const [items, setItems] = useState([])
      const [tags, setTags] = useState({})
      const [query, setQuery] = useState('')
      const [tag, setTag] = useState('')
      const [editing, setEditing] = useState('')
      const [draft, setDraft] = useState('')
      const [tagDraft, setTagDraft] = useState('')
      const [status, setStatus] = useState('loading')

      const load = useCallback(async () => {
        setStatus('loading')
        try {
          const params = new URLSearchParams()
          if (query.trim() !== '') params.set('query', query.trim())
          if (tag !== '') params.set('tag', tag)
          const data = await get(`/notes?${params.toString()}`)
          setItems(data.items ?? [])
          setTags(data.tags ?? {})
        } catch {
          setItems([])
        } finally {
          setStatus('ready')
        }
      }, [query, tag])

      useEffect(() => {
        const timer = setTimeout(() => void load(), 300)
        return () => clearTimeout(timer)
      }, [load])

      const grouped = useMemo(() => {
        const map = new Map()
        for (const note of items) {
          const key = String(note.bookId ?? '')
          const group = map.get(key) ?? { bookId: key, bookTitle: String(note.bookTitle ?? ''), notes: [] }
          group.notes.push(note)
          map.set(key, group)
        }
        return [...map.values()]
      }, [items])

      return h(
        'div',
        { className: 'ws-shelf ws-scroll' },
        h(
          'div',
          { className: 'ws-shelf-tools' },
          h(
            'div',
            { className: 'ws-shelf-search' },
            h('input', {
              className: 'ws-input',
              placeholder: t('notes.search'),
              value: query,
              onChange: (event) => setQuery(event.target.value),
            }),
          ),
          h(
            'select',
            { className: 'ws-select', style: { width: 'auto' }, value: tag, onChange: (event) => setTag(event.target.value) },
            h('option', { value: '' }, t('notes.allTags')),
            Object.entries(tags).map(([name, count]) => h('option', { key: name, value: name }, `${name} (${count})`)),
          ),
          h(
            'button',
            {
              className: 'ws-btn',
              onClick: async () => {
                try {
                  const data = await get(`/export/notes`)
                  await download(`书蠹-笔记.md`, data.markdown ?? '')
                } catch {
                  undefined
                }
              },
            },
            t('notes.export'),
          ),
        ),
        status === 'loading'
          ? h('div', { className: 'ws-hint' }, t('common.loading'))
          : items.length === 0
            ? h(
                'div',
                { className: 'ws-empty' },
                h(IcoNote, { width: 28, height: 28, strokeWidth: 1.2 }),
                h('div', { className: 'ws-empty-title' }, t('notes.empty')),
                h('div', { className: 'ws-empty-body' }, t('notes.emptyHint')),
              )
            : grouped.map((group) =>
                h(
                  'div',
                  { key: group.bookId },
                  h(
                    'div',
                    { className: 'ws-row', style: { marginBottom: 8 } },
                    h('div', { className: 'ws-section-title' }, group.bookTitle),
                    h('span', { className: 'ws-spacer' }),
                    h(
                      'button',
                      {
                        className: 'ws-btn',
                        'data-kind': 'ghost',
                        style: { fontSize: 12 },
                        onClick: async () => {
                          try {
                            const data = await get(`/export/notes?bookId=${encodeURIComponent(group.bookId)}`)
                            await download(`书蠹-${group.bookTitle}.md`, data.markdown ?? '')
                          } catch {
                            undefined
                          }
                        },
                      },
                      t('notes.exportBook'),
                    ),
                  ),
                  ...group.notes.map((note) =>
                    h(
                      'div',
                      { key: note.id, className: 'ws-note', style: { marginBottom: 9 } },
                      h(
                        'div',
                        { className: 'ws-note-quote', onClick: () => onJump(note), title: t('notes.jump') },
                        String(note.quote ?? ''),
                      ),
                      editing === note.id
                        ? h(
                            'div',
                            { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
                            h('textarea', { className: 'ws-area', value: draft, onChange: (event) => setDraft(event.target.value) }),
                            h('input', {
                              className: 'ws-input',
                              placeholder: t('notes.tags'),
                              value: tagDraft,
                              onChange: (event) => setTagDraft(event.target.value),
                            }),
                            h(
                              'div',
                              { className: 'ws-row' },
                              h(
                                'button',
                                {
                                  className: 'ws-btn',
                                  'data-kind': 'primary',
                                  onClick: async () => {
                                    try {
                                      await patch('/notes', {
                                        id: note.id,
                                        patch: {
                                          note: draft,
                                          tags: tagDraft.split(/[,，]/).map((item) => item.trim()).filter((item) => item !== ''),
                                        },
                                      })
                                      setEditing('')
                                      await load()
                                    } catch {
                                      undefined
                                    }
                                  },
                                },
                                t('notes.save'),
                              ),
                              h('button', { className: 'ws-btn', 'data-kind': 'ghost', onClick: () => setEditing('') }, t('notes.cancel')),
                            ),
                          )
                        : h(
                            'div',
                            { className: 'ws-note-body' },
                            String(note.note ?? '') === '' ? t('notes.quoteOnly') : String(note.note ?? ''),
                          ),
                      h(
                        'div',
                        { className: 'ws-note-meta' },
                        ...(Array.isArray(note.tags) ? note.tags.map((name) => h('span', { key: name, className: 'ws-tag' }, name)) : []),
                        h('span', {}, String(note.chapterTitle ?? '')),
                        h('span', {}, fmtWhen(note.updatedAt ?? note.createdAt)),
                        h('span', { className: 'ws-spacer' }),
                        h(
                          'button',
                          {
                            className: 'ws-btn',
                            'data-kind': 'ghost',
                            style: { padding: '2px 6px', fontSize: 11 },
                            onClick: () => {
                              setEditing(note.id)
                              setDraft(String(note.note ?? ''))
                              setTagDraft(Array.isArray(note.tags) ? note.tags.join(', ') : '')
                            },
                          },
                          t('notes.edit'),
                        ),
                        h(
                          'button',
                          {
                            className: 'ws-btn',
                            'data-kind': 'ghost',
                            style: { padding: '2px 6px', fontSize: 11 },
                            onClick: async () => {
                              try {
                                await del('/notes', { id: note.id })
                                await load()
                              } catch {
                                undefined
                              }
                            },
                          },
                          t('notes.delete'),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
      )
    }

    /** 微信读书云笔记：170 本笔记本概览，点书名展开划线+想法。 */
    function CloudNotesView(props) {
      const t = props.t
      const onJump = props.onJump
      const [books, setBooks] = useState([])
      const [status, setStatus] = useState('loading')
      const [error, setError] = useState('')
      const [query, setQuery] = useState('')
      const [sort, setSort] = useState('notes')
      const [expanded, setExpanded] = useState('')
      const [detail, setDetail] = useState({})
      /* 书名过滤（本地、瞬时）与内容搜索（走云端索引、有预算）是两件事，分开管。 */
      const [scope, setScope] = useState('title')
      const [found, setFound] = useState(null)
      const [searching, setSearching] = useState(false)
      const [searchError, setSearchError] = useState('')
      const [deepQuery, setDeepQuery] = useState('')

      useEffect(() => {
        let alive = true
        setStatus('loading')
        setError('')
        get('/weread/notebooks')
          .then((data) => {
            if (!alive) return
            setBooks(Array.isArray(data.books) ? data.books : [])
            setStatus('ready')
          })
          .catch((err) => {
            if (!alive) return
            setError(String(err?.message ?? err ?? ''))
            setStatus('error')
          })
        return () => { alive = false }
      }, [])

      /** 内容搜索：一次最多花 10 秒，结果可能不全，如实告知。 */
      const runSearch = useCallback(async (needle) => {
        const word = String(needle ?? '').trim()
        if (word === '') return
        setSearching(true)
        setSearchError('')
        setDeepQuery(word)
        try {
          const data = await get(
            `/weread/notes-search?query=${encodeURIComponent(word)}&limit=40&budgetMs=10000`,
          )
          setFound(data)
        } catch (err) {
          setSearchError(String(err?.message ?? err ?? ''))
          setFound(null)
        } finally {
          setSearching(false)
        }
      }, [])

      const visible = useMemo(() => {
        const needle = query.trim().toLowerCase()
        const list = books.filter((b) => {
          if (needle === '') return true
          return `${b.title ?? ''} ${b.author ?? ''}`.toLowerCase().includes(needle)
        })
        if (sort === 'title') return [...list].sort((a, b) => String(a.title ?? '').localeCompare(String(b.title ?? ''), 'zh'))
        if (sort === 'recent') return [...list].sort((a, b) => (b.sort ?? 0) - (a.sort ?? 0))
        return [...list].sort((a, b) => (b.total ?? 0) - (a.total ?? 0))
      }, [books, query, sort])

      const totalNotes = useMemo(() => books.reduce((sum, b) => sum + (b.total ?? 0), 0), [books])

      const toggle = useCallback(async (book) => {
        const key = String(book.bookId ?? '')
        if (key === '') return
        if (expanded === key) {
          setExpanded('')
          return
        }
        setExpanded(key)
        if (detail[key] !== undefined) return
        setDetail((prev) => ({ ...prev, [key]: { loading: true } }))
        try {
          const data = await get(`/weread/cloud-bookmarks?bookId=${encodeURIComponent(key)}`)
          setDetail((prev) => ({ ...prev, [key]: { loading: false, data } }))
        } catch (err) {
          setDetail((prev) => ({ ...prev, [key]: { loading: false, error: String(err?.message ?? err ?? '') } }))
        }
      }, [expanded, detail])

      return h(
        'div',
        { className: 'ws-shelf ws-scroll' },
        h(
          'div',
          { className: 'ws-shelf-tools' },
          h(
            'div',
            { className: 'ws-scope-seg' },
            h(
              'button',
              { 'data-active': scope === 'title' ? 'true' : undefined, onClick: () => setScope('title') },
              t('notes.scopeTitle'),
            ),
            h(
              'button',
              { 'data-active': scope === 'content' ? 'true' : undefined, onClick: () => setScope('content') },
              t('notes.scopeContent'),
            ),
          ),
          h(
            'div',
            { className: 'ws-shelf-search' },
            h('input', {
              className: 'ws-input',
              placeholder: scope === 'content' ? t('notes.searchContentPlaceholder') : t('notes.cloudSearch'),
              value: query,
              onChange: (event) => setQuery(event.target.value),
              onKeyDown: (event) => {
                if (event.key === 'Enter' && scope === 'content') {
                  event.preventDefault()
                  void runSearch(query)
                }
              },
            }),
            scope === 'content'
              ? h(
                  'button',
                  { className: 'ws-btn', 'data-kind': 'primary', disabled: searching || query.trim() === '', onClick: () => void runSearch(query) },
                  searching ? t('common.loading') : t('notes.searchContentGo'),
                )
              : null,
          ),
          scope === 'title'
            ? h(
                'select',
                { className: 'ws-select', style: { width: 'auto' }, value: sort, onChange: (event) => setSort(event.target.value) },
                h('option', { value: 'notes' }, t('notes.sortNotes')),
                h('option', { value: 'title' }, t('notes.sortTitle')),
                h('option', { value: 'recent' }, t('notes.sortRecent')),
              )
            : null,
        ),

        /* 内容搜索结果 */
        scope === 'content'
          ? searching
            ? h('div', { className: 'ws-hint' }, t('notes.searchingHint'))
            : searchError !== ''
              ? h('div', { className: 'ws-empty' }, h('div', {}, searchError))
              : found === null
                ? h('div', { className: 'ws-hint' }, t('notes.searchContentHint'))
                : h(
                    'div',
                    {},
                    h(
                      'div',
                      { className: 'ws-cloud-summary' },
                      t('notes.searchResultSummary')
                        .replace('{q}', deepQuery)
                        .replace('{n}', String(found.hitCount ?? 0))
                        .replace('{s}', String(found.scanned ?? 0))
                        .replace('{a}', String(found.total ?? 0)),
                    ),
                    found.truncated
                      ? h('div', { className: 'ws-hint', style: { marginBottom: 10 } }, t('notes.searchTruncated').replace('{n}', String(found.hitCount ?? 0)))
                      : null,
                    found.partial
                      ? h('div', { className: 'ws-hint', style: { marginBottom: 10 } }, t('notes.searchPartial').replace('{n}', String(found.remaining ?? 0)))
                      : null,
                    (found.hits ?? []).length === 0
                      ? h('div', { className: 'ws-hint' }, t('notes.searchNoHit'))
                      : h(
                          'div',
                          { className: 'ws-cloud-list' },
                          (found.hits ?? []).map((hit, index) =>
                            h(
                              'div',
                              { key: `${hit.bookId}-${index}`, className: 'ws-nhit' },
                              h(
                                'div',
                                { className: 'ws-nhit-head' },
                                h('span', { className: 'ws-nhit-kind' }, hit.kind === 'thought' ? t('notes.thoughtLabel') : t('notes.highlightLabel')),
                                h('span', { className: 'ws-nhit-book' }, `《${hit.bookTitle || '—'}》`),
                                hit.chapterTitle ? h('span', { className: 'ws-nhit-chapter' }, String(hit.chapterTitle)) : null,
                              ),
                              h('div', { className: 'ws-nhit-text' }, String(hit.text || hit.abstract || '')),
                              hit.kind === 'thought' && hit.abstract
                                ? h('div', { className: 'ws-hl-source' }, `${t('notes.abstractLabel')}：${String(hit.abstract)}`)
                                : null,
                            ),
                          ),
                        ),
                  )
          : status === 'loading'
            ? h('div', { className: 'ws-hint' }, t('notes.cloudLoading'))
            : status === 'error'
              ? h('div', { className: 'ws-empty' }, h('div', {}, t('notes.cloudError').replace('{e}', error)))
              : h(
                  'div',
                  {},
                  h('div', { className: 'ws-cloud-summary' }, t('notes.cloudHint').replace('{n}', String(books.length)).replace('{m}', String(totalNotes))),
                  h(
                    'div',
                    { className: 'ws-cloud-list' },
                    visible.map((book) => {
                      const key = String(book.bookId ?? '')
                      const isOpen = expanded === key
                      const state = detail[key] ?? null
                      /* 只有本地有目录的书才跳得动正文。 */
                      const canOpen = Boolean(book.canOpen) && String(book.localId ?? '') !== ''
                      return h(
                        'div',
                        { key, className: 'ws-cloud-book', 'data-open': isOpen ? 'true' : undefined },
                        h(
                          'button',
                          { className: 'ws-cloud-book-head', onClick: () => void toggle(book) },
                          h(
                            'div',
                            { className: 'ws-cloud-cover' },
                            String(book.cover ?? '') !== ''
                              ? h('img', { src: String(book.cover), alt: '', loading: 'lazy' })
                              : h('span', {}, String(book.title ?? '').slice(0, 2)),
                          ),
                          h(
                            'div',
                            { className: 'ws-cloud-book-meta' },
                            h('div', { className: 'ws-cloud-book-title' }, String(book.title ?? '')),
                            h('div', { className: 'ws-cloud-book-author' }, String(book.author ?? '')),
                            h(
                              'div',
                              { className: 'ws-cloud-book-counts' },
                              h('span', {}, t('notes.hlCount').replace('{n}', String(book.noteCount ?? 0))),
                              h('span', {}, t('notes.thCount').replace('{n}', String(book.reviewCount ?? 0))),
                              (book.bookmarkCount ?? 0) > 0
                                ? h('span', {}, t('notes.bmCount').replace('{n}', String(book.bookmarkCount ?? 0)))
                                : null,
                              /* 跳不动只有一种原因：这本书还没同步到书蠹书架。
                                 在书架但没目录的，reader 打开时会自己补，标个提示就好。 */
                              String(book.localId ?? '') === ''
                                ? h('span', { className: 'ws-cloud-off', title: t('notes.offShelfHint') }, t('notes.offShelf'))
                                : book.needsToc === true
                                  ? h('span', { className: 'ws-cloud-off', title: t('notes.noTocHint') }, t('notes.noToc'))
                                  : null,
                            ),
                          ),
                          h('span', { className: 'ws-cloud-caret' }, isOpen ? '▾' : '▸'),
                        ),
                        isOpen
                          ? h(
                              'div',
                              { className: 'ws-cloud-book-body' },
                              state === null || state.loading
                                ? h('div', { className: 'ws-hint' }, t('common.loading'))
                                : state.error
                                  ? h('div', { className: 'ws-hint' }, state.error)
                                  : (state.data?.chapters ?? []).length === 0
                                    ? h('div', { className: 'ws-hint' }, t('notes.cloudEmpty'))
                                    : h(
                                        'div',
                                        {},
                                        state.data?.source !== 'gateway'
                                          ? h('div', { className: 'ws-hl-source' }, t('reader.highlightsFromCache'))
                                          : null,
                                        state.data.chapters.map((group) =>
                                          h(
                                            'div',
                                            { key: String(group.chapterUid), className: 'ws-cloud-chapter' },
                                            h(
                                              'button',
                                              {
                                                className: 'ws-label ws-hl-jump',
                                                title: canOpen ? t('reader.jumpToChapter') : t('notes.offShelfHint'),
                                                disabled: canOpen ? undefined : true,
                                                onClick: () => {
                                                  if (!canOpen || typeof onJump !== 'function') return
                                                  /* 传本地 id：云端 bookId 那本若不在书架里，跳过去也是空的。 */
                                                  onJump({ bookId: book.localId, chapterUid: String(group.chapterUid ?? '') })
                                                },
                                              },
                                              String(group.chapterTitle ?? ''),
                                            ),
                                            ...(group.highlights ?? []).map((mark, i) =>
                                              h(
                                                'div',
                                                { key: `h-${i}`, className: 'ws-hl-mark', style: { marginBottom: 6 } },
                                                String(mark.text ?? ''),
                                              ),
                                            ),
                                            ...(group.thoughts ?? []).map((thought, i) =>
                                              h(
                                                'div',
                                                { key: `t-${i}`, className: 'ws-hl-thought', style: { marginBottom: 6 } },
                                                h('div', { className: 'ws-hl-kind' }, t('notes.thoughtLabel')),
                                                thought.abstract
                                                  ? h('div', { className: 'ws-hl-source' }, `${t('notes.abstractLabel')}：${String(thought.abstract)}`)
                                                  : null,
                                                h('div', null, String(thought.content ?? '')),
                                              ),
                                            ),
                                          ),
                                        ),
                                      ),
                            )
                          : null,
                      )
                    }),
                  ),
                  visible.length === 0 ? h('div', { className: 'ws-hint' }, t('notes.cloudEmpty')) : null,
                ),
      )
    }

    /** 笔记页外壳：本地 / 微信读书云 来源切换。 */
    function NotesPage(props) {
      const { t } = props
      const [source, setSource] = useState('local')
      return h(
        'div',
        { className: 'ws-notes-shell ws-scroll' },
        h(
          'div',
          { className: 'ws-source-seg' },
          h(
            'button',
            { 'data-active': source === 'local' ? 'true' : undefined, onClick: () => setSource('local') },
            t('notes.sourceLocal'),
          ),
          h(
            'button',
            { 'data-active': source === 'cloud' ? 'true' : undefined, onClick: () => setSource('cloud') },
            t('notes.sourceCloud'),
          ),
        ),
        source === 'local'
          ? h(LocalNotesPage, props)
          : h(CloudNotesView, { t, onJump: props.onJump }),
      )
    }

    /* ── 统计页 ───────────────────────────────────────────────── */

    /** 微信读书官方统计：周期切换 + 时长/偏好/趋势/勋章/书单。 */
    function CloudStatsSection(props) {
      const t = props.t
      const [mode, setMode] = useState('monthly')
      const [data, setData] = useState(null)
      const [status, setStatus] = useState('loading')
      const [error, setError] = useState('')

      useEffect(() => {
        let alive = true
        setStatus('loading')
        setError('')
        get(`/weread/stats?mode=${encodeURIComponent(mode)}`)
          .then((result) => {
            if (!alive) return
            setData(result)
            setStatus('ready')
          })
          .catch((err) => {
            if (!alive) return
            setError(String(err?.message ?? err ?? ''))
            setStatus('error')
          })
        return () => { alive = false }
      }, [mode])

      const trend = data?.trend ?? []
      const trendPeak = Math.max(...trend.map((p) => p.seconds ?? 0), 1)
      const medalCount = (data?.medals ?? []).length

      return h(
        'div',
        { className: 'ws-cloud-stats' },
        h(
          'div',
          { className: 'ws-cloud-stats-head' },
          h('div', { className: 'ws-label' }, t('stats.cloudTitle')),
          h('div', { className: 'ws-hint' }, t('stats.cloudSub')),
        ),
        h(
          'div',
          { className: 'ws-seg' },
          ['weekly', 'monthly', 'annually', 'overall'].map((key) =>
            h(
              'button',
              { key, 'data-active': mode === key ? 'true' : undefined, onClick: () => setMode(key) },
              t(`stats.${key}`),
            ),
          ),
        ),
        status === 'loading'
          ? h('div', { className: 'ws-hint' }, t('common.loading'))
          : status === 'error'
            ? h('div', { className: 'ws-empty' }, h('div', {}, t('stats.cloudError').replace('{e}', error)))
            : h(
                'div',
                {},
                h(
                  'div',
                  { className: 'ws-tiles' },
                  h(
                    'div',
                    { className: 'ws-tile' },
                    h('div', { className: 'ws-tile-value' }, fmtDuration(data?.totalReadTime ?? 0)),
                    h('div', { className: 'ws-tile-label' }, t('stats.readTime')),
                  ),
                  h(
                    'div',
                    { className: 'ws-tile' },
                    h('div', { className: 'ws-tile-value' }, fmtDuration(data?.wrListenTime ?? 0)),
                    h('div', { className: 'ws-tile-label' }, t('stats.listenTime')),
                  ),
                  h(
                    'div',
                    { className: 'ws-tile' },
                    h('div', { className: 'ws-tile-value' }, String(data?.readDays ?? 0)),
                    h('div', { className: 'ws-tile-label' }, t('stats.readDays')),
                  ),
                  h(
                    'div',
                    { className: 'ws-tile' },
                    h('div', { className: 'ws-tile-value' }, fmtDuration(data?.dayAverageReadTime ?? 0)),
                    h('div', { className: 'ws-tile-label' }, t('stats.dayAverage')),
                  ),
                ),
                h(
                  'div',
                  { className: 'ws-cloud-statline' },
                  (data?.preferCategoryWord ?? '') !== ''
                    ? h('span', {}, `${t('stats.preferCategory')}：${data.preferCategoryWord}`)
                    : null,
                  (data?.preferTimeWord ?? '') !== '' ? h('span', {}, `${t('stats.trend')}：${data.preferTimeWord}`) : null,
                  Number(data?.compare ?? 0) !== 0
                    ? h('span', {}, `${t('stats.compare')}：${Number(data.compare) > 0 ? '+' : ''}${Math.round(Number(data.compare) * 100)}%`)
                    : null,
                ),
                (data?.stats ?? []).length > 0
                  ? h(
                      'div',
                      { className: 'ws-cloud-stat-stats' },
                      data.stats.map((row, i) =>
                        h(
                          'div',
                          { key: i, className: 'ws-cloud-stat-pill' },
                          h('span', { className: 'ws-cloud-stat-pill-num' }, String(row.counts ?? '')),
                          h('span', {}, String(row.stat ?? '')),
                        ),
                      ),
                    )
                  : null,
                trend.length > 0
                  ? h(
                      'div',
                      {},
                      h('div', { className: 'ws-label' }, t('stats.trend')),
                      h(
                        'div',
                        { className: 'ws-bars' },
                        trend.map((point, i) =>
                          h(
                            'div',
                            { key: i, className: 'ws-bar-col' },
                            h(
                              'div',
                              { className: 'ws-bar-track' },
                              h('div', {
                                className: 'ws-bar-fill',
                                style: { height: `${Math.round(((point.seconds ?? 0) / trendPeak) * 100)}%` },
                                title: `${new Date(point.ts * 1000).toLocaleDateString()} · ${fmtDuration(point.seconds ?? 0)}`,
                              }),
                            ),
                          ),
                        ),
                      ),
                    )
                  : null,
                (data?.preferCategories ?? []).length > 0 || (data?.preferAuthors ?? []).length > 0
                  ? h(
                      'div',
                      { className: 'ws-cloud-prefers' },
                      (data.preferCategories ?? []).length > 0
                        ? h(
                            'div',
                            {},
                            h('div', { className: 'ws-label' }, t('stats.preferCategory')),
                            h(
                              'div',
                              { className: 'ws-rank' },
                              data.preferCategories.slice(0, 6).map((row, i) =>
                                h(
                                  'div',
                                  { key: i, className: 'ws-rank-row' },
                                  h('span', { className: 'ws-rank-name' }, String(row.title ?? '')),
                                  h('span', { className: 'ws-rank-time' }, fmtDuration(row.readingTime ?? 0)),
                                ),
                              ),
                            ),
                          )
                        : null,
                      (data.preferAuthors ?? []).length > 0
                        ? h(
                            'div',
                            {},
                            h('div', { className: 'ws-label' }, t('stats.preferAuthor')),
                            h(
                              'div',
                              { className: 'ws-rank' },
                              data.preferAuthors.slice(0, 6).map((row, i) =>
                                h(
                                  'div',
                                  { key: i, className: 'ws-rank-row' },
                                  h('span', { className: 'ws-rank-name' }, String(row.name ?? '')),
                                  h('span', { className: 'ws-rank-time' }, `${row.count ?? 0} ${t('stats.booksUnit')}`),
                                ),
                              ),
                            ),
                          )
                        : null,
                    )
                  : null,
                (data?.preferBooks ?? []).length > 0
                  ? h(
                      'div',
                      {},
                      h('div', { className: 'ws-label' }, t('stats.preferBooks')),
                      h(
                        'div',
                        { className: 'ws-cloud-books' },
                        data.preferBooks.slice(0, 12).map((book, i) =>
                          h(
                            'div',
                            { key: i, className: 'ws-cloud-book-chip', title: String(book.reason ?? '') },
                            h(Cover, { book: { cover: book.cover, title: book.bookTitle || book.title } }),
                            h('div', { className: 'ws-cloud-book-chip-title' }, String(book.bookTitle || book.title || '')),
                            h('div', { className: 'ws-cloud-book-chip-tag' },
                              book.type === 13 ? t('stats.favLabel') : book.type === 1 ? t('stats.recentLabel') : book.type === 0 ? t('stats.oftenLabel') : '',
                            ),
                          ),
                        ),
                      ),
                    )
                  : null,
                h(
                  'div',
                  {},
                  h('div', { className: 'ws-label' }, `${t('stats.medals')}${medalCount > 0 ? ` (${medalCount})` : ''}`),
                  medalCount === 0
                    ? h('div', { className: 'ws-hint' }, t('stats.noMedals'))
                    : h(
                        'div',
                        { className: 'ws-cloud-medals' },
                        (data.medals ?? []).map((medal, i) =>
                          h(
                            'div',
                            { key: i, className: 'ws-cloud-medal', title: String(medal.desc ?? '') },
                            h('div', { className: 'ws-cloud-medal-name' }, String(medal.name ?? '')),
                            medal.rankText !== '' ? h('div', { className: 'ws-cloud-medal-rank' }, String(medal.rankText)) : null,
                          ),
                        ),
                      ),
                ),
              ),
      )
    }

    function StatsPage(props) {
      const { t, stats, shelf, settings, onSettings } = props
      const goal = Math.max(1, Number(settings.dailyGoalSeconds) || 1800)
      const percent = clamp(Math.round(((stats?.today ?? 0) / goal) * 100), 0, 100)
      const days = stats?.days ?? []
      const peak = Math.max(...days.map((day) => day.seconds ?? 0), 1)
      const byBook = stats?.byBook ?? []
      const titleOf = useMemo(() => {
        const map = new Map(shelf.map((book) => [book.id, book.title]))
        return (id) => map.get(id) ?? '（已移除）'
      }, [shelf])
      const top = Math.max(...byBook.map((row) => row.seconds ?? 0), 1)

      return h(
        'div',
        { className: 'ws-stats ws-scroll' },
        h(
          'div',
          { className: 'ws-page-head' },
          h('div', { className: 'ws-page-title' }, t('stats.title')),
          h('div', { className: 'ws-page-sub' }, t('stats.pageSub')),
        ),
        h(
          'div',
          { className: 'ws-tiles' },
          h(
            'div',
            { className: 'ws-tile' },
            h('div', { className: 'ws-tile-value' }, fmtDuration(stats?.today ?? 0)),
            h('div', { className: 'ws-tile-label' }, t('stats.today')),
          ),
          h(
            'div',
            { className: 'ws-tile' },
            h('div', { className: 'ws-tile-value' }, fmtDuration(stats?.week ?? 0)),
            h('div', { className: 'ws-tile-label' }, t('stats.week')),
          ),
          h(
            'div',
            { className: 'ws-tile' },
            h('div', { className: 'ws-tile-value' }, fmtDuration(stats?.seconds ?? 0)),
            h('div', { className: 'ws-tile-label' }, t('stats.total')),
          ),
          h(
            'div',
            { className: 'ws-tile' },
            h('div', { className: 'ws-tile-value' }, String(stats?.streak ?? 0)),
            h('div', { className: 'ws-tile-label' }, `${t('stats.streak')} · ${t('stats.days')}`),
          ),
        ),
        h(
          'div',
          { className: 'ws-tile' },
          h(
            'div',
            { className: 'ws-goal' },
            h(
              'div',
              { style: { flex: 1 } },
              h('div', { className: 'ws-tile-label' }, t('stats.goal')),
              h(
                'div',
                { className: 'ws-goal-text' },
                percent >= 100 ? t('stats.goalDone') : `${Math.round((goal / 60))} ${t('settings.goalUnit')}`,
              ),
            ),
            h('div', { className: 'ws-goal-pct' }, `${percent}%`),
            h(
              'div',
              { className: 'ws-slider', style: { width: 160 } },
              h('input', {
                type: 'range',
                min: 5,
                max: 240,
                step: 5,
                value: Math.round(goal / 60),
                onChange: (event) => onSettings({ ...settings, dailyGoalSeconds: Number(event.target.value) * 60 }),
              }),
            ),
          ),
          h('div', { className: 'ws-bar', style: { marginTop: 10 } }, h('i', { style: { width: `${percent}%` } })),
        ),
        h(
          'div',
          {},
          h('div', { className: 'ws-label' }, t('stats.week')),
          h(
            'div',
            { className: 'ws-bars' },
            days.map((day) =>
              h(
                'div',
                { key: day.date, className: 'ws-bar-col' },
                h(
                  'div',
                  { className: 'ws-bar-track' },
                  h('div', {
                    className: 'ws-bar-fill',
                    'data-today': day.date === days[days.length - 1]?.date,
                    style: { height: `${Math.round(((day.seconds ?? 0) / peak) * 100)}%` },
                    title: fmtDuration(day.seconds ?? 0),
                  }),
                ),
                h('div', { className: 'ws-bar-label' }, dayKeyOf(new Date(`${day.date}T00:00:00`).getTime())),
              ),
            ),
          ),
        ),
        h(
          'div',
          {},
          h('div', { className: 'ws-label' }, t('stats.byBook')),
          byBook.length === 0
            ? h('div', { className: 'ws-hint' }, t('stats.noBookData'))
            : h(
                'div',
                { className: 'ws-rank' },
                byBook.slice(0, 12).map((row) =>
                  h(
                    'div',
                    { key: row.id, className: 'ws-rank-row' },
                    h('span', { className: 'ws-rank-name' }, titleOf(row.id)),
                    h('div', { className: 'ws-rank-bar' }, h('i', { style: { width: `${Math.round((row.seconds / top) * 100)}%` } })),
                    h('span', { className: 'ws-rank-time' }, fmtDuration(row.seconds)),
                  ),
                ),
              ),
        ),
        h(CloudStatsSection, { t }),
      )
    }

    /* ── 设置页 ───────────────────────────────────────────────── */

    function SettingsPage(props) {
      const { t, settings, provider, storage, onSettings, onConnect, onSync, onLogout } = props
      const [status, setStatus] = useState(null)
      const [cookie, setCookie] = useState('')
      const [apiKey, setApiKey] = useState('')
      const [qr, setQr] = useState(null)
      const [busy, setBusy] = useState('')
      const [message, setMessage] = useState('')
      const [error, setError] = useState('')
      const pollRef = useRef(null)

      useEffect(() => {
        get('/weread/status')
          .then((data) => setStatus(data))
          .catch(() => setStatus({ connected: false, sessionValid: true, error: '' }))
      }, [])

      useEffect(() => () => clearInterval(pollRef.current), [])

      const startQr = async () => {
        clearInterval(pollRef.current)
        setError('')
        setBusy('qr')
        try {
          const data = await post('/weread/qr-start', {})
          setQr({ uid: data.uid, svg: data.svg, status: 'waiting' })
          pollRef.current = setInterval(async () => {
            try {
              const state = await get(`/weread/qr-status?uid=${encodeURIComponent(data.uid)}`)
              setQr((current) => (current === null ? current : { ...current, status: state.status, error: state.error }))
              if (state.status === 'done') {
                clearInterval(pollRef.current)
                setBusy('')
                setStatus({ connected: true, account: state.account, sessionValid: true, error: '' })
                setMessage(t('settings.qrDone'))
                await onSync()
              } else if (state.status === 'error' || state.status === 'expired') {
                clearInterval(pollRef.current)
                setBusy('')
                setError(state.error || t('settings.qrError'))
              }
            } catch {
              clearInterval(pollRef.current)
              setBusy('')
            }
          }, 1600)
        } catch (failure) {
          setBusy('')
          setError(failure.message ?? String(failure))
        }
      }

      const saveCookie = async () => {
        if (cookie.trim() === '') return
        setBusy('cookie')
        setError('')
        setMessage('')
        try {
          const data = await post('/weread/login', { cookie: cookie.trim() })
          setCookie('')
          setStatus({ connected: true, account: data.account, sessionValid: true, error: '' })
          setMessage(t('settings.synced').replace('{a}', String(data.synced?.added ?? 0)).replace('{u}', String(data.synced?.updated ?? 0)))
        } catch (failure) {
          setError(failure.message ?? String(failure))
        } finally {
          setBusy('')
        }
      }

      const saveApiKey = async () => {
        setBusy('apikey')
        setError('')
        setMessage('')
        try {
          const data = await post('/weread/apikey', { apiKey: apiKey.trim() })
          setApiKey('')
          setStatus((current) => ({ ...(current ?? {}), apiKeyConfigured: data.configured, apiKeyMasked: data.masked }))
          setMessage(t('settings.apiKeySaved'))
        } catch (failure) {
          setError(failure.message ?? String(failure))
        } finally {
          setBusy('')
        }
      }

      const sync = async () => {
        setBusy('sync')
        setError('')
        setMessage('')
        try {
          const data = await post('/weread/sync', {})
          setMessage(t('settings.synced').replace('{a}', String(data.added ?? 0)).replace('{u}', String(data.updated ?? 0)))
          await onSync()
        } catch (failure) {
          setError(failure.message ?? String(failure))
        } finally {
          setBusy('')
        }
      }

      const connected = status?.connected === true
      const valid = status?.sessionValid !== false

      return h(
        'div',
        { className: 'ws-settings ws-scroll' },
        h(
          'div',
          { className: 'ws-section' },
          h('div', { className: 'ws-section-title' }, t('settings.weread')),
          h('div', { className: 'ws-section-desc' }, t('settings.wereadDesc')),
          /* 两条通道各管一块能力，用户不该去猜哪条断了、代价是什么。 */
          h(
            'div',
            { className: 'ws-cred' },
            h(
              'div',
              { className: 'ws-cred-item', 'data-ok': connected && valid ? 'true' : undefined },
              h('span', { className: 'ws-cred-dot' }),
              h(
                'div',
                { className: 'ws-cred-body' },
                h('div', { className: 'ws-cred-title' }, t('settings.credCookie')),
                h(
                  'div',
                  { className: 'ws-cred-desc' },
                  !connected
                    ? t('settings.credCookieOff')
                    : valid
                      ? t('settings.credCookieOk')
                      : t('settings.credCookieExpired'),
                ),
              ),
            ),
            h(
              'div',
              { className: 'ws-cred-item', 'data-ok': status?.apiKeyConfigured === true ? 'true' : undefined },
              h('span', { className: 'ws-cred-dot' }),
              h(
                'div',
                { className: 'ws-cred-body' },
                h('div', { className: 'ws-cred-title' }, t('settings.credKey')),
                h(
                  'div',
                  { className: 'ws-cred-desc' },
                  status?.apiKeyConfigured === true ? t('settings.credKeyOk') : t('settings.credKeyOff'),
                ),
              ),
            ),
          ),
          h(
            'div',
            { className: 'ws-row', style: { flexWrap: 'wrap' } },
            h(
              'span',
              { className: connected && valid ? 'ws-ok' : 'ws-hint' },
              connected ? (valid ? t('settings.connected') : t('settings.expired')) : t('settings.notConnected'),
            ),
            status?.account ? h('span', { className: 'ws-hint' }, status.account) : null,
            h('span', { className: 'ws-spacer' }),
            connected
              ? h('button', { className: 'ws-btn', disabled: busy !== '', onClick: sync }, busy === 'sync' ? t('settings.syncing') : t('settings.sync'))
              : null,
            connected
              ? h(
                  'button',
                  {
                    className: 'ws-btn',
                    'data-kind': 'danger',
                    onClick: async () => {
                      await onLogout()
                      setStatus({ connected: false, sessionValid: true, error: '' })
                    },
                  },
                  t('settings.logout'),
                )
              : null,
          ),
          message !== '' ? h('div', { className: 'ws-ok' }, message) : null,
          error !== '' ? h('div', { className: 'ws-error' }, error) : null,
          connected && valid
            ? null
            : h(
                'div',
                { className: 'ws-row', style: { alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' } },
                h(
                  'div',
                  { style: { display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' } },
                  qr !== null && qr.svg
                    ? h('div', { className: 'ws-qr', dangerouslySetInnerHTML: { __html: String(qr.svg) } })
                    : h('div', { className: 'ws-qr' }, h(IcoRefresh, { width: 22, height: 22 })),
                  h(
                    'button',
                    { className: 'ws-btn', disabled: busy === 'qr', onClick: startQr },
                    qr === null ? t('settings.qr') : t('settings.qrRefresh'),
                  ),
                  qr !== null
                    ? h(
                        'div',
                        { className: 'ws-hint' },
                        qr.status === 'waiting'
                          ? t('settings.qrWaiting')
                          : qr.status === 'authed'
                            ? t('settings.qrScanning')
                            : qr.status === 'syncing'
                              ? t('settings.qrSyncing')
                              : qr.status === 'done'
                                ? t('settings.qrDone')
                                : t('settings.qrError'),
                      )
                    : null,
                ),
                h(
                  'div',
                  { style: { flex: 1, minWidth: 240, display: 'flex', flexDirection: 'column', gap: 7 } },
                  h('div', { className: 'ws-label' }, t('settings.cookie')),
                  h('textarea', {
                    className: 'ws-area',
                    placeholder: t('settings.cookiePlaceholder'),
                    value: cookie,
                    onChange: (event) => setCookie(event.target.value),
                  }),
                  h(
                    'button',
                    {
                      className: 'ws-btn',
                      'data-kind': 'primary',
                      style: { alignSelf: 'flex-start' },
                      disabled: busy !== '' || cookie.trim() === '',
                      onClick: saveCookie,
                    },
                    busy === 'cookie' ? t('common.loading') : t('settings.cookieSave'),
                  ),
                ),
              ),
        ),
        h('div', { className: 'ws-divider' }),
        h(
          'div',
          { className: 'ws-section' },
          h('div', { className: 'ws-section-title' }, t('settings.apiKey')),
          h('div', { className: 'ws-section-desc' }, t('settings.apiKeyDesc')),
          h(
            'div',
            { className: 'ws-row', style: { flexWrap: 'wrap', alignItems: 'center' } },
            h(
              'span',
              { className: status?.apiKeyConfigured ? 'ws-ok' : 'ws-hint' },
              status?.apiKeyConfigured
                ? t('settings.apiKeyOn').replace('{k}', String(status.apiKeyMasked ?? ''))
                : t('settings.apiKeyOff'),
            ),
            h('span', { className: 'ws-spacer' }),
            h(
              'a',
              {
                className: 'ws-link',
                href: status?.apiKeyUrl ?? 'https://weread.qq.com/r/weread-skills',
                target: '_blank',
                rel: 'noreferrer',
              },
              t('settings.apiKeyLink'),
            ),
          ),
          h(
            'div',
            { className: 'ws-row', style: { flexWrap: 'wrap', gap: 8, marginTop: 8 } },
            h('input', {
              className: 'ws-input',
              style: { flex: 1, minWidth: 220 },
              placeholder: t('settings.apiKeyPlaceholder'),
              value: apiKey,
              onChange: (event) => setApiKey(event.target.value),
            }),
            h(
              'button',
              {
                className: 'ws-btn',
                'data-kind': 'primary',
                disabled: busy !== '' || apiKey.trim() === '',
                onClick: saveApiKey,
              },
              busy === 'apikey' ? t('common.loading') : t('settings.apiKeySave'),
            ),
            status?.apiKeyConfigured
              ? h(
                  'button',
                  {
                    className: 'ws-btn',
                    'data-kind': 'danger',
                    disabled: busy !== '',
                    onClick: async () => {
                      setApiKey('')
                      await saveApiKey()
                      setMessage(t('settings.apiKeyCleared'))
                    },
                  },
                  t('settings.apiKeyClear'),
                )
              : null,
          ),
        ),
        h('div', { className: 'ws-divider' }),
        h(
          'div',
          { className: 'ws-section' },
          h('div', { className: 'ws-section-title' }, t('settings.reading')),
          h(
            'div',
            { className: 'ws-field' },
            h('div', { className: 'ws-label' }, `${t('settings.goal')} · ${Math.round(Number(settings.dailyGoalSeconds) / 60)} ${t('settings.goalUnit')}`),
            h('div', { className: 'ws-slider' }, h('input', {
              type: 'range', min: 5, max: 240, step: 5,
              value: Math.round(Number(settings.dailyGoalSeconds) / 60),
              onChange: (event) => onSettings({ ...settings, dailyGoalSeconds: Number(event.target.value) * 60 }),
            })),
          ),
          h(
            'div',
            { className: 'ws-field' },
            h('div', { className: 'ws-label' }, t('settings.askMode')),
            h(
              'div',
              { className: 'ws-seg', style: { maxWidth: 260 } },
              ['explain', 'expand'].map((key) =>
                h(
                  'button',
                  { key, 'data-active': settings.askMode === key, onClick: () => onSettings({ ...settings, askMode: key }) },
                  t(`ai.${key}`),
                ),
              ),
            ),
          ),
        ),
        h('div', { className: 'ws-divider' }),
        h(
          'div',
          { className: 'ws-section' },
          h('div', { className: 'ws-section-title' }, t('settings.data')),
          h(
            'div',
            { className: 'ws-row', style: { flexWrap: 'wrap' } },
            h(
              'button',
              {
                className: 'ws-btn',
                onClick: async () => {
                  try {
                    const data = await get('/export/shelf')
                    await download('书蠹-书架.md', data.markdown ?? '')
                  } catch {
                    undefined
                  }
                },
              },
              t('settings.exportShelf'),
            ),
            h(
              'button',
              {
                className: 'ws-btn',
                onClick: async () => {
                  try {
                    const data = await get('/export/notes')
                    await download('书蠹-笔记.md', data.markdown ?? '')
                  } catch {
                    undefined
                  }
                },
              },
              t('settings.exportNotes'),
            ),
          ),
          h('div', { className: 'ws-field', style: { marginTop: 6 } },
            h('div', { className: 'ws-label' }, t('settings.storage')),
            h('code', { className: 'ws-hint', style: { wordBreak: 'break-all' } }, String(storage ?? '')),
          ),
        ),
      )
    }

    /* ── 独立对话页 ───────────────────────────────────────────── */

    /**
     * 退出阅读页之后，对话还得能接着问。
     *
     * 阅读页里的那一栏跟本章、本书绑死；这一页是「离开书之后」的入口：
     * 从书架挑一本，把之前在那本书里问过的串起来继续问。
     */
    function AskPage(props) {
      const { t, shelf, initialBookId, onOpenBook } = props
      const [bookId, setBookId] = useState(String(initialBookId ?? ''))
      const [scope, setScope] = useState('book')
      const [chat, setChat] = useState({ sessionId: '', turns: 0, messages: [], history: [], status: 'idle', error: '', pendingQuote: '' })
      const chatRef = useRef(chat)
      chatRef.current = chat
      const abortRef = useRef(null)

      useEffect(() => {
        if (String(initialBookId ?? '') !== '') setBookId(String(initialBookId))
      }, [initialBookId])

      const current = shelf.find((book) => String(book.id) === String(bookId)) ?? null

      const send = useCallback(
        (question) => {
          const text = String(question ?? '').trim()
          const quote = String(chatRef.current.pendingQuote ?? '')
          if (text === '' && quote === '') return
          const controller = new AbortController()
          abortRef.current = controller
          setChat((state) => ({
            ...state,
            status: 'streaming',
            error: '',
            messages: [
              ...state.messages,
              { id: `u${Date.now()}`, role: 'user', text, quote },
              { id: `a${Date.now()}`, role: 'assistant', text: '' },
            ],
          }))
          let answer = ''
          void askStream(
            {
              bookId: current === null ? '' : current.id,
              bookTitle: current?.title ?? '',
              quote,
              text,
              mode: 'ask',
              scope,
              sessionId: chatRef.current.sessionId === '' ? undefined : chatRef.current.sessionId,
              withToc: true,
            },
            {
              signal: controller.signal,
              onReasoning: (piece) => {
                setChat((state) => {
                  const messages = [...state.messages]
                  const last = messages[messages.length - 1]
                  if (last?.role === 'assistant') messages[messages.length - 1] = { ...last, reasoning: (last.reasoning ?? '') + piece }
                  return { ...state, messages }
                })
              },
              onDelta: (delta) => {
                answer += delta
                setChat((state) => {
                  const messages = [...state.messages]
                  const last = messages[messages.length - 1]
                  if (last?.role === 'assistant') messages[messages.length - 1] = { ...last, text: (last.text ?? '') + delta }
                  return { ...state, messages }
                })
              },
            },
          )
            .then((done) => {
              setChat((state) => ({ ...state, status: 'done', sessionId: done?.sessionId ?? state.sessionId, turns: done?.turns ?? state.turns + 1 }))
              if (answer.trim() === '' || current === null) return
              /* 同样落成笔记：离开书之后问出来的东西，回到笔记页要能看见。 */
              const history = [...chatRef.current.history, { q: text !== '' ? text : quote, a: answer }]
              setChat((state) => ({ ...state, history }))
              const body = history.map((turn) => `问：${turn.q}\n\n答：${turn.a}`).join('\n\n———\n\n')
              const noteId = String(chatRef.current.noteId ?? '')
              const request =
                noteId === ''
                  ? post('/notes', { bookId: current.id, bookTitle: current.title ?? '', chapterIndex: 0, chapterTitle: '', quote: (quote !== '' ? quote : text).slice(0, 4000), note: body, mode: 'ask' })
                  : patch('/notes', { id: noteId, patch: { note: body } })
              return request.then((saved) => {
                const id = String(saved?.note?.id ?? '')
                if (id !== '') setChat((state) => ({ ...state, noteId: id }))
              })
            })
            .catch((failure) => {
              if (String(failure?.name) === 'AbortError') {
                setChat((state) => ({ ...state, status: 'done' }))
                return
              }
              setChat((state) => ({ ...state, status: 'error', error: failure?.message ?? String(failure) }))
            })
            .finally(() => {
              abortRef.current = null
            })
        },
        [current, scope],
      )

      return h(
        'div',
        { className: 'ws-ask-page' },
        h(
          'div',
          { className: 'ws-ask-head' },
          h('div', { className: 'ws-page-head' },
            h('div', { className: 'ws-page-title' }, t('ask.title')),
            h('div', { className: 'ws-page-sub' }, t('ask.sub')),
          ),
          h(
            'div',
            { className: 'ws-ask-pick' },
            h('select', {
              className: 'ws-select',
              value: bookId,
              onChange: (event) => {
                setBookId(event.target.value)
                /* 换书就等于换话题：旧 sessionId 里是上一本书的上下文。 */
                setChat({ sessionId: '', turns: 0, messages: [], history: [], status: 'idle', error: '', pendingQuote: '' })
              },
            },
              h('option', { value: '' }, t('ask.noBook')),
              shelf.map((book) => h('option', { key: book.id, value: book.id }, String(book.title ?? ''))),
            ),
            current !== null
              ? h('button', { className: 'ws-btn', 'data-kind': 'ghost', onClick: () => onOpenBook?.(current) }, t('ask.openBook'))
              : null,
          ),
        ),
        h(
          'div',
          { className: 'ws-ask-body' },
          h(AiPanel, {
            t,
            state: chat,
            scope,
            onScope: (value) => {
              setScope(value)
              setChat((state) => ({ ...state, sessionId: '', turns: 0 }))
            },
            onClose: undefined,
            onAsk: (question) => {
              send(question)
              if (String(chatRef.current.pendingQuote ?? '') !== '') setChat((state) => ({ ...state, pendingQuote: '' }))
            },
            quote: String(chat.pendingQuote ?? ''),
            onClearQuote: () => setChat((state) => ({ ...state, pendingQuote: '' })),
            onStop: () => {
              abortRef.current?.abort()
              abortRef.current = null
              setChat((state) => ({ ...state, status: 'done' }))
            },
            onReset: async () => {
              try {
                await post('/ask/reset', { sessionId: chat.sessionId })
              } catch {
                undefined
              }
              setChat({ sessionId: '', turns: 0, messages: [], history: [], status: 'idle', error: '', pendingQuote: '' })
            },
          }),
        ),
      )
    }

    /* ── 错误边界 ─────────────────────────────────────────────── */

    class Boundary extends React.Component {
      constructor(props) {
        super(props)
        this.state = { error: '' }
      }

      static getDerivedStateFromError(error) {
        return { error: String(error?.stack ?? error) }
      }

      render() {
        if (this.state.error !== '') {
          return h(
            'div',
            { className: 'ws-root' },
            h(
              'div',
              { className: 'ws-boundary' },
              h('div', { className: 'ws-empty-title' }, this.props.title ?? '出错了'),
              h('pre', {}, this.state.error.slice(0, 1600)),
            ),
          )
        }
        return this.props.children
      }
    }

    /* ── 样式注入 ─────────────────────────────────────────────── */

    /**
     * 把 CSS 挂进 document.head，返回 disposer。
     * 用 data 属性认领自己那一片，热重载时先清掉旧的再写新的，避免叠加。
     */
    function injectStyles() {
      const ID = 'bookworm-styles'
      const previous = document.querySelectorAll(`style[data-bookworm="${ID}"]`)
      for (const node of previous) node.remove()

      const style = document.createElement('style')
      style.setAttribute('data-bookworm', ID)
      style.textContent = CSS
      document.head.appendChild(style)

      return () => {
        style.remove()
      }
    }

    /* ── 主页面 ───────────────────────────────────────────────── */

    function makePage(t) {
      return function Page() {
        const [tab, setTab] = useState('shelf')
        const [state, setState] = useState(null)
        const [loading, setLoading] = useState(true)
        const [error, setError] = useState('')
        const [reading, setReading] = useState(null)
        /* 从阅读页「带着书」跳到对话页时，这里记住是哪本书，
           免得用户还得在下拉里再挑一次。 */
        const [askBookId, setAskBookId] = useState('')
        const [settings, setSettings] = useState(DEFAULT_SETTINGS)
        const saveTimer = useRef(0)

        const reload = useCallback(async () => {
          try {
            const data = await get('/state')
            setState(data)
            setSettings(normalizeSettings(data.settings))
            setError('')
          } catch (failure) {
            setError(failure.message ?? String(failure))
          } finally {
            setLoading(false)
          }
        }, [])

        useEffect(() => {
          void reload()
        }, [reload])

        /** 设置改了就存，但别每拖一格都写盘。 */
        const applySettings = useCallback(
          (next) => {
            const normalized = normalizeSettings(next)
            setSettings(normalized)
            clearTimeout(saveTimer.current)
            saveTimer.current = setTimeout(() => {
              void post('/settings', normalized).catch(() => undefined)
            }, SAVE_SETTINGS_DELAY)
          },
          [],
        )

        const open = useCallback(async (book, target) => {
          setReading({ bookId: book.id, chapterIndex: target?.chapterIndex, chapterUid: target?.chapterUid, quote: target?.quote })
          // 打开即算一次「打开」，也让书架排序有意义。
          try {
            await post('/progress', { bookId: book.id, chapterIndex: target?.chapterIndex ?? book?.progress?.chapterIndex ?? 0, percent: book?.progress?.percent ?? 0, seconds: 0 })
          } catch {
            undefined
          }
        }, [])

        const exitReader = useCallback(async () => {
          setReading(null)
          await reload()
        }, [reload])

        const rootProps = {
          className: 'ws-root',
          'data-theme': settings.theme,
        }

        if (reading !== null) {
          return h(
            'div',
            rootProps,
            h(Reader, {
              t,
              settings,
              bookId: reading.bookId,
              initialChapter: reading.chapterIndex,
              initialChapterUid: reading.chapterUid,
              initialQuote: reading.quote,
              onSettings: applySettings,
              onExit: exitReader,
              onNotesChanged: () => undefined,
              /* 阅读页的对话栏是一「栏」，但书之外还想接着聊：
                 点「展开」带着这本书跳到对话页，那边的对话是独立的、能一直挂着。 */
              onAskPage: (id) => {
                setAskBookId(String(id ?? ''))
                setTab('ask')
                void exitReader()
              },
            }),
          )
        }

        const shelf = state?.shelf ?? []

        return h(
          'div',
          rootProps,
          h(
            'div',
            { className: 'ws-top' },
            h(
              'div',
              { className: 'ws-brand' },
              h('div', { className: 'ws-brand-name' }, t('app.title')),
              h('div', { className: 'ws-brand-sub' }, t('app.subtitle')),
            ),
            h(
              'div',
              { className: 'ws-tabs' },
              ['shelf', 'notes', 'ask', 'stats', 'settings'].map((key) =>
                h(
                  'button',
                  { key, className: 'ws-tab', 'data-active': tab === key, onClick: () => setTab(key) },
                  key === 'ask' ? t('ask.tab') : t(`nav.${key}`),
                ),
              ),
            ),
            h(
              'button',
              {
                className: 'ws-btn',
                'data-kind': 'ghost',
                title: t('common.retry'),
                onClick: () => void reload(),
              },
              h(IcoRefresh),
            ),
          ),
          error !== ''
            ? h(
                'div',
                { className: 'ws-empty' },
                h('div', { className: 'ws-empty-title' }, t('common.error')),
                h('div', { className: 'ws-empty-body' }, error),
                h('button', { className: 'ws-btn', onClick: () => void reload() }, t('common.retry')),
              )
            : tab === 'shelf'
              ? h(ShelfPage, {
                  t,
                  shelf,
                  stats: state?.stats ?? null,
                  loading,
                  onOpen: open,
                  onConnect: () => setTab('settings'),
                })
              : tab === 'notes'
                ? h(NotesPage, {
                    t,
                    /* 本地笔记有 chapterIndex，云端笔记只有 chapterUid；两种都透传，由阅读器自行换算。 */
                    onJump: (note) =>
                      void open({ id: note.bookId }, { chapterIndex: note.chapterIndex, chapterUid: note.chapterUid, quote: note.quote }),
                  })
                : tab === 'ask'
                  ? h(AskPage, {
                      t,
                      shelf,
                      initialBookId: askBookId,
                      onOpenBook: (book) => void open({ id: book.id }),
                    })
                  : tab === 'stats'
                  ? h(StatsPage, { t, stats: state?.stats ?? null, shelf, settings, onSettings: applySettings })
                  : h(SettingsPage, {
                      t,
                      settings,
                      provider: state?.provider ?? null,
                      storage: state?.storage ?? '',
                      onSettings: applySettings,
                      onConnect: () => undefined,
                      onSync: reload,
                      onLogout: async () => {
                        await post('/weread/logout', {})
                        await reload()
                      },
                    }),
        )
      }
    }

    /* ── 侧栏图标 ─────────────────────────────────────────────── */

    function PanelIcon() {
      return h(
        'svg',
        { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' },
        h('path', { d: 'M4 4.5A1.5 1.5 0 0 1 5.5 3H19v18H5.5A1.5 1.5 0 0 1 4 19.5z' }),
        h('path', { d: 'M8 3v18' }),
        h('path', { d: 'M12.5 8.5h3' }),
        h('path', { d: 'M12.5 12h3' }),
      )
    }

    /* ── 入口 ─────────────────────────────────────────────────── */

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, 'zh', ZH), 'bookworm: zh dictionary')
        ctx.effect(() => ctx.locale.register(NS, 'en', EN), 'bookworm: en dictionary')
        ctx.effect(() => injectStyles(), 'bookworm: styles')

        const t = ctx.locale.bind(NS)
        let Page = null
        let bootError = ''
        try {
          Page = makePage(t)
        } catch (error) {
          bootError = String(error?.stack ?? error)
        }

        function Guarded(props) {
          if (bootError !== '') {
            return h(
              'div',
              { className: 'ws-root' },
              h(
                'div',
                { className: 'ws-boundary' },
                h('h2', {}, t('boot.failed')),
                h('p', { className: 'ws-hint' }, t('boot.hint')),
                h('pre', {}, bootError.slice(0, 1400)),
              ),
            )
          }
          return h(Boundary, { title: t('common.error') }, h(Page, props))
        }

        ctx.slots.inject('sidebar.panellist', () =>
          ctx.slots.register(
            { name: 'sidebar.panellist', id: 'bookworm', order: 31, label: () => t('app.title'), locale: NS },
            PanelIcon,
          ),
        )
        ctx.slots.inject('main', () =>
          ctx.slots.register({ name: 'main', key: 'bookworm', locale: NS }, Guarded),
        )
      },
    }
  },
})
