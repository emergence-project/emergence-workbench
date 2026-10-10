/** 기록 대상 이름: 화면과 에이전트 요약이 같은 폴더 이름을 같은 대상으로 읽는다. */
export const commentTargetSlug = (s: string): string => s.replace(/[^A-Za-z0-9._-]/g, '_').replace(/\.{2,}/g, '_').slice(0, 160) || '_'

/** 노트의 기록 대상 이름: Markdown 노트와 블록 노트만 기록을 붙인다(main.tex에는 없음). */
export function noteRecordTarget(n: { type: string; id: string; file: string }): string | undefined {
  if (n.type === 'block') return `block-${commentTargetSlug(n.id)}`
  if (n.file.endsWith('/note.md')) return `${n.type === 'calc' ? 'calc' : 'note'}-${commentTargetSlug(n.id)}`
  return undefined
}
