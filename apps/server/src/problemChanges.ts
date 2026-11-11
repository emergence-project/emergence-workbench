// 바뀐 것 검사 가운데 흐름과 시도 나무 (docs/repo-format.md §15 · §16). 앱 · MCP · `pnpm agent:problem`은 이 규칙을 쓸 때 막는다.
// 여기서는 파일을 직접 고친 변경에서 같은 규칙을 찾는다: 사용자만 하는 것, 판정 규칙, 일하는 규칙.
import fs from 'node:fs'
import path from 'node:path'
import { PROBLEM_FILE, PROBLEMS_DIR, USER, parseAttempt, parseProblem, type RawProblem } from './problems.js'

export const PROBLEM_CHECKS = { 'problem-human': 'error', 'problem-verdict': 'error', 'problem-work': 'error' } as const
export type ProblemCheckId = keyof typeof PROBLEM_CHECKS
type Add = (check: ProblemCheckId, file: string, ko: string, en: string) => void

const IN_PROBLEM = new RegExp(`^workbench/${PROBLEMS_DIR}/([a-z0-9][a-z0-9-]{0,60})/([^/]+)\\.yaml$`)
/** 사용자만 정하는 칸과 화면의 이름 */
const HUMAN: [keyof RawProblem, string, string][] = [
  ['question', '질문', 'question'], ['if_yes', '예이면', 'if yes'], ['if_no', '아니오이면', 'if no'], ['reader', '독자', 'reader'],
  ['limit', '한도', 'limit'], ['order', '후보 순서', 'candidate order'], ['needs', '모두 필요', 'needs all'],
  ['state', '상태', 'state'], ['opened', '시작', 'opened'], ['closed', '종료', 'closed'],
]
const STATE_KO: Record<RawProblem['state'], string> = { proposed: '제안', draft: '쓰는 중', open: '진행', closed: '종료' }
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
const pendingOf = (p: RawProblem) => { const r = p.reports.at(-1); return r && !r.decision ? r : undefined }

/**
 * 바뀐 파일을 하나씩 받아 흐름 규칙에 비춰 본다. `file()`은 흐름 폴더의 파일이면 true.
 * 다 받은 뒤 `finish()`가 흐름마다 한도를 본다. `files`는 바뀐 시도가 가리킨 파일(노트가 어느 일인지 짝지을 때 쓴다).
 */
export function problemChecker(repo: string, add: Add) {
  const files: string[] = []
  /** 이번에 시작한 시도 (흐름 → 시도 파일) */
  const started = new Map<string, string[]>()
  const read = (file: string) => { try { return fs.readFileSync(path.join(repo, file), 'utf8') } catch { return undefined } }
  const problemNow = (pid: string) => { const text = read(`workbench/${PROBLEMS_DIR}/${pid}/${PROBLEM_FILE}`); return text === undefined ? null : parseProblem(text) }

  function problemFile(file: string, before: string | undefined, after: string | undefined, gone: boolean): void {
    if (gone) {
      add('problem-human', file, '흐름을 지우거나 옮겼습니다. 흐름 삭제 · 종료는 사용자가 앱에서 합니다.', 'A flow was removed or moved. The user removes or closes flows in the app.')
      return
    }
    const a = after === undefined ? null : parseProblem(after)
    if (!a) return
    const b = before === undefined ? null : parseProblem(before)
    if (!b) {
      if (a.state !== 'proposed') add('problem-human', file, `새 흐름의 상태가 ${STATE_KO[a.state]}(${a.state})입니다. 에이전트는 질문과 출처만 제안합니다(state: proposed). 쓰기 시작 · 시작 · 종료는 사용자가 앱에서 합니다.`, `The new flow is ${a.state}. Agents only propose a question with its source (state: proposed). The user drafts, opens and closes flows in the app.`)
      if (a.if_yes || a.if_no || a.reader) add('problem-human', file, '새 흐름에 메시지(예이면 · 아니오이면)나 독자를 썼습니다. 이 칸은 사용자가 씁니다. 지우세요.', 'The new flow has a message (if yes · if no) or a reader. The user writes these fields. Remove them.')
      if (a.state === 'proposed' && !a.source) add('problem-work', file, '제안에 출처(source: 논문 · 노트 절 · 시도)가 없습니다.', 'The proposal has no source (source: a paper, note section or attempt).')
      return
    }
    const changed = HUMAN.filter(([k]) => !same(a[k], b[k]))
    if (changed.length) add('problem-human', file, `사용자만 정하는 칸을 바꿨습니다: ${changed.map(([, ko]) => ko).join(' · ')}. 되돌리고, 바꿀 것은 기록으로 제안하세요.`, `Fields only the user decides were changed: ${changed.map(([, , en]) => en).join(', ')}. Revert, and propose the change in a record.`)
    if (a.reports.some((r, i) => r.decision && !same(r.decision, b.reports[i]?.decision))) add('problem-human', file, '방향 보고의 결정(decision: 계속 · 좁히기 · 종료)을 썼습니다. 결정은 사용자가 앱에서 합니다.', 'A decision on a direction report (decision: continue, narrow or close) was written. The user decides in the app.')
    const bare = (r: RawProblem['reports'][number] | undefined) => { if (!r) return undefined; const { decision: _d, ...facts } = r; return facts }
    if (b.reports.some((r, i) => !same(bare(r), bare(a.reports[i])))) add('problem-work', file, '이미 낸 방향 보고를 고치거나 지웠습니다. 보고는 덧붙이기만 합니다.', 'An earlier direction report was changed or removed. Reports are only appended.')
    if (a.reports.length > b.reports.length) {
      if (a.state !== 'open') add('problem-work', file, '시작하지 않았거나 종료한 흐름에 방향 보고를 냈습니다.', 'A direction report was filed on a flow that is not open.')
      if (a.reports.slice(0, -1).some((r) => !r.decision)) add('problem-work', file, '결정을 기다리는 방향 보고가 있는데 보고를 더 냈습니다. 한 번에 하나만 냅니다.', 'Another direction report was filed while one awaits a decision. File one at a time.')
    }
  }

  function attemptFile(pid: string, file: string, before: string | undefined, after: string | undefined): void {
    const a = after === undefined ? null : parseAttempt(path.basename(file, '.yaml'), after)
    if (!a) return
    const b = before === undefined ? null : parseAttempt(a.id, before)
    files.push(...a.files)
    const p = problemNow(pid)
    const startedNow = !!a.worker && !b?.worker
    const reportedNow = !!a.reported && a.reported !== b?.reported
    const judgedNow = !!a.verdict && !same(a.verdict, b?.verdict)
    const closedNow = (a.state === 'holds' || a.state === 'dropped') && a.state !== b?.state
    // 일하는 규칙: 사용자가 시작한 흐름에서만, 결정을 기다리는 동안에는 시작하지 않는다
    if (!p) add('problem-work', file, '흐름 파일(problem.yaml)이 없는 폴더에 시도를 썼습니다.', 'An attempt was written in a folder without a flow file (problem.yaml).')
    else if (p.state === 'proposed' || p.state === 'draft') {
      if (!b || startedNow || reportedNow || judgedNow) add('problem-work', file, '사용자가 시작하지 않은 흐름에 시도를 썼습니다. 사용자가 메시지를 쓰고 시작한 흐름에서만 일합니다.', 'An attempt was written under a flow the user has not opened. Work only on a flow the user opened with its message.')
    } else {
      const at = [!b && a.created, startedNow && a.started, reportedNow && a.reported, judgedNow && a.verdict?.at].filter((x): x is string => !!x).sort().at(-1)
      if (p.state === 'closed' && at && p.closed && at > p.closed.at) add('problem-work', file, '종료한 흐름에서 일했습니다. 종료한 흐름은 그대로 둡니다.', 'Work was done on a closed flow. A closed flow stays as it is.')
      const waiting = pendingOf(p)
      if (p.state === 'open' && startedNow && waiting && (!a.started || a.started > waiting.at)) add('problem-work', file, '방향 보고가 사용자의 결정을 기다리는 동안 시도를 시작했습니다. 결정이 날 때까지 시작하지 않습니다.', 'An attempt was started while a direction report awaits the user\'s decision. Start nothing until the decision.')
    }
    if (startedNow) started.set(pid, [...(started.get(pid) ?? []), file])
    if (a.state !== 'candidate' && a.state !== 'dropped' && !a.worker) add('problem-work', file, '시작한 시도에 작업한 쪽(worker)가 없습니다. 판정은 이 이름이 아닌 쪽이 합니다.', 'A started attempt has no worker. The verdict comes from someone other than that name.')
    if (a.state === 'reported' && (reportedNow || a.state !== b?.state) && (!a.did || !a.result)) add('problem-work', file, '보고에 한 일(did)이나 결과(result)가 빠졌습니다.', 'The report lacks what was done (did) or the result (result).')
    if (a.statement && !a.side && (reportedNow || a.statement !== b?.statement || a.side !== b?.side)) add('problem-work', file, '주장(statement)에 질문의 어느 쪽을 받치는지(side: for_yes · for_no · neither)가 없습니다.', 'The claim (statement) lacks the side of the question it supports (side: for_yes, for_no or neither).')
    // 사용자의 승인 · 돌려보냄은 흐름을 닫을 때 앱이 적는다
    if (!same(a.accepted, b?.accepted) || !same(a.returned, b?.returned)) add('problem-human', file, '사용자의 승인(accepted)이나 돌려보냄(returned)을 썼습니다. 사용자가 흐름을 닫을 때 앱에서 합니다.', 'An acceptance (accepted) or a send-back (returned) by the user was written. The user does this in the app when closing the flow.')
    // 판정 규칙
    if (!judgedNow && !closedNow) return
    if (!a.verdict) { add('problem-verdict', file, '판정 기록(verdict: at · by · note) 없이 성립 · 폐기로 바꿨습니다.', 'The attempt was set to holds or dropped without a verdict record (verdict: at, by, note).'); return }
    if (a.verdict.by === USER) add('problem-human', file, '사용자의 판정(verdict.by: user)을 썼습니다. 사용자는 앱에서 판정합니다. 에이전트의 판정에는 자기 이름을 적습니다.', 'A verdict by the user (verdict.by: user) was written. The user judges in the app. An agent signs its verdict with its own name.')
    if (a.worker && a.verdict.by === a.worker) add('problem-verdict', file, `작업한 쪽(${a.worker})이 자기 시도를 판정했습니다. 판정은 다른 에이전트나 사용자가 원자료로 합니다. 판정 대기(state: reported)로 되돌리세요.`, `The worker (${a.worker}) judged its own attempt. Another agent or the user judges from the raw data. Set it back to reported.`)
    if (a.worker && (!a.did || !a.result)) add('problem-verdict', file, '보고(did · result)가 없는 시도를 판정했습니다.', 'An attempt without a report (did, result) was judged.')
    if (a.state === 'holds' && !a.statement) add('problem-verdict', file, '진술(statement)이 없는 시도를 성립으로 했습니다. 성립은 진술이 근거에서 따라 나온다는 판정입니다.', 'Holds on an attempt without a statement. Holds means the statement follows from the grounds.')
    if (a.state === 'holds' && !a.verdict.check) add('problem-verdict', file, '성립인데 교차 검증(verdict.check: 다른 크기 · 다른 매개변수 · 독립 구현 · 극한)이 없습니다.', 'Holds without a check outside the fitted condition (verdict.check: another size, other parameters, an independent implementation or a limit).')
    if (a.state === 'holds' && a.test && a.verdict.by !== USER && a.verdict.tested !== 'pass') add('problem-verdict', file, `검사 명령이 있는 시도를 다시 돌린 결과(verdict.tested: pass) 없이 성립으로 했습니다: ${a.test}`, `Holds on an attempt with a test command, without the rerun result (verdict.tested: pass): ${a.test}`)
    if (a.state === 'dropped' && a.worker && !a.lesson) add('problem-verdict', file, '폐기인데 폐기 사유 한 줄(lesson)이 없습니다.', 'Dropped without a one-line lesson (lesson).')
  }

  return {
    files,
    /** 진행 중인 흐름의 시도가 가리키는 파일 전부 (이번에 바뀌지 않은 시도도). 진행 중인 흐름이 없으면 null */
    pointed(): string[] | null {
      const root = path.join(repo, 'workbench', PROBLEMS_DIR)
      let ids: string[] = []
      try { ids = fs.readdirSync(root).filter((x) => !x.startsWith('.')) } catch { return null }
      const open = ids.filter((pid) => problemNow(pid)?.state === 'open')
      if (!open.length) return null
      const out = [...files]
      for (const pid of open) {
        for (const f of fs.readdirSync(path.join(root, pid))) {
          if (!f.endsWith('.yaml') || f === PROBLEM_FILE || f.startsWith('.')) continue
          out.push(...(parseAttempt(f.slice(0, -5), fs.readFileSync(path.join(root, pid, f), 'utf8'))?.files ?? []))
        }
      }
      return out
    },
    /** `old`는 옮기기 전 경로 (옮기지 않았으면 같은 경로) */
    file(c: { file: string; status: 'A' | 'M' | 'D' | 'R' }, old: string, before: string | undefined, after: string | undefined): boolean {
      const was = IN_PROBLEM.exec(old), is = IN_PROBLEM.exec(c.file)
      if (was && was[2] === 'problem' && (c.status === 'D' || (c.status === 'R' && old !== c.file))) problemFile(old, before, undefined, true)
      if (!is || c.status === 'D') return !!was || !!is
      if (is[2] === 'problem') problemFile(c.file, c.status === 'R' ? undefined : before, after, false)
      else attemptFile(is[1]!, c.file, c.status === 'R' ? undefined : before, after)
      return true
    },
    finish(): void {
      for (const [pid, list] of started) {
        const p = problemNow(pid)
        if (!p || p.state !== 'open') continue
        const dir = path.join(repo, 'workbench', PROBLEMS_DIR, pid)
        const used = fs.readdirSync(dir).filter((f) => f.endsWith('.yaml') && f !== PROBLEM_FILE && !f.startsWith('.'))
          .filter((f) => parseAttempt(f.slice(0, -5), fs.readFileSync(path.join(dir, f), 'utf8'))?.worker).length
        if (used > p.limit) add('problem-work', list[0]!, `시작한 시도가 ${used}개로 한도 ${p.limit}을 넘습니다. 넘겨 시작한 시도는 후보로 되돌리고 방향 보고를 냅니다(direction_report · pnpm agent:problem … direction).`, `${used} attempts were started, over the limit of ${p.limit}. Set the extra attempt back to a candidate and file a direction report (direction_report · pnpm agent:problem … direction).`)
      }
    },
  }
}
