/** 기록 대상 이름: 화면과 에이전트 요약이 같은 폴더 이름을 같은 대상으로 읽는다. */
export const commentTargetSlug = (s: string): string => s.replace(/[^A-Za-z0-9._-]/g, '_').replace(/\.{2,}/g, '_').slice(0, 160) || '_'

/** 노트의 기록 대상 이름: Markdown 노트와 블록 노트만 기록을 붙인다(main.tex에는 없음). */
export function noteRecordTarget(n: { type: string; id: string; file: string }): string | undefined {
  if (n.type === 'block') return `block-${commentTargetSlug(n.id)}`
  if (n.file.endsWith('/note.md')) return `${n.type === 'calc' ? 'calc' : 'note'}-${commentTargetSlug(n.id)}`
  return undefined
}

/**
 * 주제 폴더 안 노트(`workbench/topics/<주제>/<노트>/…`)는 `workbench/notes/<노트>/…`와 같은 노트다 (10/13 연구 저장소 폴더).
 * 주인 주제를 바꾸면 폴더가 옮겨 가므로, 원고 key · 기록 대상 · 고침 검토처럼 노트를 가리키는 이름은 이 경로로 만든다.
 */
export const canonicalNoteFile = (file: string): string => file.replace(/^workbench\/topics\/[^/]+\/(?=[^/]+\/)/, 'workbench/notes/')

/** 같은 노트 파일인지 (주제 폴더 사이를 옮긴 뒤의 옛 경로도 같은 노트로 본다) */
export const sameNoteFile = (a: string, b: string): boolean => a === b || canonicalNoteFile(a) === canonicalNoteFile(b)
