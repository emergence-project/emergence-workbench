import { JOURNAL_LABEL, type JournalEntry, type JournalKind } from '@rw/core'
import type { AskConfirm } from './askText'
import { shown, t } from './i18n'

/** 완료 기록은 지우기만, 앱이 남긴 상태 기록은 읽기만 한다. */
export function journalEntryActions(kind: JournalKind): { editable: boolean; deletable: boolean } {
  return { editable: kind === 'memo' || kind === 'todo', deletable: kind !== 'status' }
}

export function journalDeletePrompt(entry: Pick<JournalEntry, 'kind' | 'text'>): AskConfirm {
  const text = entry.text.replace(/\s+/g, ' ').trim()
  const short = text.length > 40 ? `${text.slice(0, 40)}…` : text
  const remains = entry.kind === 'done'
    ? t('원래 할 일의 완료 표시, 다른 일지 항목과 연결된 노트는 그대로 남습니다.', 'The done mark on the original to-do and notes linked from other journal entries stay.')
    : t('다른 일지 항목과 연결된 노트는 그대로 남습니다.', 'Notes linked from other journal entries stay.')
  return {
    title: t(`이 ${JOURNAL_LABEL[entry.kind]} 기록을 지울까요?`, `Delete this ${shown(JOURNAL_LABEL[entry.kind]).toLowerCase()} record?`),
    hint: t(`${short} — 일지 파일의 이 항목만 지우며 되돌릴 수 없습니다. ${remains}`, `${short}: deletes only this entry from the journal file. This can't be undone. ${remains}`),
    ok: t('지우기', 'Delete'),
  }
}
