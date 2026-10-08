import { ConflictError, type ResearchApi } from './api'
import { askConfirm } from './askText'
import { t } from './i18n'

/** 보조 노트는 원문 파일만 지운다. 확인할 때의 해시로 바깥 고침을 보호한다. */
export async function deleteBlockWithConfirm(
  rapi: ResearchApi,
  note: { id: string; name: string; file: string; hash: string },
  onDeleted: () => void,
  onSaved: (message: string) => void,
): Promise<void> {
  const yes = await askConfirm({
    title: t(`"${note.name}" 노트를 지울까요?`, `Delete the note "${note.name}"?`),
    hint: t(`${note.file} 파일만 영구히 지우며 되돌릴 수 없습니다. 기록 파일(workbench/comments/block-${note.id}.md), 다른 노트·원고의 링크와 기존 PDF는 남습니다. 남은 링크로는 이 노트를 열 수 없습니다.`, `Only ${note.file} is deleted, permanently. The records file (workbench/comments/block-${note.id}.md), links from other notes and the manuscript, and existing PDFs remain. Those links will no longer open this note.`),
    ok: t('지우기', 'Delete'),
  })
  if (!yes) return
  try {
    await rapi.deleteBlock(note.id, note.hash)
    onDeleted()
    onSaved(t(`"${note.name}"을 지웠습니다`, `Deleted "${note.name}"`))
  } catch (e) {
    onSaved(e instanceof ConflictError ? t('다른 곳에서 노트가 바뀌어 지우지 않았습니다. 파일을 다시 읽고 확인해 주세요.', 'The note changed elsewhere, so it was not deleted. Reload the file and check it.') : (e as Error).message)
  }
}
