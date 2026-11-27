// 알림 종에 넣는, 수로만 아는 알림 (11/23 "그림 라이브러리랑 네트워크는?"): 화면마다 이미 세는 수를 그대로 가져온다.
// 답할 것: 지식 · 그림 라이브러리의 점검, GitHub와 다른 저장소, 소개의 확인 전인 절. 소식: 새로 추천된 사람, 답이 온 논문 질문.
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { LIBRARY_RID } from '@rw/core'
import { APP_RID, conceptsApi, figuresApi, papersApi } from './api'
import { aboutRailRoute, useAboutUncheckedCount } from './AboutPage'
import { askPart, useRuleAsks } from './ResearchTables'
import { t } from './i18n'
import type { Notice } from './NoticeBell'
import { markSuggestionsSeen, useNewSuggestions } from './network/Suggestions'
import { useAgentEdits } from './projectQueries'
import { useReposDiffCount } from './ReposPage'
import { go } from './router'

/** 프로젝트가 아닌 곳의 이름표 (프로젝트 id와 겹치지 않는다) */
export const PAPERS = '_papers'
export const FIGURES = '_figures'
export const NETWORK = '_network'

/** 첫 화면의 숫자와 같은 요청. 라이브러리 폴더가 없으면 실패하고 그 줄은 없다 */
const SLOW = { staleTime: 60_000, refetchInterval: 5 * 60_000, retry: false } as const

/** 지식 라이브러리의 점검: 점검 전 · 점검 뒤 바뀜 · 검토할 초안 개념노트와 에이전트의 고침 (레일 수와 종이 같은 값을 쓴다) */
export function useKnowledgeCheckCount() {
  const concepts = useQuery({ queryKey: ['notice-counts', 'concepts'], queryFn: () => conceptsApi.brief(1), ...SLOW }).data
  const edits = useAgentEdits('library').data
  return (concepts ? concepts.check.unchecked.count + concepts.check.changedAfterCheck.count + concepts.check.draftsToReview.count : 0) + (edits ? edits.reviews.length + edits.attempts.length : 0)
}

/** 그림으로 못 바꾼 tikz 수 */
export function useBrokenFigureCount() {
  return useQuery({ queryKey: ['notice-counts', 'figures'], queryFn: () => figuresApi.brief(1), ...SLOW }).data?.check.broken ?? 0
}

export function useNoticeCounts(): Omit<Notice, 'key'>[] {
  const papers = useQuery({ queryKey: ['notice-counts', 'papers'], queryFn: () => papersApi.brief(1), ...SLOW }).data
  const suggestedNames = useNewSuggestions()
  const suggested = suggestedNames.length
  const repos = useReposDiffCount()
  const about = useAboutUncheckedCount()
  const asks = useRuleAsks()
  const knowledge = useKnowledgeCheckCount()
  const broken = useBrokenFigureCount()
  const answered = papers?.check.answered ?? 0
  return useMemo(() => [
    { kind: 'check', need: true, place: LIBRARY_RID, n: knowledge, text: t(`점검할 개념노트 ${knowledge}개`, `${knowledge} concept note(s) to check`), open: () => go({ page: 'library' }) },
    { kind: 'check', need: true, place: FIGURES, n: broken, text: t(`그림으로 못 바꾼 tikz ${broken}개`, `${broken} tikz source(s) failed to render`), open: () => go({ page: 'figures' }) },
    { kind: 'repo', need: true, n: repos, text: t(`GitHub와 다른 프로젝트 ${repos}개`, `${repos} project(s) differ from GitHub`), open: () => go({ page: 'repos' }) },
    { kind: 'about', need: true, place: APP_RID, n: about, text: t(`확인 전인 소개 절 ${about}개`, `${about} About section(s) not reviewed`), open: () => go(aboutRailRoute()) },
    // 결정을 기다리는 규칙 · 실험 (소개 › 연구, 11/27): 답은 그 표에서 한다
    ...asks.map((r) => ({ kind: 'about' as const, need: true, place: APP_RID, text: t(`결정할 ${r.entry.kind === 'experiment' ? '실험' : '규칙'}: ${r.entry.rule}`, `${r.entry.kind === 'experiment' ? 'Experiment' : 'Rule'} to decide: ${r.entry.rule}`), open: () => go({ page: 'about', part: askPart(r) }) })),
    { kind: 'person', need: false, place: NETWORK, n: suggested, text: t(`새로 추천된 사람 ${suggested}명`, `${suggested} newly suggested people`), open: () => go({ page: 'network' }), read: () => markSuggestionsSeen(suggestedNames) },
    { kind: 'answer', need: false, place: PAPERS, n: answered, text: t(`답이 온 논문 질문 ${answered}개`, `${answered} paper question(s) answered`), open: () => go({ page: 'shelf' }) },
  ], [knowledge, broken, repos, about, asks, suggested, suggestedNames, answered])
}
