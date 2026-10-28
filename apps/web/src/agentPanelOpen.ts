import { openRight } from './noteScreen'
import { store } from './store'

/**
 * 오른쪽 사이드바 에이전트 탭에서 대화 하나를 연다 (10/28 사용자 정정 "이동하지 않고 사이드바에서").
 * 기록 · 수정 검토의 「대화 보기」가 페이지를 옮기지 않고 이것을 부른다. 넓게 볼 때만 에이전트 화면으로 간다
 */
export const AGENT_PANEL_OPEN = 'rw:agent-panel-open'
export const agentPanelKey = (rid: string) => `rw-agent-panel-${rid}`

export function openChatInSidebar(rid: string, id: string) {
  store.set(agentPanelKey(rid), id)
  window.dispatchEvent(new CustomEvent(AGENT_PANEL_OPEN, { detail: { rid, id } }))
  openRight('agent')
}
