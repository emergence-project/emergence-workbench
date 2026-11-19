import { createContext, useContext, useEffect, useRef, type MutableRefObject } from 'react'
import type { FeedbackItem } from './api'
import { feedbackBucket, type FeedbackBucket } from './feedbackBuckets'
import { t } from './i18n'

/**
 * 피드백 한 항목을 가리키는 주소 #/feedback/<키> (11/19 "그 링크를 앱 안에서 바로 볼 수 있어야"):
 * 그 항목이 보이게 거르기를 풀고, 펼쳐서(표의 줄 · 접힌 한 줄 · 처리한 것 묶음) 처리 기록 · 답까지 보이고, 그 자리로 내린다.
 */
export const FeedbackFocus = createContext<string | undefined>(undefined)

/** 이 항목이 주소가 가리키는 항목인가 */
export const useIsFocus = (e: Pick<FeedbackItem, 'key'>) => useContext(FeedbackFocus) === e.key

/** 거르기를 그 항목의 갈래로 바꾸고 그 자리로 내린다. 못 찾으면 true */
export function useFeedbackFocus(focus: string | undefined, entries: FeedbackItem[] | null, setFilter: (f: FeedbackBucket) => void, setKind: (k: '전체') => void, picked: MutableRefObject<boolean>): boolean {
  const item = focus && entries ? entries.find((e) => e.key === focus) : undefined
  useEffect(() => {
    if (!item) return
    picked.current = true
    setFilter(feedbackBucket(item)); setKind('전체')
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 주소가 바뀌거나 처음 읽었을 때만
  }, [focus, !!item])
  const scrolled = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (!focus || scrolled.current === focus) return
    const el = document.querySelector(`[data-fb-key="${CSS.escape(focus)}"]`)
    if (el) { scrolled.current = focus; el.scrollIntoView({ block: 'start' }) }
  })
  return !!focus && !!entries && !item
}

/** 표 보기: 주소가 가리키는 줄을 펼친다 */
export function useFocusOpen(list: FeedbackItem[], open: (k: string) => void, keyOf: (e: FeedbackItem) => string) {
  const focus = useContext(FeedbackFocus)
  const item = focus ? list.find((e) => e.key === focus) : undefined
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 그 항목이 목록에 들어올 때 한 번
  useEffect(() => { if (item) open(keyOf(item)) }, [focus, !!item])
}

export const FocusMissing = ({ focus }: { focus: string }) => <p className="muted" data-ui="못 찾은 피드백">{t('그 피드백을 찾지 못했습니다', 'Could not find that feedback')}: <span className="mono">{focus}</span></p>
