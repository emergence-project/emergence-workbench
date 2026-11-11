// pnpm agent:problem <연구 저장소 폴더> [명령 …] — 흐름과 시도 나무를 서버 없이 읽고 쓴다 (docs/repo-format.md §16).
// MCP의 problems · problem_brief · problem_read · problem_propose · problem_prepare · attempt_add · attempt_start · attempt_report · attempt_verdict · direction_report와
// 같은 함수(apps/server/src/problems.ts)를 부르므로 규칙이 같다: 사용자가 시작한 흐름에서만 일하고, 자기 시도는 판정하지 못하며, 한도 · 정체에서는 시작을 거절한다.
// 이 명령은 언제나 에이전트 이름으로 쓴다(--by, 기본 claude). 흐름 시작 · 종료 · 메시지 · 독자 · 한도 · 결정은 사용자가 앱에서 한다.
// 앱·서버 없이 돈다(클라우드 에이전트용). 쓴 뒤에는 그 저장소에 커밋해 올린다(맥의 앱이 받아 화면에 보인다).
import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { tsxApi } from './ci/tsx-api.mjs'

const usage = [
  '사용법: pnpm agent:problem <연구 저장소 폴더>                                   (흐름 목록)',
  '        pnpm agent:problem <폴더> brief <흐름>                                  (이어받기 요약, 먼저 읽는다)',
  '        pnpm agent:problem <폴더> read <흐름> [시도]                            (모든 칸)',
  '        pnpm agent:problem <폴더> propose "<질문>" --source "<출처>"            (제안만. 시작은 사용자가)',
  '        pnpm agent:problem <폴더> prepare <흐름> [--literature "<키>: <사실 한 줄>"]… [--first-test "…"] [--grading "…"]',
  '        pnpm agent:problem <폴더> add <흐름> "<방법>"… [--under <시도>] [--needs-all]   (후보 늘어놓기)',
  '        pnpm agent:problem <폴더> start <흐름> [시도]                           (시도가 없으면 다음 후보)',
  '        pnpm agent:problem <폴더> report <흐름> <시도> --did "…" --result "…" [--file <경로>]… [--lesson "…"] [--reopen "…"]',
  '        pnpm agent:problem <폴더> verdict <흐름> <시도> holds|dropped --note "…" [--check "…"] [--lesson "…"] [--reopen "…"]',
  '        pnpm agent:problem <폴더> direction <흐름> [--for-yes "…"] [--for-no "…"] [--neither "…"]   (방향 보고: 사실만)',
  '  공통: --by <에이전트 이름, 기본 claude>',
].join('\n')
/** @type {(m: string) => never} */
const fail = (m) => { console.error(m); process.exit(1) }

function args() {
  try {
    return parseArgs({
      allowPositionals: true,
      options: {
        by: { type: 'string', default: 'claude' }, source: { type: 'string' },
        literature: { type: 'string', multiple: true }, 'first-test': { type: 'string' }, grading: { type: 'string' },
        under: { type: 'string' }, 'needs-all': { type: 'boolean' },
        did: { type: 'string' }, result: { type: 'string' }, file: { type: 'string', multiple: true }, lesson: { type: 'string' }, reopen: { type: 'string' },
        note: { type: 'string' }, check: { type: 'string' },
        'for-yes': { type: 'string' }, 'for-no': { type: 'string' }, neither: { type: 'string' },
      },
    })
  } catch (e) { console.error(`${e instanceof Error ? e.message : e}\n${usage}`); process.exit(1) }
}
const { values: v, positionals } = args()
const [repo, cmd = 'list', ...rest] = positionals
if (!repo) fail(usage)
const by = v.by?.trim()
if (!by || by === 'user') fail('--by에는 에이전트 이름을 적습니다. 사용자가 하는 일(흐름 시작 · 종료 · 결정)은 앱에서 합니다.')
const dir = path.resolve(process.env.INIT_CWD ?? process.cwd(), repo)
const root = path.basename(dir) === 'workbench' ? dir : path.join(dir, 'workbench')
if (!fs.existsSync(path.join(root, 'research.yaml'))) fail(`연구 작업대 폴더가 아닙니다 (research.yaml 없음): ${root}`)
process.env.RW_LANG ??= 'ko'

const { tsImport } = await tsxApi()
const opts = { parentURL: import.meta.url, tsconfig: false }
const { Workbench } = await tsImport('../apps/server/src/workbench.ts', opts)
const P = await tsImport('../apps/server/src/problems.ts', opts)
const { briefOf } = await tsImport('../apps/server/src/problemBrief.ts', opts)
const wb = new Workbench(root)

const STATE = { proposed: '제안', draft: '쓰는 중', open: '진행', closed: '종료' }
const ASTATE = { candidate: '후보', active: '진행', reported: '판정 대기', holds: '성립', dropped: '폐기' }
const STOP = {
  decision: '방향 보고가 사용자의 결정을 기다립니다. 새 시도를 시작하지 않습니다.',
  limit: '시도 한도에 닿았습니다. 방향 보고를 내고 섭니다 (direction).',
  stuck: '폐기가 이어졌습니다. 방향 보고를 내고 섭니다 (direction).',
  exhausted: '남은 후보가 없습니다. 후보를 더 늘어놓거나(add) 방향 보고를 냅니다 (direction).',
}
/** 쓴 뒤에 붙이는 지금 상태 한 줄 */
const now = (p) => [
  `시도 ${p.used}/${p.limit}.`,
  ...(p.attempts.some((a) => a.state === 'reported') ? [`판정 대기: ${p.attempts.filter((a) => a.state === 'reported').map((a) => a.label).join(', ')}.`] : []),
  p.stop ? `멈춤: ${STOP[p.stop]}` : p.next ? `다음: ${p.next.label} ${p.next.method}` : '',
].filter(Boolean).join(' ')
const need = (x, what) => x ?? fail(`${what}이(가) 빠졌습니다.\n${usage}`)
const aidOf = (s) => String(s).toLowerCase()

try {
  if (cmd === 'list') {
    const { problems, diagnostics } = P.scanProblems(wb)
    if (!problems.length) console.log('흐름이 없습니다. 일하다 떠오른 질문은 propose로 제안합니다(시작은 사용자가 합니다).')
    for (const p of problems) {
      const c = p.counts
      const tail = p.state !== 'open' ? (p.source ? ` · 출처 ${p.source}` : '')
        : ` · 시도 ${p.used}/${p.limit} · 성립 ${c.holds} · 폐기 ${c.dropped}${c.reported ? ` · 판정 대기 ${c.reported}` : ''} · ${p.stop ? `멈춤(${p.stop})` : p.next ? `다음 ${p.next.label}` : '다음 후보 없음'}`
      console.log(`${p.id} · ${STATE[p.state]} — ${p.question}${tail}`)
    }
    for (const d of diagnostics) console.log(`읽지 못함: ${d.file}: ${d.message}`)
  } else if (cmd === 'brief') {
    console.log(briefOf(P.readProblem(wb, need(rest[0], '흐름 id'))))
  } else if (cmd === 'read') {
    const p = P.readProblem(wb, need(rest[0], '흐름 id'))
    if (!rest[1]) console.log(JSON.stringify(p, null, 1))
    else console.log(JSON.stringify(p.attempts.find((a) => a.id === aidOf(rest[1])) ?? fail(`시도 ${rest[1]}이(가) 없습니다. 있는 시도: ${p.attempts.map((a) => a.id).join(', ') || '없음'}`), null, 1))
  } else if (cmd === 'propose') {
    const p = P.createProblem(wb, { question: need(rest[0], '질문'), source: need(v.source, '--source (어디서 나온 질문인가)') }, by)
    console.log(`제안했습니다: workbench/problems/${p.id}/problem.yaml. 사용자가 메시지를 쓰고 시작하기 전에는 이 흐름에서 일하지 않습니다.`)
  } else if (cmd === 'prepare') {
    const p = P.readProblem(wb, need(rest[0], '흐름 id'))
    const added = (v.literature ?? []).map((x) => { const i = x.indexOf(':'); return i > 0 ? { ref: x.slice(0, i).trim(), fact: x.slice(i + 1).trim() } : fail(`--literature는 "<키>: <사실 한 줄>" 꼴입니다: ${x}`) })
    const rows = added.length ? [...p.literature.map(({ ref, fact }) => ({ ref, fact })), ...added.filter((x) => !p.literature.some((y) => y.ref === x.ref && y.fact === x.fact))] : undefined
    const set = { ...(rows && { literature: rows }), ...(v['first-test'] !== undefined && { first_test: v['first-test'] }), ...(v.grading !== undefined && { grading: v.grading }) }
    if (!Object.keys(set).length) fail('바꿀 것이 없습니다: --literature · --first-test · --grading 가운데 하나를 줍니다.')
    const q = P.patchProblem(wb, p.id, { baseHash: p.hash, set }, by)
    console.log(`적었습니다 (${STATE[q.state]}): ${Object.keys(set).join(', ')}`)
  } else if (cmd === 'add') {
    const [id, ...methods] = rest
    if (!methods.length) fail(`후보의 방법을 한 줄씩 줍니다.\n${usage}`)
    const had = new Set(P.readProblem(wb, need(id, '흐름 id')).attempts.map((a) => a.id))
    const p = P.addAttempts(wb, id, { attempts: methods.map((method) => ({ method, ...(v.under && { parent: aidOf(v.under) }), ...(v['needs-all'] && { needs: 'all' }) })) }, by)
    console.log(`후보를 더했습니다: ${p.attempts.filter((a) => !had.has(a.id)).map((a) => `${a.label} ${a.method}`).join(' · ')}. ${now(p)}`)
  } else if (cmd === 'start') {
    const id = need(rest[0], '흐름 id')
    const cur = P.readProblem(wb, id)
    const aid = rest[1] ? aidOf(rest[1]) : cur.next?.id ?? fail(`시작할 후보가 없습니다. ${now(cur)}`)
    const p = P.startAttempt(wb, id, aid, by)
    const a = p.attempts.find((x) => x.id === aid)
    console.log(`시작했습니다: ${a.label} ${a.method} (${by}). 끝나면 report로 보고합니다. ${now(p)}`)
  } else if (cmd === 'report') {
    const [id, aid] = rest
    const p = P.reportAttempt(wb, need(id, '흐름 id'), aidOf(need(aid, '시도 id')), {
      did: need(v.did, '--did (한 일)'), result: need(v.result, '--result (결과, 사실로)'),
      ...(v.file?.length && { files: v.file }), ...(v.lesson && { lesson: v.lesson }), ...(v.reopen && { reopen: v.reopen }),
    }, by)
    console.log(`보고했습니다: ${aidOf(aid).toUpperCase()}. 성립 · 폐기는 일한 쪽이 아닌 쪽이 정합니다. ${now(p)}`)
  } else if (cmd === 'verdict') {
    const [id, aid, result] = rest
    if (result !== 'holds' && result !== 'dropped') fail(`판정은 holds(성립) 또는 dropped(폐기)입니다.\n${usage}`)
    const p = P.verdictAttempt(wb, need(id, '흐름 id'), aidOf(need(aid, '시도 id')), {
      result, note: need(v.note, '--note (무엇을 다시 돌리거나 읽었고 무엇이 나왔나)'),
      ...(v.check && { check: v.check }), ...(v.lesson && { lesson: v.lesson }), ...(v.reopen && { reopen: v.reopen }),
    }, by)
    console.log(`판정했습니다: ${aidOf(aid).toUpperCase()} ${ASTATE[result]}. ${now(p)}`)
  } else if (cmd === 'direction') {
    const p = P.directionReport(wb, need(rest[0], '흐름 id'), {
      ...(v['for-yes'] && { for_yes: v['for-yes'] }), ...(v['for-no'] && { for_no: v['for-no'] }), ...(v.neither && { neither: v.neither }),
    }, by)
    console.log(`방향 보고를 냈습니다. 사용자가 계속 · 좁히기 · 종료를 정할 때까지 이 흐름에서 새 시도를 시작하지 않습니다. ${now(p)}`)
  } else fail(`모르는 명령: ${cmd}\n${usage}`)
} catch (e) {
  fail(e.message)
}
