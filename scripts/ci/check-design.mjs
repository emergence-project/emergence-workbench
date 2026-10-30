// 화면 기준 검사: 화면 스타일이 tokens.css의 값만 쓰는지 본다 (docs/design-system.md "지키는 장치").
// 어기면 줄 번호와 함께 실패한다. 꼭 필요한 예외는 그 줄에 `/* 디자인 예외: 이유 */`를 적는다.
import { readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'

// Reuse the web app's TypeScript dependency to distinguish labels from source metadata.
const ts = createRequire(new URL('../../apps/web/package.json', import.meta.url))('typescript')

const root = new URL('../../apps/web/src/', import.meta.url).pathname
/** @type {[RegExp, string][]} */
const RULES = [
  [/#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(/, '색은 tokens.css의 변수로 (새 색은 라이트·다크 둘 다 더한다)'],
  [/font-size:\s*[0-9.]+px|calc\([0-9.]+px \* var\(--ui-scale/, '글자 크기는 --fs-* 로'],
  [/font-weight:\s*\d/, '글자 굵기는 --fw-* 로'],
  [/border-radius:[^;}]*\b(?:[4-9]|\d{2,})px/, '모서리는 --r-* 로 (3px 이하 작은 표시는 예외)'],
  [/z-index:\s*\d{2,}/, '겹침 순서 10 이상은 --z-* 로 (부품 안의 1–9는 숫자)'],
  [/\b(?:padding|margin|gap|row-gap|column-gap)(?:-[a-z]+)?\s*:[^;}]*(?<![\w.-])(?:4|8|12|16|24|32)px\b/, '간격 4·8·12·16·24·32px는 --sp-1…6 으로'],
]

const files = []
const walk = (dir) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) walk(p)
    else if (e.name.endsWith('.css') && e.name !== 'tokens.css') files.push(p)
  }
}
walk(root)

const problems = []
for (const f of files) {
  readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
    if (line.includes('디자인 예외:')) return
    const code = line.replace(/\/\*.*?\*\//g, '')
    for (const [re, why] of RULES) if (re.test(code)) problems.push(`${f.slice(root.length)}:${i + 1}  ${why}\n    ${line.trim().slice(0, 140)}`)
  })
}

// 화면 코드(.ts · .tsx)의 색 글자: '#4338ca' 같은 값은 tokens.css의 변수로 (스타일 파일과 같은 규칙)
const COLOR_LITERAL = /['"`]#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?(?:[0-9a-fA-F]{2})?['"`]/
const code = []
const walkCode = (dir) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) walkCode(p)
    else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) code.push(p)
  }
}
walkCode(root)
for (const f of code) readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
  if (!line.includes('디자인 예외:') && COLOR_LITERAL.test(line)) problems.push(`${f.slice(root.length)}:${i + 1}  색은 tokens.css의 변수로 (var(--…))\n    ${line.trim().slice(0, 140)}`)
})

// 다크 값은 tokens.css의 두 곳(시스템 다크 · data-theme="dark")에 같은 내용으로 있어야 한다
{
  const tokens = readFileSync(join(root, 'tokens.css'), 'utf8')
  const block = (start) => { const i = tokens.indexOf(start); if (i < 0) return null; const open = tokens.indexOf('{', i); return tokens.slice(open + 1, tokens.indexOf('}', open)).replace(/\/\*[^]*?\*\//g, '').replace(/\s+/g, ' ').trim() }
  const system = block(':root:not([data-theme="light"]) {'), chosen = block(':root[data-theme="dark"] {')
  if (!system || !chosen || system !== chosen) problems.push('tokens.css  다크 값 두 곳(prefers-color-scheme · data-theme="dark")이 다르다. 함께 고친다')
}

// 기호와 행동 말 (docs/design-system.md "기호와 행동"): 화면 코드(.tsx)에서 한 행동에 다른 이름·기호를 쓰지 않는다.
// 버튼 줄(<button … 이 있는 줄)의 글자와 title·aria-label만 본다. 설명 글·주석은 보지 않는다.
/** @type {[RegExp, string][]} */
const WORDS = [
  // 10/30 사용자 결정 "행동 이름까지 한자어로": 고치기·지우기·더하기·빼기 → 수정·삭제·추가·제거 (10/3 결정을 바꿈)
  [/(?<![가-힣])지우기/, '삭제'], [/(?<![가-힣])빼기/, '제거'], [/(?<![가-힣])더하기/, '추가'], [/(?<![가-힣])고치기|편집하기|편집 버튼|>편집</, '수정'], [/수정하기/, '수정'], [/그만두기/, '취소'],
  // 10/5 시안: 양쪽 칸 이름은 "왼쪽 사이드바"·"오른쪽 사이드바" (data-ui 값 "맥락 칸 …"은 이전 피드백과 맞추려 그대로)
  [/(?<!data-ui=")맥락 칸/, '오른쪽 사이드바'],
]
/** @type {[RegExp, string][]} */
const OLD_TERMS = [
  [/보조 노트/, '노트'], [/왼쪽 띠/, '레일'], [/제목줄/, '상단바'], [/거르기/, '필터'], [/형광펜/, '하이라이트'],
  [/이름표/, '태그(툴팁이면 툴팁)'], [/입력칸/, '입력란'], [/도구 줄|도구 막대|머리줄/, '툴바'], [/탭 줄/, '탭 바'], [/작업 칸|지금 칸|다른 칸|옆 칸/, '패널'], [/오른쪽 칸|맥락 칸/, '오른쪽 사이드바'], [/반려/, '수정'], [/다 고침/, '편집 완료'],
]
/** @type {[RegExp, string][]} */
const GLYPHS = [
  [/✕|✖/, '지우기는 휴지통(Icon.trash), 빼기·닫기는 ×'],
  [/↻/, '컴파일은 ▶(Icon.play)'],
  [/<button[^]*>\s*✎/, '고치기 버튼은 연필(Icon.pencil). ✎ 글자는 "고침" 기록 표시에만'],
  [/[★☆]/, '즐겨찾기는 StarIcon(marks.tsx). 글자 ★ ☆는 글꼴마다 굵기가 달라 화면에 쓰지 않는다 (10/16)'],
  [/[●⏸◆]|■(?!\])/, '상태는 글자 기호 대신 색 점 <StatusDot s=… />으로 (10/4: 진행·멈춤·폐기·해결). 결과는 ✓ 성공, ! 오류'],
]
const tsx = []
const walkTsx = (dir) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) walkTsx(p)
    else if (e.name.endsWith('.tsx')) tsx.push(p)
  }
}
walkTsx(root)
for (const f of tsx) {
  const source = readFileSync(f, 'utf8')
  // Preserve the existing glyph exception for explanatory examples.
  if (!/\/(aboutContent\.tsx$|about\/)/.test(f)) source.split('\n').forEach((line, i) => {
    if (line.includes('디자인 예외:') || /^\s*(\/\/|\*|\/\*)/.test(line)) return
    const code = line.replace(/\{\/\*.*?\*\/\}/g, '')
    const where = `${f.slice(root.length)}:${i + 1}`
    // data-ui 값(피드백 부위 이름)은 예전 이름 그대로 둔다
    const said = code.replace(/data-ui(?:-[a-z]+)?=(?:"[^"]*"|\{[^}]*\})/g, '')
    if (/<button|title=|aria-label=/.test(said)) for (const [re, use] of WORDS) if (re.test(said)) problems.push(`${where}  버튼 말은 "${use}"로\n    ${line.trim().slice(0, 140)}`)
    for (const [re, why] of GLYPHS) if (re.test(code)) problems.push(`${where}  ${why}\n    ${line.trim().slice(0, 140)}`)
  })
  const tree = ts.createSourceFile(f, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const checkLabel = (node, text) => {
    if (!/메인\s+노트/.test(text)) return
    const line = tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1
    problems.push(`${f.slice(root.length)}:${line}  버튼·제목·도움말의 문서 종류는 "메인 노트" 대신 "원고"로\n    ${text.replace(/\0/g, '…').replace(/\s+/g, ' ').trim().slice(0, 140)}`)
  }
  // 용어표 (docs/design-system.md 5절, 10/7): 화면에 보이는 글에 예전 이름을 쓰지 않는다. data-ui 값은 보지 않는다.
  const checkTerms = (node, text) => {
    for (const [re, use] of OLD_TERMS) if (re.test(text)) {
      const line = tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1
      problems.push(`${f.slice(root.length)}:${line}  용어는 "${use}"로 (디자인 시스템 5절 용어표)\n    ${text.replace(/\0/g, '…').replace(/\s+/g, ' ').trim().slice(0, 140)}`)
    }
  }
  const visit = (node) => {
    if (ts.isJsxText(node)) checkTerms(node, node.text)
    // Screen text written as t('한국어', 'English') (apps/web/src/i18n.ts): check the Korean side
    if (isT(node)) { checkTerms(node, labelText(node.arguments[0])); checkLabel(node, labelText(node.arguments[0])) }
    if (ts.isJsxAttribute(node) && /^(title|aria-label|data-tip|placeholder|label)$/.test(node.name.getText(tree))) checkTerms(node, labelText(node.initializer))
    if (ts.isJsxElement(node) && /^(button|h[1-6]|title)$/.test(node.openingElement.tagName.getText(tree))) checkLabel(node, labelText(node))
    if (ts.isJsxAttribute(node) && /^(title|aria-label|data-tip)$/.test(node.name.getText(tree))) checkLabel(node, labelText(node.initializer))
    // Include declarative headings without treating arbitrary strings as labels.
    if (ts.isPropertyAssignment(node) && node.name.getText(tree).replace(/['"]/g, '') === 'title') checkLabel(node, labelText(node.initializer))
    ts.forEachChild(node, visit)
  }
  visit(tree)
}

/** t('한국어', 'English') from i18n.ts */
function isT(node) {
  return ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 't' && node.arguments.length === 2
}

/** Read rendered literals without joining unknown expressions or alternative branches. */
function labelText(node) {
  if (!node) return ''
  if (ts.isJsxText(node) || ts.isStringLiteralLike(node)) return node.text
  if (ts.isJsxElement(node) || ts.isJsxFragment(node)) return node.children.map(labelText).join('')
  if (ts.isJsxExpression(node)) return node.expression ? labelText(node.expression) : ''
  if (ts.isParenthesizedExpression(node)) return labelText(node.expression)
  if (isT(node)) return labelText(node.arguments[0])
  if (ts.isConditionalExpression(node)) return `${labelText(node.whenTrue)}\0${labelText(node.whenFalse)}`
  if (ts.isTemplateExpression(node)) return node.head.text + node.templateSpans.map((span) => labelText(span.expression) + span.literal.text).join('')
  if (ts.isBinaryExpression(node)) return labelText(node.left) + (node.operatorToken.kind === ts.SyntaxKind.PlusToken ? '' : '\0') + labelText(node.right)
  return '\0'
}

// 아이콘 사전 (10/16 아이콘 검토): icons.tsx의 그림마다 디자인 문서 4절에 뜻이 적혀 있고 화면에서 쓰여야 한다.
// 표에 없는 그림이 다른 뜻으로 빌려 쓰이고, 쓰지 않는 그림이 남으면서 "한 기호 한 뜻"이 엉켰다.
{
  const iconSrc = readFileSync(join(root, 'icons.tsx'), 'utf8')
  const names = [...iconSrc.matchAll(/^  ([a-zA-Z]+): <svg/gm)].map((m) => m[1])
  const doc = readFileSync(new URL('../../docs/design-system.md', import.meta.url), 'utf8')
  const code = tsx.filter((f) => !f.endsWith('icons.tsx')).map((f) => readFileSync(f, 'utf8')).join('\n')
  for (const n of names) {
    if (!doc.includes(`Icon.${n}\``) && !doc.includes(`\`${n}\``)) problems.push(`icons.tsx  Icon.${n}의 뜻을 docs/design-system.md 4절 표(또는 화면 태그 기호 줄)에 적는다`)
    if (!new RegExp(`Icon\\.${n}\\b`).test(code)) problems.push(`icons.tsx  Icon.${n}을 화면 어디에서도 쓰지 않는다. 쓰지 않는 그림은 지운다`)
  }
}

// 간격 경고 (실패하지 않음, 디자인 검토 10/17 5절 10번): padding·margin·gap의 px 값이 토큰(--sp-*)도 아니고
// 단계 사이를 메우는 작은 맞춤 값(0·1·2·3·6·10px)도 아니면 수만 센다. 4·8·12·16·24·32px는 위 규칙이 실패로 잡는다.
// 새 줄에는 토큰을 쓰고, 고칠 곳을 고를 때 SPACING_WARN_ALL=1로 줄 목록을 본다.
const SPACING_OK = new Set([0, 1, 2, 3, 6, 10, 4, 8, 12, 16, 24, 32])
const spacingWarnings = []
for (const f of files) {
  readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
    if (line.includes('디자인 예외:')) return
    const code = line.replace(/\/\*.*?\*\//g, '')
    for (const decl of code.matchAll(/\b(?:padding|margin|gap|row-gap|column-gap)(?:-[a-z]+)?\s*:([^;}]*)/g)) {
      for (const m of (decl[1] ?? '').matchAll(/(?<![\w.])-?(\d+(?:\.\d+)?)px\b/g)) {
        const v = Number(m[1])
        if (!SPACING_OK.has(v)) spacingWarnings.push({ where: `${f.slice(root.length)}:${i + 1}`, v, line: line.trim().slice(0, 140) })
      }
    }
  })
}
if (spacingWarnings.length) {
  const byValue = new Map()
  for (const w of spacingWarnings) byValue.set(w.v, (byValue.get(w.v) ?? 0) + 1)
  const summary = [...byValue].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([v, n]) => `${v}px ${n}`).join(' · ')
  console.warn(`경고: 토큰이 아닌 간격 값 ${spacingWarnings.length}곳 (${summary}). 실패는 아니다. 새 줄은 --sp-*로, 목록은 SPACING_WARN_ALL=1`)
  if (process.env.SPACING_WARN_ALL) for (const w of spacingWarnings) console.warn(`  ${w.where}  ${w.v}px\n    ${w.line}`)
}

if (problems.length) {
  console.error(`화면 기준에 어긋난 곳 ${problems.length}개:\n` + problems.join('\n'))
  process.exit(1)
}
console.log(`화면 기준 검사 통과: 스타일 파일 ${files.length}개, 화면 코드 ${tsx.length}개`)
