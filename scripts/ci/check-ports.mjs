// 이식 안내서와 소개의 동기화 (11/19 사용자 결정 "이식 안내서와 앱 소개가 동기화되게"): docs/ports/<이름>.md는 다른 앱의 에이전트가
// 읽고 같은 기능을 만드는 안내서다. 앱 소개(apps/web/src/about/<쪽>/<절>.tsx)는 사용자에게 보이는 동작을, 안내서는 구현을 맡는다.
// - 짝: 안내서 머리 about:에 적은 절 파일은 port: '<이름>'을 갖고, port를 가진 절은 그 안내서의 about:에 적혀 있다
// - 경로: 안내서 머리 about: · code:의 경로가 모두 있다. 목록(docs/ports/README.md)과 소개 › 단축키와 파일 위치의 「다른 앱에 옮기기」 절이 안내서를 모두 적는다
// PR마다 코드와 안내서를 맞추라는 검사는 11/27에 뺐다(규칙 점검 ports-sync): 8일 동안 커밋 234개 중 74개가 「이식 안내서: 그대로」 줄을 썼고
// 안내서로 실제 옮긴 일은 없었다. 안내서는 다른 앱에 옮길 때 그 코드와 맞춰 고친다(docs/ports/README.md).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const PORTS_DIR = 'docs/ports'
export const INDEX_SECTION = 'apps/web/src/about/reference/porting-guides.tsx'

/** 안내서 머리(--- 사이)의 about: · code: 목록 */
export function parseGuide(text) {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(text)
  if (!m) return null
  const lists = { about: [], code: [] }
  let key = null
  for (const line of (m[1] ?? '').split('\n')) {
    const head = /^(\w+):\s*$/.exec(line)
    if (head) { key = head[1] === 'about' || head[1] === 'code' ? head[1] : null; continue }
    const item = /^\s+-\s+(\S+)\s*$/.exec(line)
    if (item && key) lists[key].push(item[1])
  }
  return lists
}

/** 절 파일 글에 적힌 port 이름들 */
export const portsIn = (source) => new Set([...source.matchAll(/\bport: '([\w-]+)'/g)].map((x) => x[1]))

/**
 * 검사 결과: 문제 문장 목록 (비면 통과)
 * guides: { 이름: 안내서 글 }, sections: { 절 파일: 글 }(소개의 모든 절 파일), exists(경로), index: README 글, indexSection: 소개 목록 절 글,
 * @param {{ guides: Record<string, string>, sections: Record<string, string>, exists: (p: string) => boolean, index: string, indexSection: string, files?: string[] }} input
 */
export function checkPorts({ guides, sections, exists, index, indexSection }) {
  const problems = []
  const parsed = {}
  for (const [name, text] of Object.entries(guides)) {
    const g = parseGuide(text)
    if (!g || !g.about.length || !g.code.length) { problems.push(`${PORTS_DIR}/${name}.md 머리에 about:(소개 절 파일)과 code:(구현 파일) 목록이 없습니다 (--- 사이, 줄마다 "  - 경로").`); continue }
    parsed[name] = g
    for (const p of [...g.about, ...g.code]) if (!exists(p)) problems.push(`${PORTS_DIR}/${name}.md에 적힌 ${p}이 없습니다. 옮겼으면 안내서의 경로를 고치세요.`)
    for (const p of g.about) if (exists(p) && !portsIn(sections[p] ?? '').has(name)) problems.push(`${p}에 port: '${name}'이 없습니다. 이 절의 ko와 en에 port: '${name}'을 더하세요 (${PORTS_DIR}/${name}.md가 이 절을 가리킴).`)
    if (!index.includes(`(${name}.md)`)) problems.push(`${PORTS_DIR}/README.md 목록에 ${name}.md가 없습니다.`)
    if (!indexSection.includes(`'${name}'`)) problems.push(`소개 «다른 앱에 옮기기» 절(${INDEX_SECTION})에 '${name}'이 없습니다.`)
  }
  for (const [file, source] of Object.entries(sections)) {
    for (const name of portsIn(source)) {
      if (!(name in guides)) problems.push(`${file}의 port: '${name}'에 맞는 안내서 ${PORTS_DIR}/${name}.md가 없습니다.`)
      else if (parsed[name] && !parsed[name].about.includes(file)) problems.push(`${file}에 port: '${name}'이 있는데 ${PORTS_DIR}/${name}.md 머리 about:에 이 파일이 없습니다.`)
    }
  }
  return problems
}

/** 소개의 절 파일들: { 경로: 글 } */
const sectionFiles = (dir) => Object.fromEntries(fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const p = `${dir}/${e.name}`
  return e.isDirectory() ? Object.entries(sectionFiles(p)) : /\.tsx?$/.test(e.name) ? [[p, fs.readFileSync(p, 'utf8')]] : []
}))

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
  process.chdir(root)
  const read = (p) => fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : ''
  const guides = Object.fromEntries(fs.readdirSync(PORTS_DIR).filter((f) => f.endsWith('.md') && f !== 'README.md')
    .map((f) => [f.replace(/\.md$/, ''), read(`${PORTS_DIR}/${f}`)]))
  const problems = checkPorts({
    guides, sections: sectionFiles('apps/web/src/about'), exists: (p) => fs.existsSync(p),
    index: read(`${PORTS_DIR}/README.md`), indexSection: read(INDEX_SECTION),
  })
  if (problems.length) { console.error(problems.map((p) => `✗ ${p}`).join('\n')); process.exit(1) }
  console.log(`이식 안내서 검사 통과 (안내서 ${Object.keys(guides).length}개)`)
}
