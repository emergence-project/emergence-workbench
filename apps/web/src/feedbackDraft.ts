/**
 * 적던 피드백 (10/21 피드백 17:59): 등록하지 않고 창을 닫거나 화면을 옮겨도 글이 남게 이 브라우저에 둔다.
 * 여러 개를 둔다 (10/21 16:29 "그렇게 하자": 적던 글이 많으면 아래 띠 "적던 글 n"의 목록에서 고른다). 새 것이 앞, 많아야 MAX개.
 * 피드백 모드 아래 띠에서 이어 쓰거나 버린다. 등록하면 지운다.
 */
export interface FeedbackDraft { id: string; text: string; kind: '수정' | '질문' | '제안' | null; path: string; snippet: string; route: string; at: string }

const KEY = 'rw-feedback-drafts'
/** 하나만 두던 때(#212)의 열쇠: 읽을 때 목록으로 옮긴다 */
const OLD_KEY = 'rw-feedback-draft'
export const MAX_DRAFTS = 20

function clean(v: Partial<FeedbackDraft> | null, fallbackId: string): FeedbackDraft | null {
  if (!v || typeof v.text !== 'string' || !v.text.trim() || typeof v.path !== 'string') return null
  const kind = v.kind === '수정' || v.kind === '질문' || v.kind === '제안' ? v.kind : null
  const at = typeof v.at === 'string' ? v.at : ''
  return { id: typeof v.id === 'string' && v.id ? v.id : fallbackId || at || 'old', text: v.text, kind, path: v.path, snippet: typeof v.snippet === 'string' ? v.snippet : '', route: typeof v.route === 'string' ? v.route : '#/', at }
}

export function readFeedbackDrafts(): FeedbackDraft[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown
    const out = (Array.isArray(list) ? list : []).map((v, i) => clean(v as Partial<FeedbackDraft>, `d${i}`)).filter((d): d is FeedbackDraft => !!d)
    const old = clean(JSON.parse(localStorage.getItem(OLD_KEY) ?? 'null') as Partial<FeedbackDraft> | null, '')
    if (old && !out.some((d) => d.id === old.id)) out.push(old)
    return out.sort((a, b) => b.at.localeCompare(a.at)).slice(0, MAX_DRAFTS)
  } catch { return [] }
}

function writeAll(list: FeedbackDraft[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX_DRAFTS)))
    localStorage.removeItem(OLD_KEY)
  } catch { /* 저장소를 못 쓰면 지금처럼 창이 열린 동안만 */ }
}

/** 같은 id가 있으면 바꾸고 없으면 맨 앞에 더한다. 바뀐 목록을 돌려준다 */
export function saveFeedbackDraft(d: FeedbackDraft): FeedbackDraft[] {
  const list = [d, ...readFeedbackDrafts().filter((x) => x.id !== d.id)]
  writeAll(list)
  return list.slice(0, MAX_DRAFTS)
}

export function removeFeedbackDraft(id: string): FeedbackDraft[] {
  const list = readFeedbackDrafts().filter((x) => x.id !== id)
  writeAll(list)
  return list
}

export const newDraftId = (): string => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
