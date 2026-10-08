import type { ConceptRow } from './api'
import { t } from './i18n'

/** 목록에는 중요한 표시 하나만 두고, 나머지 상태와 까닭은 함께 가리켜 본다. */
export function conceptRowMark(row: Pick<ConceptRow, 'checked' | 'unfinished' | 'locked'>) {
  const marks: { label: string; detail: string; checked?: boolean }[] = []
  if (row.checked === 'changed') marks.push({ label: t('확인 뒤 고침', 'Edited after review'), detail: t('확인 뒤 고침 — 확인한 뒤 본문이 바뀌었습니다', 'Edited after review: the text changed after it was reviewed') })
  if (row.unfinished.length) marks.push({ label: t('미완성', 'Unfinished'), detail: t(`미완성 — ${row.unfinished.join(' · ')}`, `Unfinished: ${row.unfinished.join(' · ')}`) })
  if (row.locked) marks.push({ label: t('잠김', 'Locked'), detail: t('잠김 — 앱과 에이전트가 고치지 않습니다', 'Locked: the app and agents do not edit it') })
  if (row.checked === 'ok') marks.push({ label: t('확인함', 'Reviewed'), detail: t('확인함', 'Reviewed'), checked: true })
  return marks[0] ? { ...marks[0], title: marks.map((mark) => mark.detail).join('\n') } : null
}
