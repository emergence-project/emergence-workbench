// pnpm agent:records <연구 저장소 폴더> — 그 프로젝트의 기록(메모 · 할 일 · 질문 · 지시)을 한 줄씩 보인다. MCP list_records와 같은 계산.
// --unanswered 에이전트가 답하거나 할 차례 · --replied 사용자가 답한 에이전트 질문 · --unsorted 분류 전 기록
// --kind <종류> · --target <대상 또는 note- 같은 앞부분> · --full 본문과 답 전부(JSON)
// 앱·서버 없이 돈다(클라우드 에이전트용). 아무것도 쓰지 않는다. 답은 pnpm agent:answer로 쓴다.
import fs from 'node:fs'
import path from 'node:path'
import { tsxApi } from './ci/tsx-api.mjs'

const args = process.argv.slice(2)
const flag = (n) => args.includes(n)
const val = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined }
const taken = new Set(['--kind', '--target'].flatMap((n) => { const i = args.indexOf(n); return i >= 0 ? [i, i + 1] : [] }))
const given = args.filter((a, i) => !a.startsWith('--') && !taken.has(i))
if (given.length !== 1) {
  console.error([
    '사용법: pnpm agent:records <연구 저장소 폴더> [--unanswered | --replied | --unsorted] [--kind <종류>] [--target <대상>] [--full]',
    '  --unanswered  사용자가 남긴, 답하거나 할 질문 · 지시',
    '  --replied     에이전트가 물은 질문에 사용자가 답한 것 (반영한 뒤 agent:answer로 닫는다)',
    '  --unsorted    종류를 아직 정하지 않은(자동) 기록',
  ].join('\n'))
  process.exit(1)
}
const dir = path.resolve(process.env.INIT_CWD ?? process.cwd(), given[0])
const root = path.basename(dir) === 'workbench' ? dir : path.join(dir, 'workbench')
if (!fs.existsSync(path.join(root, 'research.yaml'))) { console.error(`연구 작업대 폴더가 아닙니다 (research.yaml 없음): ${dir}`); process.exit(1) }

const { tsImport } = await tsxApi()
const opts = { parentURL: import.meta.url, tsconfig: false }
const { Workbench } = await tsImport('../apps/server/src/workbench.ts', opts)
const { listRecords } = await tsImport('../apps/server/src/comments.ts', opts)
const { recordRows } = await tsImport('../apps/server/src/recordRows.ts', opts)

const wb = new Workbench(root)
const filter = { kind: val('--kind'), target: val('--target'), unanswered: flag('--unanswered'), replied: flag('--replied'), unsorted: flag('--unsorted'), full: flag('--full') }
const rows = recordRows(listRecords(root, wb.readResearch().title), filter)
if (filter.full) { process.stdout.write(`${JSON.stringify(rows)}\n`); process.exit(0) }
if (!rows.length) { console.log('해당하는 기록이 없습니다.'); process.exit(0) }
const line = (s) => String(s).split('\n')[0]
for (const r of rows) {
  const head = [r.target, r.id, r.kind, r.state ?? '', r.by ? `by ${r.by}` : '', r.unsorted ? '분류 전' : ''].filter(Boolean).join(' · ')
  console.log(`- ${head} — ${line(r.body)}`)
  if (r.quote) console.log(`  > ${line(r.quote)}`)
  if (r.lastAnswer) console.log(`  답 ${r.answerCount} · 마지막 ${r.lastAnswer.by}: ${line(r.lastAnswer.body)}`)
}
console.log(`\n${rows.length}개. 본문 전부: --full · 답 쓰기: pnpm agent:answer ${given[0]} <대상> <id> "<답>"`)
