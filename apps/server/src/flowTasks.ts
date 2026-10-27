// 맡긴 일 ↔ 흐름 점 (10/26 결정 "흐름 연결" ①): 흐름 찾기와 STATUS가 이어진 맡긴 일의 결과까지 보이게. 짝 계산은 @rw/core flow-tasks (화면도 쓴다)
import type { Task } from '@rw/core/contract/tasks'
export { taskLinks, type TaskLink, type TaskLinkHow } from '@rw/core'

/** STATUS · 찾기에 쓰는 맡긴 일 상태 이름 (연구 파일이라 한국어) */
export const TASK_STATE_NAME: Record<Task['state'], string> = {
  working: '진행', proposed: '종결 조건 승인 대기', result: '결과 도착 · 판단 대기', paused: '멈춤', done: '끝남', stopped: '폐기',
}
