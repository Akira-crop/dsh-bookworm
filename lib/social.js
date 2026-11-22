/**
 * 书友想法：把「这一章别人在哪儿划线、划了之后说了什么」拉下来。
 *
 * 官方网关给的是三段拼图，缺一不可：
 *   1. /book/underlines   哪些 range 被人划过、各有多少人，但**没有划线文本**
 *   2. /book/bestbookmarks 全书最热的约 20 条，带划线原文和人数，但**只有 20 条**
 *   3. /book/readreviews  给定 range 才给想法，一次最多问 20 个
 * 所以必须先把 range 收敛到「真的有人划过」的那些，再分批问——
 * 否则一章上百条 range 逐条问，光请求就得等十几秒。
 *
 * 为什么两个来源都要：实测 12 本书里有 5 本 underlines 返回空数组
 * （《站桩》《萤》《软件工程师进阶导航》等），但它们的 bestbookmarks
 * 有 19–20 条热门划线。只靠 underlines 会让近一半的书看起来「没人读」。
 *
 * 想法自带 abstract（被划的那句原文），拿它在本地正文里定位，不依赖 range 偏移。
 * 那个偏移是微信读书自己的坐标系，从本地缓存的正文复现不出来：实测同一章内
 * 多个划线的 offset 差值并不相等（877/799/721/643/565），说明它不是简单的
 * 「段落首尾拼接」关系。硬换算只会把想法挂到错误的句子上。
 */

/** readreviews 一次最多 20 个 range（实测：14 个 → 14 组 147 条想法，714ms）。 */
const READ_BATCH = 20

/** 网关对突发并发敏感，实测 3 路稳定；再高会开始偶发超时。 */
const CONCURRENCY = 3

/** 一章最多看多少条热门划线。再多人也翻不完，而且请求数线性增长。 */
const MAX_GROUPS = 40

/** 每组最多留多少条想法。热门划线下面能有上百条，界面里翻不动，也没必要全传。 */
const MAX_PER_GROUP = 12

function text(value) {
  return String(value ?? '').trim()
}

/**
 * 把 readreviews 的一层 wrapper 压平成 UI 直接能用的形状。
 * 注意 reviewId 可能在外层，也可能嵌在 review 里——两处都要看。
 */
function normalizeThought(wrapper, ownVid) {
  const review = wrapper?.review ?? wrapper ?? {}
  const id = text(wrapper?.reviewId ?? review?.reviewId)
  const content = text(review?.content)
  if (content === '') return null
  return {
    id,
    content,
    abstract: text(review?.abstract),
    author: text(review?.author?.name) || '书友',
    avatar: text(review?.author?.avatar),
    createTime: Number(review?.createTime ?? 0),
    // 自己的想法标出来，避免读者在人群里找自己。
    isMine: ownVid !== '' && String(review?.userVid ?? '') === ownVid,
  }
}

/**
 * 收集候选 range：章节热度优先，不足时用全书热门划线补齐。
 * 返回 [{ range, count, markText }]，按人数降序。
 */
async function candidateRanges({ underlines, bestBookmarks, bookId, chapterUid, maxGroups }) {
  const picked = new Map()

  try {
    const listed = await underlines({ bookId, chapterUid })
    for (const item of Array.isArray(listed?.underlines) ? listed.underlines : []) {
      const range = text(item?.range)
      const count = Number(item?.count ?? 0)
      if (range === '' || count <= 0) continue
      picked.set(range, { range, count, markText: '' })
    }
  } catch {
    // 章节热度拿不到不是致命问题，下面还有全书热门兜底。
  }

  // 全书热门划线：只保留落在当前章的（range 是章内偏移，跨章不可混用）。
  if (picked.size < maxGroups) {
    try {
      const best = await bestBookmarks({ bookId })
      for (const item of Array.isArray(best?.items) ? best.items : []) {
        if (Number(item?.chapterUid) !== Number(chapterUid)) continue
        const range = text(item?.range)
        const count = Number(item?.totalCount ?? 0)
        if (range === '' || count <= 0) continue
        if (picked.has(range)) {
          // 同一个 range 两处都有，补上人更全的那份划线原文。
          const known = picked.get(range)
          if (known.markText === '') known.markText = text(item?.markText)
          continue
        }
        picked.set(range, { range, count, markText: text(item?.markText) })
      }
    } catch {
      // 同上：兜底失败就只用章节热度。
    }
  }

  return [...picked.values()]
    .sort((left, right) => right.count - left.count)
    .slice(0, maxGroups)
}

/**
 * 拉一章的书友想法。
 *
 * @param options.underlines    ({bookId, chapterUid}) => Promise<{underlines}>
 * @param options.bestBookmarks ({bookId}) => Promise<{items}>
 * @param options.readReviews   ({bookId, chapterUid, reviews}) => Promise<{reviews}>
 * @param options.ownVid        自己的 userVid，用于标记「这条是我的」
 */
export async function collectChapterThoughts({
  underlines,
  bestBookmarks,
  readReviews,
  bookId,
  chapterUid,
  ownVid = '',
  maxGroups = MAX_GROUPS,
} = {}) {
  const candidates = await candidateRanges({ underlines, bestBookmarks, bookId, chapterUid, maxGroups })

  if (candidates.length === 0) {
    return {
      chapterUid: Number(chapterUid),
      available: false,
      hotRanges: 0,
      thoughtCount: 0,
      groups: [],
    }
  }

  const batches = []
  for (let index = 0; index < candidates.length; index += READ_BATCH) {
    batches.push(candidates.slice(index, index + READ_BATCH))
  }

  /** range → 候选信息（人数、划线原文） */
  const byRange = new Map()
  for (const item of candidates) byRange.set(item.range, item)

  const found = new Map()
  let cursor = 0
  const worker = async () => {
    for (;;) {
      const at = cursor
      cursor += 1
      if (at >= batches.length) return
      const batch = batches[at]
      let payload
      try {
        payload = await readReviews({
          bookId,
          chapterUid,
          reviews: batch.map((item) => ({ range: item.range })),
        })
      } catch {
        // 一批失败不该让整章空掉——其余批次往往还在正常返回。
        continue
      }
      for (const group of Array.isArray(payload?.reviews) ? payload.reviews : []) {
        const range = text(group?.range)
        if (range === '') continue
        const thoughts = (Array.isArray(group?.pageReviews) ? group.pageReviews : [])
          .map((wrapper) => normalizeThought(wrapper, ownVid))
          .filter((item) => item !== null)
        if (thoughts.length === 0) continue
        const known = byRange.get(range)
        found.set(range, {
          range,
          bookMarkCount: known?.count ?? Number(group?.bookMarkCount ?? 0),
          // underlines 只给 range 不给文本；想法自带的 abstract 就是那句被划的原文，
          // 拿它补上，界面才有「这句话大家都划了」的实感。
          markText: known?.markText !== '' && known?.markText !== undefined ? known.markText : thoughts[0].abstract,
          // totalCount 是这一句下面真实的总条数，thoughts 只是第一页。
          totalCount: Number(group?.totalCount ?? thoughts.length),
          // 这是「这一句有多少人划线」，不是想法数——两者在 UI 里分开说。
          hasMore: group?.hasMore === true,
          thoughts: thoughts.slice(0, MAX_PER_GROUP),
        })
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batches.length) }, worker))

  // 按「多少人划过」排序：人多的地方想法通常也更值得看，且和正文顺序无关时更稳。
  const groups = [...found.values()].sort((left, right) => right.bookMarkCount - left.bookMarkCount)
  const thoughtCount = groups.reduce((sum, group) => sum + group.thoughts.length, 0)

  return {
    chapterUid: Number(chapterUid),
    available: true,
    hotRanges: candidates.length,
    scannedGroups: candidates.length,
    thoughtCount,
    groups,
  }
}
