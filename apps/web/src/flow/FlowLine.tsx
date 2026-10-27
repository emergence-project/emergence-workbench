import type { FlowNode } from '../api'
import { go } from '../router'
import { t } from '../i18n'
import { useFlow } from './data'
import { judgeTurns } from './JudgeQueue'
import { KIND, markOf, MarkSvg, roleOf } from './marks'

/** 첫 화면 흐름 한 줄의 수 (10/26 "프로젝트의 중심은 주제"): 끝나지 않은 질문 · 진행 중인 작업 · 판단할 것(기록 › 내 차례의 판단 대기열과 같은 수) */
export function flowLineCounts(nodes: FlowNode[]) {
  const { queued, ready } = judgeTurns(nodes)
  return {
    open: nodes.filter((n) => roleOf(markOf(n)) === 'open' && n.progress !== 'done').length,
    active: nodes.filter((n) => KIND[n.kind].act && n.progress === 'active').length,
    judge: queued.length + ready.length,
  }
}

const Mark = ({ m, state, turn }: { m: 'question' | 'calc' | 'finding'; state: string; turn?: boolean }) =>
  <svg className="fl-icon" width={16} height={16} viewBox="0 0 30 30" aria-hidden><MarkSvg m={m} x={15} y={15} state={state} turn={turn} /></svg>

/** 프로젝트 첫 화면에서 흐름 지도 대신 보이는 한 줄. 누르면 흐름 지도 */
export function FlowLine({ rid }: { rid: string }) {
  const scan = useFlow(rid).scan
  if (!scan?.nodes.length) return null
  const c = flowLineCounts(scan.nodes)
  return (
    <button className="flow-line" data-ui="첫 화면 흐름 한 줄" onClick={() => go({ page: 'flow', rid })}>
      <b>{t('흐름', 'Flow')}</b>
      <span className="fln-n"><Mark m="question" state="open" />{t(`열린 질문 ${c.open}`, `${c.open} open questions`)}</span>
      <span className="fln-n"><Mark m="calc" state="active" />{t(`진행 ${c.active}`, `${c.active} in progress`)}</span>
      {c.judge > 0 && <span className="fln-n turn"><Mark m="finding" state="active" turn />{t(`판단 대기 ${c.judge}`, `${c.judge} to judge`)}</span>}
      <span className="fln-more">{t('흐름 지도 ›', 'Flow map ›')}</span>
    </button>
  )
}
