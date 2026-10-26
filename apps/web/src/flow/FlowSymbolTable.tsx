import type { ReactNode } from 'react'
import { t as tr } from '../i18n'
import { type Mark, KIND, EDGE, stateOf, MarkSvg } from './marks'

/** 소개 › 기호와 의미의 흐름 표 (10/15 피드백 "기호와 의미 절"): 차트와 같은 그림과 이름을 써서 둘이 어긋나지 않는다 */
export function FlowSymbolTable() {
  const mark = (m: Mark, state = 'active', judged?: boolean, turn?: boolean) => <svg className="fl-icon" width={26} height={26} viewBox="0 0 30 30" aria-hidden>
    <MarkSvg m={m} x={15} y={15} state={state} judged={judged} turn={turn} /></svg>
  const line = (cls: string) => <svg className="fl-icon" width={40} height={14} viewBox="0 0 40 14" aria-hidden><path className={cls} d="M2 7H38" /></svg>
  const kinds: Mark[] = ['question', 'calc', 'analytic', 'proof', 'literature', 'finding', 'theorem']
  const states: { s: ReturnType<typeof stateOf>; m: Mark; name: string; meaning: string }[] = [
    { s: 'open', m: 'question', name: tr('미해결', 'Open'), meaning: tr('아직 손대지 않음 (속이 빈 점선)', 'Not started yet (hollow, dashed)') },
    { s: 'active', m: 'question', name: tr('진행', 'In progress'), meaning: tr('하고 있는 걸음', 'A step being worked on') },
    { s: 'paused', m: 'question', name: tr('멈춤', 'Paused'), meaning: tr('무엇을 기다리는 중', 'Waiting for something') },
    { s: 'solved', m: 'question', name: tr('끝남 · 해결 / 성공', 'Done · solved / succeeded'), meaning: tr('질문 · 명제는 해결, 작업은 성공', 'Solved for a question or proposition, succeeded for work') },
    { s: 'refuted', m: 'question', name: tr('끝남 · 반증 / 실패', 'Done · refuted / failed'), meaning: tr('틀린 것으로 끝남 (속이 찬 회색)', 'Ended as wrong (filled gray)') },
    { s: 'dropped', m: 'question', name: tr('끝남 · 폐기', 'Done · dropped'), meaning: tr('그만둔 걸음, 지우지 않음 (속이 빈 회색)', 'A step given up, not deleted (hollow gray)') },
  ]
  // 판단 (10/23 "판단 설계", 10/26 "흐름 점 표식"): 명제는 사람이 승인해야 채워지고, 판단할 차례는 주황으로 채움
  const judged: { mark: ReactNode; name: string; meaning: string }[] = [
    { mark: mark('finding', 'solved', false, true), name: tr('판단 전', 'Not judged'), meaning: tr('사람이 아직 승인 · 기각하지 않은 명제 (주황). 수정 요청도 주황', 'A proposition not yet approved or rejected (orange). Sent back stays orange too') },
    { mark: mark('finding', 'dropped', false), name: tr('기각', 'Rejected'), meaning: tr('사실로 받지 않은 명제 (속 빈 회색)', 'A proposition not accepted as fact (hollow gray)') },
    { mark: mark('finding', 'solved', true), name: tr('승인됨', 'Approved'), meaning: tr('사람이 승인한 명제 (속이 참). 내용이 바뀌면 판단이 풀린다', 'A proposition a person approved (filled). Changing its content clears the judgment') },
    { mark: mark('question', 'active', undefined, true), name: tr('내 차례', 'Your turn'), meaning: tr('시작을 기다리는 카드도 주황, 판단 대기열의 점에는 주황 고리', 'Cards awaiting a start are orange too; dots in the judgment queue get an orange ring') },
  ]
  // 접은 흐름의 묶음 (10/23)
  const bundles: { mark: ReactNode; name: string; meaning: string }[] = [
    { mark: <svg className="fl-icon" width={26} height={26} viewBox="0 0 30 30" aria-hidden><circle className="fl-noq" cx={15} cy={15} r={13.5} /><MarkSvg m="calc" x={15} y={15} state="solved" /></svg>, name: tr('질문 없이 시작', 'Started without a question'), meaning: tr('앞 명제에서 바로 시작한 작업의 묶음 (점선 고리)', 'A bundle of work started straight from an earlier proposition (dashed ring)') },
    { mark: <svg className="fl-icon fl-side-icon" width={26} height={26} viewBox="0 0 30 30" aria-hidden><MarkSvg m="question" x={15} y={15} state="open" /></svg>, name: tr('곁가지', 'Side question'), meaning: tr('적어만 두고 시작하지 않은 질문 (옅게)', 'A question written down but not started (faint)') },
    { mark: <span className="fl-tally-t">{tr('작업 2', '2 work')}</span>, name: tr('묶음 안의 수', 'Counts in a bundle'), meaning: tr('묶음 이름 아래 글로: 작업 · 문헌 · 명제 · 반증', 'In words under a bundle\'s name: work · reading · propositions · refuted') },
  ]
  const lines: { mark: ReactNode; name: string; meaning: string }[] = [
    { mark: line('fl-e'), name: `${EDGE.origin!()} · ${EDGE.support!()} · ${EDGE.refute!()}`, meaning: tr('앞 걸음이 이 걸음을 낳음 · 받침 · 반박함. 선을 가리키면 이름이 뜹니다', 'The earlier step started, supports or refutes this one. Hover a line to see its name') },
    { mark: line('fl-e use'), name: EDGE.use!(), meaning: tr('앞 걸음의 결과를 가져다 씀 (점선)', 'Uses the earlier step\'s result (dotted)') },
    { mark: line('fl-e lit'), name: tr('문헌에서', 'From literature'), meaning: tr('문헌 점에서 나온 선 (끊긴 선)', 'A line from a literature dot (dashed)') },
    { mark: <svg className="fl-icon" width={26} height={26} viewBox="0 0 30 30" aria-hidden><path className="fl-start" d="M9 8L18 15L9 22Z" /></svg>, name: tr('시작점', 'Start'), meaning: tr('앞선 점이 없는 점', 'A dot with no earlier dot') },
  ]
  const group = (name: string) => <tr className="about-sym-group"><td colSpan={3}>{name}</td></tr>
  return (
    <table className="about-sym-table">
      <thead><tr><th>{tr('기호', 'Symbol')}</th><th>{tr('이름', 'Name')}</th><th>{tr('뜻', 'Meaning')}</th></tr></thead>
      <tbody>
        {group(tr('종류 (◇ 여는 점 · ○ 작업 · □ 닫는 점)', 'Kind (◇ opens · ○ work · □ closes)'))}
        {kinds.map((k) => <tr key={k}><td className="about-sym">{mark(k)}</td><td>{KIND[k].name()}</td><td>{KIND[k].def()}</td></tr>)}
        {group(tr('상태 (색)', 'State (color)'))}
        {states.map((x) => <tr key={x.s}><td className="about-sym">{mark(x.m, x.s)}</td><td>{x.name}</td><td>{x.meaning}</td></tr>)}
        {group(tr('판단 (주황 판단 전 · 청록 승인 · 회색 고리 기각)', 'Judgment (orange not judged · teal approved · gray ring rejected)'))}
        {judged.map((x) => <tr key={x.name}><td className="about-sym">{x.mark}</td><td>{x.name}</td><td>{x.meaning}</td></tr>)}
        {group(tr('접은 흐름의 묶음', 'Bundles in the folded flow'))}
        {bundles.map((x) => <tr key={x.name}><td className="about-sym">{x.mark}</td><td>{x.name}</td><td>{x.meaning}</td></tr>)}
        {group(tr('선과 표시', 'Lines and marks'))}
        {lines.map((x) => <tr key={x.name}><td className="about-sym">{x.mark}</td><td>{x.name}</td><td>{x.meaning}</td></tr>)}
      </tbody>
    </table>
  )
}
