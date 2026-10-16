import { Icon } from './icons'

/**
 * 달력·일지의 표시 기호 (10/16 아이콘 검토): 글자(✓ ✎ ⇄ ⚑ ·) 대신 다른 아이콘과 같은 선 그림.
 * 뜻은 그대로다. 복사하는 글(브리핑)과 툴팁에는 글자를 쓴다(homeData.ts `markOf`).
 */
export const MARK_ICON = { done: Icon.check, edit: Icon.pencil, memo: Icon.memo, status: Icon.swap, due: Icon.flag } as const
export type MarkKind = keyof typeof MARK_ICON

export function MarkIcon({ k }: { k: MarkKind }) {
  return <i className="mark-ico" aria-hidden>{MARK_ICON[k]}</i>
}

/** 즐겨찾기 별 (빈 별 · 찬 별 짝, 10/16). 글자 ★ ☆ 대신. 색은 둘레 글자를 따른다 */
export function StarIcon({ on }: { on: boolean }) {
  return <i className={`star-ico${on ? ' on' : ''}`} aria-hidden>{Icon.star}</i>
}
