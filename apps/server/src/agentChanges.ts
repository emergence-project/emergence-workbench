import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'
import { frontMatter, parseBlock } from '@rw/core'
import type { WorkbenchDiagnostic } from './agentCheck.js'
import { t } from './i18n.js'
import { folderMap, usesStandardLayout } from './projectFolders.js'
import type { Workbench } from './workbench.js'
import { JUDGE_CAP } from '@rw/core'
import { cardBlock, parseFlowNode, scanFlow } from './flow.js'
import { flowGate, judgmentHash, judgmentQueue, markJudgments, undefinedTerms } from './flowGaps.js'
import { integrationProblem } from './flowStart.js'
import { readTopics } from './topics.js'

/**
 * 바뀐 것 검사 (`pnpm agent:check`, docs/repo-format.md §15). 공통 규칙 가운데 기계가 판정할 수 있는 것을
 * 기준 커밋 이후 바뀐 파일에서 찾는다. 파일은 읽기만 한다.
 */
export type CheckLevel = 'error' | 'warning' | 'off'
export const CHANGE_CHECKS = {
  'frozen-folder': 'error',
  locked: 'error',
  approval: 'error',
  'flow-human': 'error',
  'flow-form': 'error',
  'flow-skipped': 'warning',
  'flow-start': 'warning',
  'flow-integration': 'warning',
  'flow-new-dot': 'off',
  'queue-cap': 'error',
  'card-not-started': 'error',
  'card-locked': 'error',
  'card-terms': 'warning',
  'nonstandard-new-file': 'warning',
  'confirmed-edit': 'warning',
  'outside-workbench': 'warning',
  'move-delete': 'warning',
} as const satisfies Record<string, CheckLevel>
export type ChangeCheckId = keyof typeof CHANGE_CHECKS
export type CheckLevels = Partial<Record<ChangeCheckId, CheckLevel>>

export interface ChangeDiagnostic extends WorkbenchDiagnostic { check: ChangeCheckId }
export interface ChangeReport {
  /** 기준 이름 (origin/main, 브랜치의 upstream, HEAD) */
  base: string
  /** 기준 뒤 올리지 않은 커밋 수 */
  commits: number
  files: number
  diagnostics: ChangeDiagnostic[]
}

const LEVELS = new Set<CheckLevel>(['error', 'warning', 'off'])
const isCheck = (k: string): k is ChangeCheckId => Object.hasOwn(CHANGE_CHECKS, k)

/** 공통 규칙 머리말의 `checks:` (검사 이름 → error · warning · off). 모르는 이름과 값은 넘어간다 */
export function checkLevels(rulesText: string | undefined): CheckLevels {
  const fm = rulesText ? frontMatter(rulesText) : null
  if (!fm) return {}
  let raw: unknown
  try { raw = YAML.parse(fm.yaml) } catch { return {} }
  const checks = raw && typeof raw === 'object' ? (raw as Record<string, unknown>).checks : undefined
  if (!checks || typeof checks !== 'object' || Array.isArray(checks)) return {}
  const out: CheckLevels = {}
  for (const [k, v] of Object.entries(checks)) if (isCheck(k) && typeof v === 'string' && LEVELS.has(v as CheckLevel)) out[k] = v as CheckLevel
  return out
}

const git = (cwd: string, args: string[]): string | null => {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 })
  } catch { return null }
}

/** 기준: 주어진 ref, 없으면 origin의 기본 브랜치(origin/HEAD, 없으면 main·master), 그다음 upstream과 갈라진 곳. 모두 없으면 HEAD (커밋하지 않은 변경만) */
export function changeBase(repo: string, given?: string): { ref: string; name: string } | null {
  if (git(repo, ['rev-parse', '--verify', '-q', 'HEAD']) === null) return null
  for (const ref of given ? [given] : ['origin/HEAD', 'origin/main', 'origin/master', '@{upstream}']) {
    const at = git(repo, ['merge-base', 'HEAD', ref])?.trim()
    if (at) return { ref: at, name: git(repo, ['rev-parse', '--abbrev-ref', ref])?.trim() || ref }
  }
  return given ? null : { ref: 'HEAD', name: 'HEAD' }
}

interface Change { status: 'A' | 'M' | 'D' | 'R'; file: string; from?: string }

/** `git diff --name-status -z` + 추적하지 않는 새 파일 */
function changesSince(repo: string, base: string): Change[] {
  const tokens = (git(repo, ['diff', '--name-status', '-z', '-M', '--relative', base]) ?? '').split('\0')
  const out: Change[] = []
  for (let i = 0; i < tokens.length && tokens[i];) {
    const code = tokens[i]![0]!
    if (code === 'R' || code === 'C') {
      out.push(code === 'R' ? { status: 'R', from: tokens[i + 1]!, file: tokens[i + 2]! } : { status: 'A', file: tokens[i + 2]! })
      i += 3
    } else {
      out.push({ status: code === 'A' ? 'A' : code === 'D' ? 'D' : 'M', file: tokens[i + 1]! })
      i += 2
    }
  }
  for (const file of (git(repo, ['ls-files', '--others', '--exclude-standard', '-z']) ?? '').split('\0')) if (file) out.push({ status: 'A', file })
  return out
}

const yamlOf = (text: string | undefined): Record<string, unknown> | undefined => {
  if (text === undefined) return undefined
  try {
    const v = YAML.parse(text)
    return v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : undefined
  } catch { return undefined }
}
const headOf = (text: string | undefined) => {
  const fm = text === undefined ? null : frontMatter(text)
  return fm ? yamlOf(fm.yaml) : undefined
}
const list = (v: unknown): unknown[] => Array.isArray(v) ? v : []
const NOTE_DIR = /^(workbench\/(?:notes|calc)\/[^/]+|workbench\/topics\/[^/]+\/[^/]+)\/[^/]/
const BLOCK = /^workbench\/blocks\/[^/]+\.(?:md|tex)$/
const TASK = /^workbench\/tasks\/[^/]+\.md$/
const FLOW = /^workbench\/flow\/[^/]+\.yaml$/
const DOC = /^workbench\/(?:decisions|rules)\/[^/]+\.md$/
const noteDone = (y: Record<string, unknown> | undefined) => y?.state === 'done' || y?.done === true

/** 흐름 점에서 사람이 정하는 것: 질문 문장, 발단 선, 갈래 폐기, 사람 확인 기록 */
function flowHuman(y: Record<string, unknown> | undefined) {
  const fields = y?.fields && typeof y.fields === 'object' ? y.fields as Record<string, unknown> : {}
  const origins = list(y?.from).flatMap((e) => {
    const r = e && typeof e === 'object' ? e as Record<string, unknown> : {}
    const type = typeof r.type === 'string' ? r.type : y?.kind === 'question' ? 'origin' : 'support'
    return type === 'origin' && typeof r.id === 'string' ? [r.id] : []
  }).sort()
  const human = list(y?.evidence).flatMap((e) => list(e && typeof e === 'object' ? (e as Record<string, unknown>).checks : undefined))
    .filter((c) => c && typeof c === 'object' && (c as Record<string, unknown>).role === 'human')
    .map((c) => JSON.stringify(c))
  // 판단 기록 (10/23): 사람만 쓴다
  human.push(...list(y?.judgments).map((j) => `judgment:${JSON.stringify(j)}`))
  return { question: y?.kind === 'question' ? String(fields.question ?? '') : '', origins: origins.join(','), dropped: y?.result === 'dropped', human }
}

/** 기준 이후 바뀐 파일을 공통 규칙에 비춰 본다. git 기록이 없으면 null */
export function checkChanges(wb: Workbench, opts: { base?: string; levels?: CheckLevels } = {}): ChangeReport | null {
  const repo = wb.repo
  const base = changeBase(repo, opts.base)
  if (!base) return null
  const level = (id: ChangeCheckId): CheckLevel => opts.levels?.[id] ?? CHANGE_CHECKS[id]
  const diagnostics: ChangeDiagnostic[] = []
  const add = (check: ChangeCheckId, file: string, ko: string, en: string) => {
    const l = level(check)
    if (l !== 'off') diagnostics.push({ level: l, file, line: 1, message: t(ko, en), check })
  }
  const oldText = (file: string) => git(repo, ['show', `${base.ref}:./${file}`]) ?? undefined
  const newText = (file: string) => { try { return fs.readFileSync(path.join(repo, file), 'utf8') } catch { return undefined } }
  const top = (file: string) => file.split('/')[0]!
  const changes = changesSince(repo, base.ref)
  const other = usesStandardLayout(wb) ? new Set(folderMap(wb).other) : new Set<string>()
  const outside = new Map<string, number>()
  const removed: string[] = []
  const moved: string[] = []
  const confirmedNotes = new Set<string>()
  let flowChanged = false
  /** 바뀐 노트 · 블록 노트 (폴더 또는 파일 하나)와 그 주제 */
  const work = new Map<string, { file: string; topics: string[] }>()
  /** 바뀐 흐름 점의 주제와 가리킨 파일 (근거 · 실행) */
  const dots: { topics: string[]; files: string[] }[] = []
  const legacyBlocks = () => { try { return readTopics(wb) } catch { return [] } }
  /** 지금 흐름 전체 (판단 대기열 · 카드 상태용, 처음 쓸 때 읽는다) */
  let flowNow: { nodes: ReturnType<typeof scanFlow>['nodes']; byId: Map<string, ReturnType<typeof scanFlow>['nodes'][number]> } | undefined
  const flow = () => {
    if (!flowNow) { const nodes = scanFlow(wb).nodes; flowNow = { nodes, byId: new Map(nodes.map((n) => [n.id, n])) } }
    return flowNow
  }
  const newFindings: string[] = []

  for (const c of changes) {
    const before = c.status === 'A' ? undefined : oldText(c.from ?? c.file)
    const after = c.status === 'D' ? undefined : newText(c.file)
    const old = c.from ?? c.file

    // 원자료·보존본: 있는 파일을 고치거나 지우거나 옮기지 않는다 (새로 넣는 것은 옮기기·바깥 경고로).
    // 폴더 맨 위 README.md는 안내와 옛 경로 → 새 경로 표라 옮길 때마다 고친다 (바깥 경고만)
    if (c.status !== 'A' && (top(old) === 'sources' || top(old) === 'archive') && !/^(sources|archive)\/README\.md$/.test(old)) {
      add('frozen-folder', old, top(old) === 'sources' ? '원자료(sources/)의 있는 파일을 고치거나 지웠습니다. 되돌리세요.' : '보존본(archive/)의 있는 파일을 고치거나 지웠습니다. 되돌리세요.',
        top(old) === 'sources' ? 'An existing file in sources/ (original material) was changed or removed. Revert it.' : 'An existing file in archive/ (preserved copy) was changed or removed. Revert it.')
      continue
    }
    if (c.status !== 'A' && (headOf(before)?.locked === true || (/\.ya?ml$/.test(old) && yamlOf(before)?.locked === true))) {
      add('locked', old, '잠긴 파일(locked: true)을 고쳤습니다. 되돌리세요.', 'A locked file (locked: true) was changed. Revert it.')
      continue
    }
    if (c.status === 'D') removed.push(c.file)
    if (c.status === 'R') moved.push(`${c.from} → ${c.file}`)
    if (!c.file.startsWith('workbench/')) {
      outside.set(top(c.file), (outside.get(top(c.file)) ?? 0) + 1)
      if (c.status === 'A' && other.has(top(c.file))) add('nonstandard-new-file', c.file, `표준 밖 폴더 ${top(c.file)}/에 새 파일을 만들었습니다. 할 일·인계·제안은 workbench/tasks/, 결정은 workbench/decisions/, 규칙은 workbench/rules/에 둡니다.`,
        `A new file was created in the non-standard folder ${top(c.file)}/. Tasks, handoffs and proposals go in workbench/tasks/, decisions in workbench/decisions/, rules in workbench/rules/.`)
      continue
    }
    if (after === undefined) continue

    // 승인은 사용자만 한다
    const dir = NOTE_DIR.exec(c.file)?.[1]
    if (dir && c.file === `${dir}/note.yaml` && noteDone(yamlOf(after)) && !noteDone(yamlOf(before))) {
      add('approval', c.file, '노트를 해결(state: done)로 바꿨습니다. 해결은 사용자만 정합니다.', 'The note was marked solved (state: done). Only the user marks notes solved.')
    } else if (dir && c.status !== 'A' && !confirmedNotes.has(dir) && noteDone(yamlOf(oldText(`${dir}/note.yaml`)))) {
      confirmedNotes.add(dir)
      add('confirmed-edit', c.file, '사용자가 해결로 정한 노트를 고쳤습니다. 허락받았는지 답에 적으세요.', 'A note the user marked solved was changed. Say in your reply whether you had permission.')
    }
    if (BLOCK.test(c.file)) {
      const was = before === undefined ? undefined : parseBlock(before).meta.status
      if (parseBlock(after).meta.status === 'solved' && was !== 'solved') add('approval', c.file, '블록 노트를 해결(status: solved)로 바꿨습니다. 해결은 사용자만 정합니다.', 'The block note was marked solved (status: solved). Only the user marks notes solved.')
      else if (was === 'solved') add('confirmed-edit', c.file, '사용자가 해결로 정한 블록 노트를 고쳤습니다. 허락받았는지 답에 적으세요.', 'A block note the user marked solved was changed. Say in your reply whether you had permission.')
    }
    if (TASK.test(c.file)) {
      const a = headOf(after); const b = headOf(before)
      if (a?.state === 'done' && b?.state !== 'done') add('approval', c.file, '맡긴 일을 done으로 바꿨습니다. 승인은 사용자가 앱에서 합니다. 결과를 냈으면 state: result로 둡니다.', 'The task was set to done. The user approves in the app; leave a finished result as state: result.')
      if (list(a?.judged).length > list(b?.judged).length || list(a?.answers).length > list(b?.answers).length) add('approval', c.file, '판단·답 기록(judged · answers)을 썼습니다. 이 칸은 앱이 사용자의 선택으로만 씁니다.', 'Judgement or answer records (judged · answers) were written. Only the app writes them from the user\'s choices.')
    }
    if (dir || BLOCK.test(c.file)) {
      const key = dir ?? c.file
      if (!work.has(key)) {
        // 노트의 주제: 주제 폴더(topics/<주제>/<노트>/), note.yaml · 블록 머리말의 topics:, 옛 research.yaml topics[].blocks
        const head = dir ? yamlOf(newText(`${dir}/note.yaml`)) : headOf(after)
        const folder = /^workbench\/topics\/([^/]+)\//.exec(key)?.[1]
        const block = !dir ? path.basename(key).replace(/\.(md|tex)$/, '') : undefined
        const topics = [...(folder ? [folder] : []), ...list(head?.topics).filter((x): x is string => typeof x === 'string'), ...(block ? legacyBlocks().filter((x) => x.blocks.includes(block)).map((x) => x.id) : [])]
        work.set(key, { file: c.file, topics })
      }
    }
    if (FLOW.test(c.file) && path.basename(c.file) !== 'layout.yaml') {
      flowChanged = true
      if (c.status === 'A') add('flow-new-dot', c.file, '흐름에 새 점을 더했습니다.', 'A new dot was added to the flow.')
      // 해결 문턱 (10/20): 끝남 · 멈춤으로 넘어간 점은 앱과 같은 필수 칸을 갖춰야 한다
      const id = path.basename(c.file, '.yaml')
      const an = parseFlowNode(id, c.file, after, []), bn = before === undefined ? undefined : parseFlowNode(id, c.file, before, []) ?? undefined
      if (an) dots.push({ topics: an.topics, files: [...an.evidence.map((e) => e.file), an.run?.code, an.run?.output].filter((x): x is string => !!x) })
      const miss = an ? flowGate(an, bn) : []
      if (miss.length) add('flow-form', c.file, `점을 끝남 · 멈춤으로 바꿨는데 채울 칸이 비었습니다: ${miss.join(' · ')}. 채우거나 진행으로 되돌리세요.`, `The dot was finished or paused with empty required fields: ${miss.join(' · ')}. Fill them or set it back to active.`)
      // 시작 기록 (10/23): 에이전트가 새로 연 일(질문 · 계산 · 증명 …)은 선행 찾기와 판정 기준을 적고 시작한다. 발견은 일이 아니라 결론이라 뺀다
      if (an && c.status === 'A' && an.kind !== 'finding' && an.by && an.by !== 'user' && !an.start) add('flow-start', c.file, `시작 기록이 없는 새 점입니다. pnpm agent:start <저장소> --dot ${id} …로 가장 가까운 점(또는 왜 새로운지)과 판정 기준을 적으세요.`, `A new dot without a start record. Record the closest dot (or why it is new) and a criterion with pnpm agent:start <repo> --dot ${id} ….`)
      // 반영 검사 (10/23): 이번에 끝난 점(해결 · 반증)은 이해 문서에 반영했거나 반영하지 않은 이유가 있어야 한다. 폐기는 이유(reason)가 그 몫이다
      if (an && an.progress === 'done' && an.result !== 'dropped' && bn?.progress !== 'done') {
        if (!an.integration) add('flow-integration', c.file, `끝난 점의 반영 기록이 없습니다. 결과를 이해 문서에 반영하고 pnpm agent:integrate <저장소> ${id} --into <문서>로, 반영하지 않으면 --skip "<이유>"로 적으세요.`, `The finished dot has no integration record. Reflect the result in the understanding document and run pnpm agent:integrate <repo> ${id} --into <doc>, or --skip "<reason>".`)
      }
      if (an?.integration?.into) {
        const problem = integrationProblem(repo, id, an.integration.into, an.integration.section)
        if (problem) add('flow-integration', c.file, `반영 기록이 맞지 않습니다: ${problem}`, `The integration record no longer holds: ${problem}`)
      }
      // 판단 설계 (10/23): 에이전트의 새 명제는 대기열 상한 안에서, 새 일은 시작한 카드 아래에서만
      const agentMade = c.status === 'A' && !!an?.by && an.by !== 'user'
      if (an && agentMade && an.kind === 'finding') newFindings.push(c.file)
      if (an && agentMade && an.kind !== 'question') {
        const block = an.from.map((f) => flow().byId.get(f.id)).filter((x) => !!x).map((x) => cardBlock(x, flow().byId)).find(Boolean)
        if (block) add('card-not-started', c.file, `${block}. 시작한 카드 아래에서만 일을 엽니다. 점을 지우거나 카드가 시작될 때까지 기다리세요.`, `${block}. Open work only under a started card. Remove the dot or wait until the card starts.`)
      }
      if (an?.card && bn?.card && markJudgments(bn) === 'start' && judgmentHash(an) !== judgmentHash(bn)) {
        add('card-locked', c.file, '시작한 카드의 질문 · 완료 조건을 바꿨습니다. 잠긴 칸이라 되돌리고, 바꿀 것은 제안으로 남기세요(사용자가 수정으로 돌려보내면 고칩니다).', 'The question or done criteria of a started card changed. They are locked: revert, and leave the change as a proposal (fix it after the user sends the card back).')
      }
      const terms = an ? undefinedTerms(an) : []
      if (terms.length) add('card-terms', c.file, `카드에 정의도 출처도 없는 용어가 있습니다: ${terms.join(', ')}. 정의(def)나 출처(ref)를 적으세요.`, `The card has terms with neither a definition nor a source: ${terms.join(', ')}. Add def or ref.`)
      const a = flowHuman(yamlOf(after)); const b = flowHuman(yamlOf(before))
      if (a.human.some((h) => !b.human.includes(h))) add('approval', c.file, '사람 승인 기록(role: human)이나 판단 기록(judgments)을 썼습니다. 판단은 사람이 앱에서 합니다. 에이전트의 검토는 role: agent로 적습니다.', 'A human approval record (role: human) or a judgment (judgments) was written. People judge in the app. Record agent reviews with role: agent.')
      if (c.status !== 'A') {
        if (a.question !== b.question) add('flow-human', c.file, '질문 문장을 바꿨습니다. 사람이 정하는 칸이라 되돌리고 제안으로 남기세요.', 'The question wording was changed. A person decides it; revert and leave a proposal.')
        if (a.origins !== b.origins) add('flow-human', c.file, '발단 선(origin)을 바꿨습니다. 사람이 정하는 선이라 되돌리고 제안으로 남기세요.', 'An origin link was changed. A person decides it; revert and leave a proposal.')
      }
      if (a.dropped && !b.dropped) add('flow-human', c.file, '갈래를 폐기(result: dropped)했습니다. 폐기는 사람이 정하므로 되돌리고 제안으로 남기세요.', 'The branch was dropped (result: dropped). A person decides that; revert and leave a proposal.')
    }
    if (DOC.test(c.file) && c.status !== 'A' && headOf(before)?.status === 'accepted') {
      add('confirmed-edit', c.file, '사용자가 확정한(accepted) 결정·규칙을 고쳤습니다. 허락받았는지 답에 적으세요.', 'An accepted decision or rule was changed. Say in your reply whether you had permission.')
    }
  }

  // 점이 그 노트를 근거 · 실행으로 가리키거나 주제가 겹치면 이 일의 점으로 본다 (10/23: 무관한 점만 고쳐도 통과하던 것을 막는다).
  // 주제가 없는 노트는 주제가 없는 점과도 짝짓는다
  const covered = (key: string, w: { topics: string[] }) => dots.some((d) => d.files.some((f) => f === key || f.startsWith(`${key}/`))
    || (w.topics.length ? w.topics.some((x) => d.topics.includes(x)) : !d.topics.length))
  const skipped = [...work].filter(([key, w]) => !covered(key, w))
  if (skipped.length) {
    const names = skipped.map(([key]) => key.replace(/^workbench\//, '')).slice(0, 3).join(', ') + (skipped.length > 3 ? ' …' : '')
    if (!flowChanged) add('flow-skipped', skipped[0]![1].file, `노트 ${skipped.length}개를 바꿨는데 흐름 점은 그대로입니다 (${names}). 이 일이 질문 · 계산 · 증명 하나라면 점을 만들거나(pnpm agent:start · flow_add) 결과를 적으세요(flow_update).`, `${skipped.length} note(s) changed but no flow dot did (${names}). If this work is a question, calculation or proof, add a dot (pnpm agent:start · flow_add) or record its result (flow_update).`)
    else add('flow-skipped', skipped[0]![1].file, `노트 ${skipped.length}개를 바꿨는데 바뀐 흐름 점 가운데 그 노트를 근거로 가리키거나 같은 주제인 것이 없습니다 (${names}). 이 일의 점을 만들거나 고치세요.`, `${skipped.length} note(s) changed but no changed flow dot points to them or shares their topic (${names}). Add or update the dot for this work.`)
  }

  if (newFindings.length) {
    const queued = judgmentQueue(flow().nodes).length
    if (queued > JUDGE_CAP) add('queue-cap', newFindings[0]!, `판단 대기 명제가 ${queued}개로 상한 ${JUDGE_CAP}을 넘습니다 (새 명제 ${newFindings.length}개). 사용자가 판단할 때까지 새 명제를 내지 말고, 넘친 점은 지우거나 한 명제로 합치세요.`,
      `The judgment queue holds ${queued} findings, over the cap of ${JUDGE_CAP} (${newFindings.length} new). Add no findings until the user judges; remove the extra dots or merge them into one finding.`)
  }

  for (const [folder, n] of [...outside].sort()) {
    add('outside-workbench', `${folder}${changes.some((c) => c.file === folder) ? '' : '/'}`, `workbench/ 밖 파일 ${n}개를 바꿨습니다. 사용자가 요청하거나 허락한 것인지 답에 적으세요.`, `${n} file(s) outside workbench/ changed. Say in your reply whether the user asked for or allowed it.`)
  }
  const sample = (xs: string[]) => xs.slice(0, 3).join(', ') + (xs.length > 3 ? ` …` : '')
  if (removed.length) add('move-delete', removed[0]!, `파일 ${removed.length}개를 지웠습니다 (${sample(removed)}). 허락받았는지 답에 적으세요.`, `${removed.length} file(s) removed (${sample(removed)}). Say in your reply whether you had permission.`)
  if (moved.length) add('move-delete', moved[0]!.split(' → ')[1]!, `파일 ${moved.length}개를 옮겼습니다 (${sample(moved)}). 허락받았는지 답에 적으세요.`, `${moved.length} file(s) moved (${sample(moved)}). Say in your reply whether you had permission.`)

  const commits = base.ref === 'HEAD' ? 0 : Number(git(repo, ['rev-list', '--count', `${base.ref}..HEAD`])?.trim() ?? 0)
  return { base: base.name, commits, files: changes.length, diagnostics }
}
