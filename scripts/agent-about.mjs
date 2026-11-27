// pnpm agent:about [<절 키 · 쪽 · 파일 경로>] [--tool <MCP 도구>] [--en] — 앱 소개(앱의 정본)에서 에이전트가 읽을 절을 보인다.
// 물음이 없으면 절마다 한 줄(키 · 제목 — 요약). 절 키(project/edits) · 쪽(project) · 파일 경로(그 파일을 구현으로 적은 절) · --tool(그 도구를 쓰는 절)이면 전문.
// MCP about · GET /api/about/guide와 같은 계산(packages/core/src/about-guide.ts). 앱 · 서버 없이 돈다. 아무것도 쓰지 않는다.
// .md로 옮긴 절만 나온다(옮기는 중, apps/web/src/about/<쪽>/<절>.md).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { tsxApi } from './ci/tsx-api.mjs'

const args = process.argv.slice(2)
const val = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined }
const taken = new Set(['--tool'].flatMap((n) => { const i = args.indexOf(n); return i >= 0 ? [i, i + 1] : [] }))
const given = args.filter((a, i) => !a.startsWith('--') && !taken.has(i))
if (given.length > 1 || args.includes('--help')) {
  console.error('사용법: pnpm agent:about [<절 키 · 쪽 · 파일 경로>] [--tool <MCP 도구>] [--en]')
  process.exit(1)
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const { tsImport } = await tsxApi()
const opts = { parentURL: import.meta.url, tsconfig: false }
const { readAboutEntries } = await tsImport('../apps/server/src/aboutGuide.ts', opts)
const { aboutFind, aboutListLine, aboutText } = await tsImport('../packages/core/src/about-guide.ts', opts)

const lang = args.includes('--en') ? 'en' : 'ko'
const { entries, errors } = readAboutEntries(root)
for (const e of errors) console.error(`읽지 못한 절: ${e}`)
const tool = val('--tool')
const arg = given[0]
if (!arg && !tool) {
  for (const e of entries) console.log(aboutListLine(e, lang))
  console.log(`\n${entries.length}절. 전문: pnpm agent:about <절 키 · 파일 경로> (아직 .md로 옮기지 않은 쪽은 앱의 소개 화면에서 본다)`)
  process.exit(0)
}
// 파일 경로는 앱 저장소 기준으로 (다른 폴더에서 불러도)
const asFile = (s) => {
  const abs = path.resolve(process.env.INIT_CWD ?? process.cwd(), s)
  return fs.existsSync(abs) && abs.startsWith(root + path.sep) ? path.relative(root, abs).split(path.sep).join('/') : s
}
let hit = arg ? aboutFind(entries, { section: arg }) : []
if (arg && !hit.length) hit = aboutFind(entries, { file: asFile(arg) })
if (tool) hit = aboutFind(arg ? hit : entries, { tool })
if (!hit.length) { console.log('맞는 소개 절이 없습니다. 물음 없이 불러 목록을 보세요.'); process.exit(0) }
console.log(hit.map((e) => aboutText(e, { lang, full: true })).join('\n\n'))
