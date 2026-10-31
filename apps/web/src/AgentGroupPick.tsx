import { t } from './i18n'

/** 대화 목록 묶음 이름 옆 칸: 그 프로젝트의 대화를 한 번에 고르고 푼다. ids는 고를 수 있는 대화만 (10/30 17:09, 시안 3절) */
export function GroupPick({ name, ids, picked, onPick }: { name: string; ids: string[]; picked: string[]; onPick(next: string[]): void }) {
  const n = ids.filter((x) => picked.includes(x)).length
  const all = ids.length > 0 && n === ids.length
  return (
    <button type="button" className="ac-group-pick" data-ui="묶음 모두 고르기" disabled={!ids.length} aria-pressed={all ? true : n ? 'mixed' : false}
      aria-label={t(`${name}의 대화 모두 고르기`, `Pick all conversations in ${name}`)} data-tip={all ? t('모두 풀기', 'Unpick all') : t('모두 고르기', 'Pick all')}
      onClick={() => onPick(all ? picked.filter((x) => !ids.includes(x)) : [...new Set([...picked, ...ids])])}>
      <span className={`ac-pick${all ? ' on' : n ? ' half' : ''}`} aria-hidden />
    </button>
  )
}
