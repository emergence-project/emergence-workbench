import type { BlockStatus } from '@rw/core'
import { statusLabel } from './format'
import { PROOF_TEXT } from './notes'

/**
 * 상태 표시: 색 점 하나 (10/4 대화 "기호 말고 색으로"). 폐기는 속이 빈 고리라 색을 못 가려도 구별된다.
 * 자리가 있으면 옆에 이름(진행·멈춤·해결·폐기)을 함께 쓰고, 점만 둘 때도 title로 이름이 뜬다.
 */
export function StatusDot({ s, label, name: as }: { s: BlockStatus; label?: boolean; /** 색은 s를 쓰고 이름만 다르게 (맡긴 일의 "판단 대기"는 멈춤과 같은 주황이지만 이름은 판단 대기) */ name?: string }) {
  const name = as ?? statusLabel(s)
  return <>
    <span className={`g ${s}`} role="img" aria-label={name} title={name} />
    {label && <span className="g-name">{name}</span>}
  </>
}

/** 진술의 증명 상태: 증명 작업의 색 점. 공리·정의는 —, 증명 작업 없음은 옅은 회색 점 */
export function ProofMark({ p }: { p: 'given' | 'solved' | 'blocked' | 'in-progress' | 'none' }) {
  if (p === 'given') return <span className="proof-mark" title={PROOF_TEXT.given}>—</span>
  return <span className={`g ${p}`} role="img" aria-label={PROOF_TEXT[p]} title={PROOF_TEXT[p]} />
}
