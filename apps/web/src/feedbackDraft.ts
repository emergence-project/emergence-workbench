/**
 * 적던 피드백 (10/21 피드백 17:59): 등록하지 않고 창을 닫거나 화면을 옮겨도 글이 남게, 이 브라우저에 하나만 둔다.
 * 피드백 모드 아래 띠에서 이어 쓰거나 버린다. 등록하면 지운다.
 */
export interface FeedbackDraft { text: string; kind: '수정' | '질문' | '제안' | null; path: string; snippet: string; route: string; at: string }

const KEY = 'rw-feedback-draft'

export function readFeedbackDraft(): FeedbackDraft | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<FeedbackDraft> | null
    if (!v || typeof v.text !== 'string' || !v.text.trim() || typeof v.path !== 'string') return null
    const kind = v.kind === '수정' || v.kind === '질문' || v.kind === '제안' ? v.kind : null
    return { text: v.text, kind, path: v.path, snippet: typeof v.snippet === 'string' ? v.snippet : '', route: typeof v.route === 'string' ? v.route : '#/', at: typeof v.at === 'string' ? v.at : '' }
  } catch { return null }
}

export function writeFeedbackDraft(d: FeedbackDraft): void {
  try { localStorage.setItem(KEY, JSON.stringify(d)) } catch { /* 저장소를 못 쓰면 지금처럼 창이 열린 동안만 */ }
}

export function clearFeedbackDraft(): void {
  try { localStorage.removeItem(KEY) } catch { /* 위와 같음 */ }
}
