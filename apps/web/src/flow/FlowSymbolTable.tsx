import type { ReactNode } from 'react'
import { t as tr } from '../i18n'
import { type Mark, KIND, EDGE, stateOf, MarkSvg } from './marks'

/** 소개 › 기호와 의미의 흐름 표 (10/15 피드백 "기호와 의미 절"): 차트와 같은 그림과 이름을 써서 둘이 어긋나지 않는다 */
export function FlowSymbolTable() {
  const mark = (m: Mark, state = 'active', judged?: boolean, turn?: boolean) => <svg className="fl-icon" width={26} height={26} viewBox="0 0 30 30" aria-hidden>
    {turn && <circle className="fl-turn" cx={15} cy={15} r={13.5} />}<MarkSvg m={m} x={15} y={15} state={state} judged={judged} /></svg>
  const line = (cls: string) => <svg className="fl-icon" width={40} height={14} viewBox="0 0 40 14" aria-hidden><path className={cls} d="M2 7H38" /></svg>
  const kinds: Mark[] = ['question', 'guess', 'finding', 'theorem', 'calc', 'analytic', 'proof', 'literature']
  const states: { s: ReturnType<typeof stateOf>; m: Mark; name: string; meaning: string }[] = [
    { s: 'open', m: 'question', name: tr('미해결', 'Open'), meaning: tr('아직 손대지 않음 (속이 빈 점선)', 'Not started yet (hollow, dashed)') },
    { s: 'active', m: 'question', name: tr('진행', 'In progress'), meaning: tr('하고 있는 걸음', 'A step being worked on') },
    { s: 'paused', m: 'question', name: tr('멈춤', 'Paused'), meaning: tr('무엇을 기다리는 중', 'Waiting for something') },
    { s: 'solved', m: 'question', name: tr('끝남 · 해결 / 성공', 'Done · solved / succeeded'), meaning: tr('진술은 해결, 행위는 성공', 'Solved for a statement, succeeded for an action') },
    { s: 'refuted', m: 'question', name: tr('끝남 · 반증 / 실패', 'Done · refuted / failed'), meaning: tr('틀린 것으로 끝남 (속이 찬 회색)', 'Ended as wrong (filled gray)') },
    { s: 'dropped', m: 'question', name: tr('끝남 · 폐기', 'Done · dropped'), meaning: tr('그만둔 걸음, 지우지 않음 (속이 빈 회색)', 'A step given up, not deleted (hollow gray)') },
  ]
  // 판단 (10/23 "판단 설계"): 명제는 사람이 승인해야 채워지고, 사용자 차례는 주황 고리
  const judged: { mark: ReactNode; name: string; meaning: string }[] = [
    { mark: mark('finding', 'active', false), name: tr('판단 전', 'Not judged'), meaning: tr('사람이 아직 판단하지 않은 명제 (속이 빔). 수정 요청 · 기각도 속이 빈다', 'A proposition no one has judged yet (hollow). Sent back and rejected stay hollow too') },
    { mark: mark('finding', 'active', true), name: tr('승인됨', 'Approved'), meaning: tr('사람이 승인한 명제 (속이 참). 내용이 바뀌면 판단이 풀린다', 'A proposition a person approved (filled). Changing its content clears the judgment') },
    { mark: mark('finding', 'active', false, true), name: tr('내 차례', 'Your turn'), meaning: tr('판단을 기다리는 명제와 시작을 기다리는 카드 (주황 고리)', 'Propositions awaiting judgment and cards awaiting a start (orange ring)') },
  ]
  // 접은 흐름의 묶음 (10/23)
  const bundles: { mark: ReactNode; name: string; meaning: string }[] = [
    { mark: <svg className="fl-icon" width={26} height={26} viewBox="0 0 30 30" aria-hidden><circle className="fl-noq" cx={15} cy={15} r={13.5} /><MarkSvg m="calc" x={15} y={15} state="solved" /></svg>, name: tr('질문 없이 시작', 'Started without a question'), meaning: tr('앞 명제에서 바로 시작한 작업의 묶음 (점선 고리)', 'A bundle of work started straight from an earlier proposition (dashed ring)') },
    { mark: <svg className="fl-icon fl-side-icon" width={26} height={26} viewBox="0 0 30 30" aria-hidden><MarkSvg m="question" x={15} y={15} state="open" /></svg>, name: tr('곁가지', 'Side question'), meaning: tr('적어만 두고 시작하지 않은 질문 (옅게)', 'A question written down but not started (faint)') },
    { mark: <span className="fl-tally-t">□2 §1 !1</span>, name: tr('묶음 안의 수', 'Counts in a bundle'), meaning: tr('묶음 이름 아래: 작업 □ · 문헌 읽기 § · 명제 ! · 반증 ⊥', 'Under a bundle\'s name: work □ · reading § · propositions ! · refuted ⊥') },
  ]
  const lines: { mark: ReactNode; name: string; meaning: string }[] = [
    { mark: line('fl-e'), name: `${EDGE.origin!()} · ${EDGE.support!()} · ${EDGE.refute!()}`, meaning: tr('앞 걸음이 이 걸음을 낳음 · 받침 · 반박함. 선을 가리키면 이름이 뜹니다', 'The earlier step started, supports or refutes this one. Hover a line to see its name') },
    { mark: line('fl-e use'), name: EDGE.use!(), meaning: tr('앞 걸음의 결과를 가져다 씀 (점선)', 'Uses the earlier step\'s result (dotted)') },
    { mark: line('fl-e lit'), name: tr('문헌에서', 'From literature'), meaning: tr('문헌 점에서 나온 선 (끊긴 선)', 'A line from a literature dot (dashed)') },
    { mark: <svg className="fl-icon" width={26} height={26} viewBox="0 0 30 30" aria-hidden><text className="fl-name fl-cite" x={15} y={20} textAnchor="middle">§2</text></svg>, name: tr('근거 논문', 'Evidence papers'), meaning: tr('점 이름 뒤의 §: 근거로 단 논문 (둘 이상이면 수)', '§ after a dot\'s name: papers attached as evidence (a count when several)') },
    { mark: <svg className="fl-icon" width={26} height={26} viewBox="0 0 30 30" aria-hidden><path className="fl-start" d="M9 8L18 15L9 22Z" /></svg>, name: tr('시작점', 'Start'), meaning: tr('앞선 점이 없는 점', 'A dot with no earlier dot') },
    { mark: <svg className="fl-icon" width={26} height={26} viewBox="0 0 30 30" aria-hidden><line className="fl-end" x1={15} y1={5} x2={15} y2={25} /></svg>, name: tr('흐름 종료', 'Flow ends'), meaning: tr('이 갈래는 여기서 끝나 뒤에 이어질 점이 없음', 'This branch ends here; no dot follows') },
  ]
  const group = (name: string) => <tr className="about-sym-group"><td colSpan={3}>{name}</td></tr>
  return (
    <table className="about-sym-table">
      <thead><tr><th>{tr('기호', 'Symbol')}</th><th>{tr('이름', 'Name')}</th><th>{tr('뜻', 'Meaning')}</th></tr></thead>
      <tbody>
        {group(tr('종류 (동그라미 진술 · 둥근 네모 행위)', 'Kind (circle statement · rounded square action)'))}
        {kinds.map((k) => <tr key={k}><td className="about-sym">{mark(k)}</td><td>{KIND[k].name()}</td><td>{KIND[k].def()}</td></tr>)}
        {group(tr('상태 (색)', 'State (color)'))}
        {states.map((x) => <tr key={x.s}><td className="about-sym">{mark(x.m, x.s)}</td><td>{x.name}</td><td>{x.meaning}</td></tr>)}
        {group(tr('판단 (속이 빔 · 참 · 주황 고리)', 'Judgment (hollow · filled · orange ring)'))}
        {judged.map((x) => <tr key={x.name}><td className="about-sym">{x.mark}</td><td>{x.name}</td><td>{x.meaning}</td></tr>)}
        {group(tr('접은 흐름의 묶음', 'Bundles in the folded flow'))}
        {bundles.map((x) => <tr key={x.name}><td className="about-sym">{x.mark}</td><td>{x.name}</td><td>{x.meaning}</td></tr>)}
        {group(tr('선과 표시', 'Lines and marks'))}
        {lines.map((x) => <tr key={x.name}><td className="about-sym">{x.mark}</td><td>{x.name}</td><td>{x.meaning}</td></tr>)}
      </tbody>
    </table>
  )
}
