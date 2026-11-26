// 레일의 지식 · 그림 버튼 수 (11/27): 알림 종의 「지식 라이브러리」 · 「그림 라이브러리」 답할 것과 같은 셈. 종에는 2가 있는데 레일에는 수가 없었다
import { useQuery } from '@tanstack/react-query'
import { LIBRARY_RID } from '@rw/core'
import { api } from './api'
import { t } from './i18n'
import { useBrokenFigureCount, useKnowledgeCheckCount } from './noticeCounts'
import { qk } from './queries'

export function LibraryRailCount() {
  const turns = useQuery({ queryKey: qk.recordTurns, queryFn: () => api.recordTurns() }).data?.turns
  const asked = turns?.filter((r) => r.rid === LIBRARY_RID).length ?? 0
  const check = useKnowledgeCheckCount()
  const n = asked + check
  if (!n) return null
  const why = [asked > 0 && t(`답을 기다리는 기록 ${asked}개`, `${asked} record(s) awaiting your answer`), check > 0 && t(`점검할 개념노트 ${check}개`, `${check} concept note(s) to check`)].filter(Boolean).join(' · ')
  return <span className="rail-count" title={why}>{n}</span>
}

export function FiguresRailCount() {
  const n = useBrokenFigureCount()
  return n ? <span className="rail-count" title={t(`그림으로 못 바꾼 tikz ${n}개`, `${n} tikz source(s) failed to render`)}>{n}</span> : null
}
