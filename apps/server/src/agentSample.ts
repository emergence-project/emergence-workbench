/**
 * 예제 모드(RW_SANDBOX=1)의 에이전트 대화 실행기: 실제 에이전트를 띄우지 않고 정해진 줄을 낸다 (토큰을 쓰지 않는다).
 * 앱 고치기 대화는 파일 하나를 고치고 PR을 올리는 줄을 낸다(sampleAppWork가 정해 둔 PR #234).
 * 화면 그림(pnpm shots)과 개발용 예제 모드에서 대화 화면을 보이려고 둔다. 지시에 "계산 · 돌려 · run"이 있으면 할 일 · 하위 에이전트 · (계획 먼저면) 계획 카드 · 명령 허락 · 노트 고침을 차례로 낸다.
 */
import type { AgentRunner, RunEvent } from './agentChats.js'
import { t } from './i18n.js'

export const sampleAgentRunner: AgentRunner = async function* (input): AsyncIterable<RunEvent> {
  yield { type: 'session', id: `sample-${Date.now()}` }
  if (input.appChat) { yield* sampleApp(input); return }
  yield { type: 'tool', tool: 'mcp__workbench__rules', input: {} }
  yield { type: 'tool', tool: 'mcp__workbench__project_status', input: {} }
  yield { type: 'tool', tool: 'Read', input: { file_path: `${input.cwd}/README.md` } }
  if (/계산|돌려|run|compute/i.test(input.prompt)) {
    const todos = (n: number) => ({ todos: [t('노트와 계산 코드 읽기', 'Read the note and the code'), t('옛 계산 기록 찾기', 'Find earlier runs'), t('차수 5로 계산 돌리기', 'Run up to degree 5'), t('결과를 Checks 절과 맞추기', 'Match the result with Checks')].map((content, i) => ({ content, status: i < n ? 'completed' : i === n ? 'in_progress' : 'pending' })) })
    yield { type: 'tool', tool: 'TodoWrite', input: todos(0) }
    yield { type: 'tool', tool: 'mcp__workbench__read_note', input: { file: 'workbench/notes/kempe-recoloring/note.md' } }
    yield { type: 'tool', tool: 'TodoWrite', input: todos(1) }
    yield { type: 'tool', tool: 'Task', input: { description: t('옛 계산 기록 찾기', 'Find earlier runs') } }
    yield { type: 'tool', tool: 'Grep', input: { pattern: 'max-degree', path: `${input.cwd}/workbench` }, sub: true }
    if (input.mode === 'plan') {
      const plan = await input.canUseTool('ExitPlanMode', { plan: [t('1. 노트의 Checks 절과 code/check_kempe.py 읽기', '1. Read Checks in the note and code/check_kempe.py'), t('2. 최대 차수 5로 계산 돌리기 (명령은 허락받고)', '2. Run up to degree 5 (asking before the command)'), t('3. 결과가 다르면 Checks 절 한 줄 고치기', '3. If the result differs, update one line in Checks')].join('\n') })
      if (!plan.allow || input.signal.aborted) {
        yield { type: 'text', text: t('계획을 고쳐 다시 보이겠습니다. 무엇을 바꿀까요?', 'I will revise the plan. What should change?') }
        yield { type: 'result', ok: true, cost: 0, seconds: 2 }
        return
      }
    }
    yield { type: 'tool', tool: 'TodoWrite', input: todos(2) }
    yield { type: 'text', text: t('노트에 적힌 확인은 차수 4까지입니다. 차수 5로 다시 돌리려면 아래 명령이 필요합니다.', 'The note checks up to degree 4. Rerunning up to degree 5 needs the command below.') }
    const d = await input.canUseTool('Bash', { command: 'python3 code/check_kempe.py --max-degree 5' })
    if (input.signal.aborted) return
    if (d.allow) {
      const file = 'workbench/notes/kempe-recoloring/note.md'
      const edits = [{ old: t('확인: 최대 차수 4까지 모든 경우에서 다섯 색이 남는다.', 'Check: five colors remain in every case up to degree 4.'), new: t('확인: 최대 차수 5까지 모든 경우에서 다섯 색이 남는다 (10/21 다시 계산).', 'Check: five colors remain in every case up to degree 5 (rerun 10/21).'), reason: t('차수 5까지 다시 돌린 결과', 'Result of the rerun up to degree 5') }]
      yield { type: 'tool', tool: 'mcp__workbench__edit_note', input: { file, edits } }
      await input.canUseTool('mcp__workbench__edit_note', { file, edits })
      yield { type: 'tool', tool: 'TodoWrite', input: todos(4) }
    }
    yield { type: 'text', text: d.allow ? t('계산이 끝났습니다. 6개 경우 모두 다섯 색으로 칠해집니다. Checks 절의 한 줄을 고쳤습니다.', 'Done: all 6 cases are 5-colorable. I updated one line in Checks.') : t('계산을 돌리지 않았습니다. 노트에 적힌 결과만 확인했습니다.', 'I did not run it; I only checked the result written in the note.') }
  } else {
    yield { type: 'text', text: t('예제 모드라 실제 에이전트 대신 정해진 답을 보입니다. 맥의 앱에서는 Claude Code가 이 프로젝트 저장소에서 일합니다.', 'Sample mode shows a fixed reply instead of a real agent. In the app on the Mac, Claude Code works in this project\'s repository.') }
  }
  yield { type: 'result', ok: true, cost: 0, seconds: 3 }
}

/** 앱 고치기 대화의 예제: 읽기 → 파일 고치기 → PR 올리기 → CI 결과 */
async function* sampleApp(input: Parameters<AgentRunner>[0]): AsyncIterable<RunEvent> {
  const file = `${input.cwd}/apps/web/src/styles/note.css`
  yield { type: 'tool', tool: 'Read', input: { file_path: `${input.cwd}/CLAUDE.md` } }
  yield { type: 'tool', tool: 'Grep', input: { pattern: 'note-export-menu', path: `${input.cwd}/apps/web/src` } }
  const edit = { file_path: file, old_string: '.note-export-menu { right: auto; }', new_string: '.note-export-menu { right: 0; left: auto; }' }
  const d = await input.canUseTool('Edit', edit)
  if (input.signal.aborted) return
  if (!d.allow) {
    yield { type: 'text', text: t('파일을 고치지 않았습니다.', 'I did not change the file.') }
    yield { type: 'result', ok: true, cost: 0, seconds: 2 }
    return
  }
  yield { type: 'tool', tool: 'Edit', input: edit }
  const pr = { title: t('노트 툴바 내보내기 메뉴가 화면 오른쪽에서 잘리지 않게', 'Keep the note export menu inside the screen'), body: '## Before\n…' }
  const s = await input.canUseTool('mcp__workbench__app_submit', pr)
  if (input.signal.aborted) return
  if (s.allow) {
    yield { type: 'tool', tool: 'mcp__workbench__app_submit', input: pr }
    yield { type: 'tool', tool: 'mcp__workbench__app_checks', input: {} }
  }
  yield { type: 'text', text: s.allow ? t('메뉴를 오른쪽 끝에 맞췄습니다. PR #234를 열었고 CI가 모두 통과했습니다.', 'The menu now aligns to the right edge. Opened PR #234; CI passed.') : t('고친 것을 올리지 않았습니다.', 'I did not submit the change.') }
  yield { type: 'result', ok: true, cost: 0, seconds: 4 }
}
