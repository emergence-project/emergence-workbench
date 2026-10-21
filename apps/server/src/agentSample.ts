/**
 * 예제 모드(RW_SANDBOX=1)의 에이전트 대화 실행기: 실제 에이전트를 띄우지 않고 정해진 줄을 낸다 (토큰을 쓰지 않는다).
 * 화면 그림(pnpm shots)과 개발용 예제 모드에서 대화 화면 · 허락 카드를 보이려고 둔다. 지시에 "계산 · 돌려 · run"이 있으면 명령 허락을 묻는다.
 */
import type { AgentRunner, RunEvent } from './agentChats.js'
import { t } from './i18n.js'

export const sampleAgentRunner: AgentRunner = async function* (input): AsyncIterable<RunEvent> {
  yield { type: 'session', id: `sample-${Date.now()}` }
  yield { type: 'tool', tool: 'mcp__workbench__rules', input: {} }
  yield { type: 'tool', tool: 'mcp__workbench__project_status', input: {} }
  yield { type: 'tool', tool: 'Read', input: { file_path: `${input.cwd}/README.md` } }
  if (/계산|돌려|run|compute/i.test(input.prompt)) {
    yield { type: 'text', text: t('노트의 확인 계산을 다시 돌려 보겠습니다.', 'I will rerun the check in the note.') }
    const d = await input.canUseTool('Bash', { command: 'python3 code/check_kempe.py --max-degree 5' })
    if (input.signal.aborted) return
    yield { type: 'text', text: d.allow ? t('계산이 끝났습니다. 6개 경우 모두 다섯 색으로 칠해집니다.', 'Done: all 6 cases are 5-colorable.') : t('계산을 돌리지 않았습니다. 노트에 적힌 결과만 확인했습니다.', 'I did not run it; I only checked the result written in the note.') }
  } else {
    yield { type: 'text', text: t('예제 모드라 실제 에이전트 대신 정해진 답을 보입니다. 맥의 앱에서는 Claude Code가 이 프로젝트 저장소에서 일합니다.', 'Sample mode shows a fixed reply instead of a real agent. In the app on the Mac, Claude Code works in this project\'s repository.') }
  }
  yield { type: 'result', ok: true, cost: 0 }
}
