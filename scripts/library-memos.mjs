// pnpm library:memos <지식 라이브러리 폴더> [--apply] — 개념노트 메모(concepts/<id>.memo.md)를 기록 카드로 옮긴다 (10/18 결정).
// 처음에는 미리보기만 한다(무엇이 몇 장의 카드가 될지). --apply면 <라이브러리>/workbench/comments/concept-<id>.md에 쓰고
// 원래 메모 파일을 <라이브러리>/workbench/.trash/concept-memos/로 옮긴다. 커밋은 하지 않는다(바뀐 것을 보고 올린다).
// --apply는 라이브러리가 main 브랜치이고 바뀐 파일이 없을 때만 한다.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { tsxApi } from './ci/tsx-api.mjs'

const args = process.argv.slice(2)
const apply = args.includes('--apply')
const given = args.filter((a) => !a.startsWith('--'))
if (given.length !== 1) { console.error('사용법: pnpm library:memos <지식 라이브러리 폴더> [--apply]'); process.exit(1) }
const lib = path.resolve(process.env.INIT_CWD ?? process.cwd(), /** @type {string} */ (given[0]))
if (!fs.existsSync(path.join(lib, 'concepts'))) { console.error(`지식 라이브러리가 아닙니다 (concepts/ 없음): ${lib}`); process.exit(1) }

const { tsImport } = await tsxApi()
const { planMemoMigration, applyMemoMigration } = await tsImport('../apps/server/src/conceptMemoMigrate.ts', { parentURL: import.meta.url, tsconfig: false })
const plans = planMemoMigration(lib)
if (!plans.length) { console.log('옮길 메모 파일이 없습니다.'); process.exit(0) }

const count = (p, pick) => p.cards.filter(pick).length
for (const p of plans) {
  const todo = count(p, (c) => c.input.kind === '할 일' && !c.done), done = count(p, (c) => c.input.kind === '할 일' && c.done)
  const memo = count(p, (c) => c.input.kind === '메모'), hl = count(p, (c) => c.input.kind === '하이라이트')
  console.log(`${p.memo} → ${p.target}.md: 할 일 ${todo} · 완료 ${done} · 메모 ${memo}${hl ? ` · 하이라이트 ${hl}` : ''}`)
}
const total = plans.reduce((n, p) => n + p.cards.length, 0)
console.log(`\n메모 파일 ${plans.length}개 → 기록 카드 ${total}장`)
if (!apply) { console.log('미리보기입니다. 옮기려면 --apply를 붙입니다.'); process.exit(0) }

const git = (...a) => execFileSync('git', ['-C', lib, ...a], { encoding: 'utf8' }).trim()
if (git('branch', '--show-current') !== 'main') { console.error('라이브러리가 main 브랜치가 아닙니다. main에서 옮깁니다.'); process.exit(1) }
if (git('status', '--porcelain')) { console.error('라이브러리에 바뀐 파일이 있습니다. 먼저 올리거나 정리합니다.'); process.exit(1) }
const r = applyMemoMigration(lib, plans)
console.log(`옮겼습니다: 메모 파일 ${r.files}개 → 카드 ${r.cards}장. 원래 파일은 workbench/.trash/concept-memos/에 있습니다. git status로 확인하고 올립니다.`)
