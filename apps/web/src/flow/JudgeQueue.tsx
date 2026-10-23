import { JUDGE_CAP } from '@rw/core'
import type { FlowNode } from '../api'
import { go } from '../router'
import { t as tr } from '../i18n'
import { flowBy } from './flowBy'
import { MarkIcon } from './marks'

/** 판단할 것: 대기열의 명제와 시작을 기다리는 카드 (내 차례 수에 든다) */
export const judgeTurns = (nodes: FlowNode[]) => ({
  queued: nodes.filter((n) => n.queued),
  ready: nodes.filter((n) => n.cardState === 'ready'),
})

/**
 * 판단 대기열 (10/23 "판단 설계" 5단계): 기록 › 내 차례 맨 위. 대기열이 상한(JUDGE_CAP)에 차면 에이전트가 새 명제를 내지 못한다.
 * 줄을 누르면 판단 화면
 */
export function JudgeQueue({ rid, nodes, threads }: { rid: string; nodes: FlowNode[]; threads?: Map<string, { all: number; answered: number }> }) {
  const { queued, ready } = judgeTurns(nodes)
  if (!queued.length && !ready.length) return null
  const full = queued.length >= JUDGE_CAP
  const row = (n: FlowNode) => <article key={n.id} className="tk" data-ui="판단 대기 줄" data-ui-item={n.id}>
    <button className="tk-row jq-row" onClick={() => go({ page: 'judge', rid, id: n.id })} title={n.title}>
      <MarkIcon n={n} size={16} />
      <span className="tk-title">{n.short}<span className="jq-full muted"> · {n.title}</span></span>
      <span className="tk-meta">{threads?.get(n.id) && <span data-ui="판단 대기 질문 수">{tr(`질문 ${threads.get(n.id)!.all}`, `${threads.get(n.id)!.all} questions`)}{threads.get(n.id)!.answered > 0 && <span className="fl-turn-name">{tr(` · 답함 ${threads.get(n.id)!.answered}`, ` · ${threads.get(n.id)!.answered} answered`)}</span>}</span>}{n.by && <span>{flowBy(n.by)}</span>}{n.date && <span>{n.date}</span>}</span>
    </button>
  </article>
  return (
    <section className="jq" data-ui="판단 대기열">
      {queued.length > 0 && <>
        <div className="tk-group-h jq-h">{tr('판단 대기', 'To judge')} <span className="rail-count tk-turn">{`${queued.length}/${JUDGE_CAP}`}</span>
          <span className="muted jq-tip">{full ? tr('가득 참: 판단하기 전에는 에이전트가 새 명제를 내지 못합니다', 'Full: agents cannot add propositions until you judge') : tr(`${JUDGE_CAP}개가 차면 에이전트가 멈춥니다`, `Agents stop when ${JUDGE_CAP} wait`)}</span></div>
        {queued.map(row)}
      </>}
      {ready.length > 0 && <>
        <div className="tk-group-h jq-h">{tr('시작을 기다리는 카드', 'Cards waiting to start')} <span className="rail-count tk-turn">{ready.length}</span></div>
        {ready.map(row)}
      </>}
    </section>
  )
}
