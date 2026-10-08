import { t } from './i18n'

// 개념노트 화면이 다시 읽은 결과를 어떻게 보일지 (ConceptNotes.tsx). 화면 없이 시험하려고 따로 둔다
const OUTSIDE_CHANGED = t('바깥에서 이 노트가 바뀌었습니다. 저장하면 덮어쓰지 않고 멈춥니다. 고친 글을 복사해 두고 취소한 뒤 다시 여세요.', 'This note changed outside the app. Saving will stop instead of overwriting. Copy your edits, cancel, and open it again.')
const OUTSIDE_GONE = t('이 노트를 다시 읽지 못했습니다. 바깥에서 지웠거나 옮겼을 수 있습니다. 고친 글을 복사해 두세요.', 'Could not read this note again. It may have been deleted or moved outside the app. Copy your edits.')

/**
 * 개념노트를 다시 읽은 결과를 화면에 어떻게 보일지. 고치는 중에는 편집기를 내리지 않고 툴바에 알린다 (고친 글이 사라지지 않게).
 * 저장하는 중의 읽기는 자기 저장일 수 있으니 바깥 변경으로 보지 않는다.
 */
export function conceptReadResult(editing: { hash: string } | null, writing: boolean, read: { hash: string } | Error): { notice?: string; error?: string } {
  if (read instanceof Error) return editing ? { notice: `${OUTSIDE_GONE} (${read.message})` } : { error: read.message }
  return editing && !writing && read.hash !== editing.hash ? { notice: OUTSIDE_CHANGED } : {}
}
