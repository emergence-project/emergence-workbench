// 화면 문구 검사 (docs/design-system.md 5절 "풀어 쓴 말", 10/30): 화면 글에 풀어 쓴 말이 늘지 않게 한다.
// 용어집은 scripts/ci/wording.json. 말마다 지금 남은 수(max)보다 많아지면 실패하고, 줄었으면 max를 낮추라고 알린다.
// 보는 글: 화면 코드(.ts · .tsx)의 한국어 글자(문자열 · 템플릿 · JSX 글). 소개 본문(about/)과 data-ui 값, 주석, 테스트는 보지 않는다.
import { readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'

const ts = createRequire(new URL('../../apps/web/package.json', import.meta.url))('typescript')
const root = new URL('../../apps/web/src/', import.meta.url).pathname
const { terms } = JSON.parse(readFileSync(new URL('./wording.json', import.meta.url), 'utf8'))

/** @returns {{ where: string, text: string }[]} */
function screenTexts() {
  const files = []
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name)
      if (e.isDirectory()) { if (e.name !== 'about') walk(p) } else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) files.push(p)
    }
  }
  walk(root)
  const out = []
  for (const f of files) {
    const tree = ts.createSourceFile(f, readFileSync(f, 'utf8'), ts.ScriptTarget.Latest, true, f.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
    const add = (node, text) => {
      text = text.replace(/\s+/g, ' ').trim()
      if (/[가-힣]/.test(text)) out.push({ where: `${f.slice(root.length)}:${tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1}`, text })
    }
    const visit = (node) => {
      if (ts.isJsxAttribute(node) && /^data-ui/.test(node.name.getText(tree))) return
      if (ts.isImportDeclaration(node)) return
      if (ts.isJsxText(node) || ts.isStringLiteralLike(node)) add(node, node.text)
      else if (ts.isTemplateExpression(node)) [node.head, ...node.templateSpans.map((s) => s.literal)].forEach((part) => add(node, part.text))
      ts.forEachChild(node, visit)
    }
    visit(tree)
  }
  return out
}

const texts = screenTexts()
const problems = []
const lower = []
for (const term of terms) {
  const hits = texts.filter(({ text }) => (term.whole ? text === term.avoid : text.includes(term.avoid)))
  if (hits.length > term.max) problems.push(`"${term.avoid}" → "${term.use}" ${hits.length}곳 (남은 수 ${term.max}보다 많다)\n` + hits.map((h) => `    ${h.where}  ${h.text.slice(0, 120)}`).join('\n'))
  else if (hits.length < term.max) lower.push(`"${term.avoid}" ${term.max} → ${hits.length}`)
}
if (lower.length) console.warn(`줄었다: scripts/ci/wording.json의 max를 낮춘다 (${lower.join(' · ')})`)
if (problems.length) {
  console.error(`풀어 쓴 화면 문구 ${problems.length}가지가 늘었다. 용어집의 쓸 말로 적는다 (docs/design-system.md 5절):\n` + problems.join('\n'))
  process.exit(1)
}
const left = terms.reduce((n, t) => n + t.max, 0)
console.log(`화면 문구 검사 통과: 용어집 ${terms.length}가지${left ? `, 아직 남은 곳 ${left}` : ''}`)
