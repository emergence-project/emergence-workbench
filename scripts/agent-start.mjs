// pnpm agent:start <연구 저장소 폴더> … — 일을 시작하기 전에 지난 점을 찾고, 시작 기록(가장 가까운 점 또는 왜 새로운지, 판정 기준)을 적어 점을 진행으로 연다.
// 계산뿐 아니라 방향 제안 · 논문 평가 · 외부 LLM 의뢰도 이 문을 거친다 (docs/repo-format.md §14 "시작 기록", 10/23).
// 앱·서버 없이 돈다(클라우드 에이전트용). 쓴 뒤에는 그 저장소에 커밋해 main에 먼저 올린다(맡았음을 알린다).
import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { tsxApi } from './ci/tsx-api.mjs'

const FIELDS = ['question', 'motivation', 'guess', 'goal', 'setup', 'assumptions', 'method', 'statement', 'condition', 'reading']
const usage = [
  '사용법: pnpm agent:start <연구 저장소 폴더> --search "<글>"                 (찾기만, 쓰지 않음)',
  '        pnpm agent:start <연구 저장소 폴더> --kind <종류> --short "<짧은 제목>" [설명 칸] --criterion "<판정 기준>"',
  '                         (--prior <점,점> --adds "<이번에 더할 것>" | --novel "<왜 새로운지>")',
  '        pnpm agent:start <연구 저장소 폴더> --dot <점 id> …                   (있는 점에 시작 기록)',
  '  종류: question · finding · calc · analytic · proof · literature',
  `  설명 칸: ${FIELDS.map((f) => `--${f}`).join(' ')} (또는 --field 이름=값)`,
  '  그 밖: --title · --topic <주제>(여럿) · --from <점>[:origin|support|refute|use](여럿) · --task <맡긴 일> · --stop "<멈출 조건>" · --query "<찾을 글>" · --late(사후 기록) · --by <이름, 기본 claude>',
].join('\n')

let parsed
try {
  parsed = parseArgs({
    allowPositionals: true,
    options: {
      search: { type: 'string' }, dot: { type: 'string' }, kind: { type: 'string' }, short: { type: 'string' }, title: { type: 'string' },
      topic: { type: 'string', multiple: true }, from: { type: 'string', multiple: true }, task: { type: 'string' },
      field: { type: 'string', multiple: true }, criterion: { type: 'string' }, stop: { type: 'string' },
      prior: { type: 'string', multiple: true }, adds: { type: 'string' }, novel: { type: 'string' }, query: { type: 'string' },
      late: { type: 'boolean' }, by: { type: 'string', default: 'claude' },
      ...Object.fromEntries(FIELDS.map((f) => [f, { type: 'string' }])),
    },
  })
} catch (e) { console.error(`${e.message}\n${usage}`); process.exit(1) }
const { values: v, positionals } = parsed
if (positionals.length !== 1) { console.error(usage); process.exit(1) }
const dir = path.resolve(process.env.INIT_CWD ?? process.cwd(), /** @type {string} */ (positionals[0]))
const root = path.basename(dir) === 'workbench' ? dir : path.join(dir, 'workbench')
if (!fs.existsSync(path.join(root, 'research.yaml'))) { console.error(`연구 작업대 폴더가 아닙니다 (research.yaml 없음): ${root}`); process.exit(1) }
process.env.RW_LANG ??= 'ko'

const { tsImport } = await tsxApi()
const opts = { parentURL: import.meta.url, tsconfig: false }
const { Workbench } = await tsImport('../apps/server/src/workbench.ts', opts)
const { priorSearch, startFlow } = await tsImport('../apps/server/src/flowStart.ts', opts)
const wb = new Workbench(root)

const show = (rows) => {
  if (!rows.length) { console.log('선행 찾기: 걸린 점 없음'); return }
  console.log(`선행 찾기: ${rows.length}개 (많이 걸린 것부터)`)
  for (const r of rows) console.log(`  ${r.id} · ${r.kind} · ${r.state}${r.date ? ` · ${r.date}` : ''} — ${r.title}${r.result ? `\n      결과: ${r.result}` : ''}${r.reason ? `\n      이유: ${r.reason}` : ''}`)
}

if (v.search !== undefined) {
  show(priorSearch(wb, v.search))
  process.exit(0)
}
const fields = Object.fromEntries([
  ...FIELDS.filter((f) => v[f] !== undefined).map((f) => [f, v[f]]),
  ...(v.field ?? []).map((x) => { const i = x.indexOf('='); return i > 0 ? [x.slice(0, i).trim(), x.slice(i + 1)] : [x, ''] }),
].filter(([k, x]) => k && x?.trim()))
const from = (v.from ?? []).map((x) => { const [id = '', type] = x.split(':'); return { id: id.trim(), type: type?.trim() || 'support' } })
try {
  const { node, hits } = startFlow(wb, {
    dot: v.dot, kind: v.kind, short: v.short, title: v.title, topics: v.topic, from, task: v.task, fields,
    criterion: v.criterion, stop: v.stop, prior: (v.prior ?? []).flatMap((x) => x.split(',')), adds: v.adds, novel: v.novel,
    query: v.query, late: v.late, by: v.by,
  })
  show(hits)
  console.log(`시작 기록을 썼습니다${node.start?.late ? ' (사후)' : ''}: ${node.file} · ${node.progress}`)
} catch (e) {
  if (e.status === 400 && !v.dot) show(priorSearch(wb, [v.query, v.short, v.title, fields.question, fields.goal, fields.statement].filter(Boolean).join(' ')))
  else if (e.status === 400 && v.dot) show(priorSearch(wb, v.query ?? v.dot, v.dot))
  console.error(e.message)
  process.exit(1)
}
