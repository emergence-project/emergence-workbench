// 화면 기준 검사: 화면 스타일이 tokens.css의 값만 쓰는지 본다 (docs/design-system.md "지키는 장치").
// 어기면 줄 번호와 함께 실패한다. 꼭 필요한 예외는 그 줄에 `/* 디자인 예외: 이유 */`를 적는다.
import { readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'

// Reuse the web app's TypeScript dependency to distinguish labels from source metadata.
const ts = createRequire(new URL('../../apps/web/package.json', import.meta.url))('typescript')

const root = new URL('../../apps/web/src/', import.meta.url).pathname
const RULES = [
  [/#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(/, '색은 tokens.css의 변수로 (새 색은 라이트·다크 둘 다 더한다)'],
  [/font-size:\s*[0-9.]+px|calc\([0-9.]+px \* var\(--ui-scale/, '글자 크기는 --fs-* 로'],
  [/font-weight:\s*\d/, '글자 굵기는 --fw-* 로'],
  [/border-radius:[^;}]*\b(?:[4-9]|\d{2,})px/, '모서리는 --r-* 로 (3px 이하 작은 표시는 예외)'],
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

// 기호와 행동 말 (docs/design-system.md "기호와 행동"): 화면 코드(.tsx)에서 한 행동에 다른 이름·기호를 쓰지 않는다.
// 버튼 줄(<button … 이 있는 줄)의 글자와 title·aria-label만 본다. 설명 글·주석은 보지 않는다.
const WORDS = [
  [/삭제/, '지우기'], [/제거/, '빼기'], [/추가/, '더하기'], [/편집하기|편집 버튼|>편집</, '고치기'], [/수정하기|>수정</, '고치기'], [/그만두기/, '취소'],
  // 10/5 시안: 양쪽 칸 이름은 "왼쪽 사이드바"·"오른쪽 사이드바" (data-ui 값 "맥락 칸 …"은 이전 피드백과 맞추려 그대로)
  [/(?<!data-ui=")맥락 칸/, '오른쪽 사이드바'],
]
const OLD_TERMS = [
  [/보조 노트/, '노트'], [/왼쪽 띠/, '레일'], [/제목줄/, '상단바'], [/거르기/, '필터'], [/형광펜/, '하이라이트'],
  [/이름표/, '태그(툴팁이면 툴팁)'], [/입력칸/, '입력란'], [/도구 줄|도구 막대|머리줄/, '툴바'], [/탭 줄/, '탭 바'], [/작업 칸|지금 칸|다른 칸|옆 칸/, '패널'], [/오른쪽 칸|맥락 칸/, '오른쪽 사이드바'], [/반려/, '수정 요청'], [/다 고침/, '편집 완료'],
]
const GLYPHS = [
  [/✕|✖/, '지우기는 휴지통(Icon.trash), 빼기·닫기는 ×'],
  [/↻/, '컴파일은 ▶(Icon.play)'],
  [/<button[^]*>\s*✎/, '고치기 버튼은 연필(Icon.pencil). ✎ 글자는 "고침" 기록 표시에만'],
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
  if (!f.endsWith('/aboutContent.tsx')) source.split('\n').forEach((line, i) => {
    if (line.includes('디자인 예외:') || /^\s*(\/\/|\*|\/\*)/.test(line)) return
    const code = line.replace(/\{\/\*.*?\*\/\}/g, '')
    const where = `${f.slice(root.length)}:${i + 1}`
    if (/<button|title=|aria-label=/.test(code)) for (const [re, use] of WORDS) if (re.test(code)) problems.push(`${where}  버튼 말은 "${use}"로\n    ${line.trim().slice(0, 140)}`)
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

if (problems.length) {
  console.error(`화면 기준에 어긋난 곳 ${problems.length}개:\n` + problems.join('\n'))
  process.exit(1)
}
console.log(`화면 기준 검사 통과: 스타일 파일 ${files.length}개, 화면 코드 ${tsx.length}개`)
