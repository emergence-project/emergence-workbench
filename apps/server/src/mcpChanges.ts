// changes_since 도구의 답 (mcp.ts에서 나눔): 화면 프로젝트 정보 › 변경사항과 같은 목록을 에이전트가 읽을 글로
import type { Changes } from '@rw/core/contract/changes'

const KIND_LABEL: Record<Changes['items'][number]['kind'], string> = { note: '노트', flow: '흐름 점', task: '맡긴 일', record: '기록', file: '파일' }
const ACTION_LABEL: Record<Changes['items'][number]['action'], string> = { created: '새로 만듦', edited: '고침', moved: '옮김', deleted: '지움' }
const localTime = (iso: string) => { const d = new Date(iso); const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}` }

/** changes_since의 답: 머리 한 줄과 바뀐 것 한 줄씩 (화면 프로젝트 정보 › 변경사항과 같은 목록) */
export function changesText(c: Changes, limit = 40): string {
  const head = `변경사항 ${c.items.length} · since ${localTime(c.since)} · this Mac: ${c.machine} (uncommitted edits on another Mac are not visible until committed and pulled)`
  if (!c.items.length) return `${head}
Nothing changed.`
  const lines = c.items.slice(0, limit).map((i) => {
    const when = i.first.slice(0, 10) !== i.last.slice(0, 10) ? `${localTime(i.first)} – ${localTime(i.last)}` : localTime(i.last)
    const name = i.kind === 'file' ? i.id : i.name === i.id ? i.id : `${i.name} (${i.id})`
    return `- ${KIND_LABEL[i.kind]} ${name} · ${ACTION_LABEL[i.action]} · ${i.authors.join(', ')} · ${when}${i.uncommitted ? ' · 커밋 안 됨' : ''}`
  })
  return [head, ...lines, ...(c.items.length > limit ? [`… ${c.items.length - limit} more (pass since to narrow)`] : [])].join('\n')
}
