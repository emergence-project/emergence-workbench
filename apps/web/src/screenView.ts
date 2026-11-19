// 에이전트에게 보내는 「지금 화면」 한 줄 (11/19 사용자 "에이전트가 사용자가 보는 화면이 무엇인지 알 수 있게").
// 지시를 보낼 때마다 함께 보내고, 서버는 대화마다 앞의 것과 다를 때만 지시에 붙인다 (agentPrompts.promptFor). 여러 기기면 마지막으로 보낸 기기의 화면이 된다
import { parseRoute } from './router'

/** 제목줄 위치 표시의 이름들 (프로젝트 › 주제 › 노트 …): App.tsx가 창 제목에 거꾸로 둔 것 */
export const placeOf = (title: string) => title.replace(/ — Emergence Workbench$/, '').split(' ‹ ').reverse().filter((x) => x && x !== 'Emergence Workbench')

/** 화면 이름 · 프로젝트 id · 노트나 파일 경로 (주소) */
export function screenLine(hash = location.hash, title = document.title): string {
  const r = parseRoute(hash)
  const place = placeOf(title)
  const rid = 'rid' in r ? r.rid : undefined
  const file = r.page === 'part' ? r.file : r.page === 'file' ? r.path : r.page === 'doc' ? r.name : undefined
  const name = place.join(' › ') || r.page
  return `${[name, rid && `project ${rid}`, file].filter(Boolean).join(' · ')} (${hash || '#/'})`.slice(0, 400)
}
