// 구조 래칫 (2026-10-30, 오르카에서 가져옴): 나빠지는 숫자가 늘지 못하게 한다. 한 번에 다 고치지 않아도 더 나빠지지는 않는다.
// - 줄 수: 소스 파일(테스트 빼고)이 LINE_LIMIT줄을 넘으면 기준 파일에 적힌 줄 수까지만 된다. 기준에 없는 파일은 LINE_LIMIT까지.
//   줄 수는 LINE_WIDTH자마다 한 줄로 센다(11/27: 기준에 닿은 파일이 한 줄을 900자 넘게 늘려 버텼다. 긴 줄로는 줄 수를 피하지 못하게).
// - 타입 단언: `as T`(as const 빼고)와 @ts-ignore · @ts-expect-error의 저장소 전체 수가 기준의 합을 넘지 못한다.
//   파일마다 세면 파일을 나눌 때 옮긴 단언이 새 파일의 '기준 0'에 걸려 실패했다(11/26 실패 3건, 11/27 규칙 점검 ratchet-casts).
//   전체가 늘지 않았으면 파일별 초과는 알리기만 하고, --update가 파일마다 지금 수를 기준에 적는다(합은 늘지 않는다).
// 줄었으면 통과하고 `node scripts/ci/check-ratchet.mjs --update`로 기준을 낮추라고 알린다(--update는 낮추기만 한다).
// 기준을 올려야 하면 scripts/ci/ratchet.json을 손으로 고치고 커밋 메시지에 이유를 쓴다.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const LINE_LIMIT = 600
/** 이 글자 수마다 한 줄로 센다 (그보다 긴 줄은 여러 줄) */
export const LINE_WIDTH = 160
const BASELINE = 'scripts/ci/ratchet.json'

/** 검사 대상: 앱 · 패키지 · 스크립트의 소스 (테스트 · 예제 · 만든 파일 빼고) */
export const isSource = (f) =>
  /^(apps|packages)\/[^/]+\/src\/.+\.(ts|tsx|mjs)$/.test(f) && !/\.test\.(ts|tsx|mjs)$/.test(f) && !/\.d\.ts$/.test(f)

/** 한 줄의 따옴표 글을 비운다 (글 속 "as"를 세지 않게) */
const stripStrings = (line) => line.replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`/g, "''")

/** 파일 내용 하나의 숫자들 */
export function measure(source) {
  const lines = source.split('\n')
  let casts = 0
  for (const raw of lines) {
    const line = stripStrings(raw)
    casts += (line.match(/@ts-(?:ignore|expect-error)/g) ?? []).length
    // import * as C · export { a as b }는 단언이 아니다
    const code = line.replace(/\/\/.*$/, '').replace(/\*\s+as\s+[\w$]+/g, '').replace(/^\s*(import|export)\b.*\{[^}]*\}.*$/, '')
    if (/^\s*(\*|\/\*)/.test(code)) continue
    casts += (code.match(/\bas\s+(?!const\b)(?:[A-Z_$][\w$.]*|unknown|any|string|number|boolean|never|\{|\(|\[|typeof\b|keyof\b)/g) ?? []).length
  }
  const counted = source.endsWith('\n') ? lines.slice(0, -1) : lines
  return { lines: counted.reduce((n, l) => n + Math.max(1, Math.ceil([...l].length / LINE_WIDTH)), 0), casts }
}

/**
 * 지금 숫자를 기준과 견준다.
 * @param {Record<string, {lines: number, casts: number}>} now 파일마다 지금 숫자
 * @param {{lines: Record<string, number>, casts: Record<string, number>}} base 기준
 */
export function compare(now, base) {
  const problems = []
  const lower = []
  const over = []
  for (const [f, m] of Object.entries(now)) {
    const maxLines = Math.max(LINE_LIMIT, base.lines[f] ?? 0)
    if (m.lines > maxLines) {
      problems.push(base.lines[f]
        ? `${f}: ${m.lines}줄 (기준 ${base.lines[f]}줄, ${LINE_WIDTH}자마다 한 줄로 셈). 늘리지 말고 나누세요.`
        : `${f}: ${m.lines}줄 (한도 ${LINE_LIMIT}줄, ${LINE_WIDTH}자마다 한 줄로 셈). 새로 큰 파일을 만들지 말고 나누세요.`)
    } else if (base.lines[f] && m.lines < base.lines[f]) lower.push(`${f} 줄 수 ${base.lines[f]} → ${m.lines}`)
    const maxCasts = base.casts[f] ?? 0
    if (m.casts > maxCasts) over.push(`${f}: 타입 단언 ${m.casts}개 (기준 ${maxCasts}개)`)
    else if (maxCasts && m.casts < maxCasts) lower.push(`${f} 타입 단언 ${maxCasts} → ${m.casts}`)
  }
  const total = Object.values(now).reduce((n, m) => n + m.casts, 0)
  const baseTotal = Object.values(base.casts).reduce((n, c) => n + c, 0)
  if (total > baseTotal) problems.push(`타입 단언이 저장소 전체 ${baseTotal}개에서 ${total}개로 늘었습니다. 타입을 좁히거나(zod · 타입 가드) 단언을 늘리지 마세요:\n${over.map((o) => `    ${o}`).join('\n')}`)
  else if (over.length) lower.push(`단언을 옮긴 파일(전체 ${total}/${baseTotal}개라 통과): ${over.join(' · ')}`)
  return { problems, lower }
}

/**
 * 기준을 낮춘 새 기준 (지운 파일은 빼고, 늘어난 것은 그대로 둔다). 단언 기준의 합은 늘지 않는다:
 * 전체가 기준의 합 이하면 파일마다 지금 수를 적고(옮긴 단언도 그대로 통과하게), 전체가 늘었으면 파일마다 기준과 지금 중 작은 수만 남긴다
 */
export function lowered(now, base) {
  const lines = {}
  const casts = {}
  const total = Object.values(now).reduce((n, m) => n + m.casts, 0)
  const baseTotal = Object.values(base.casts).reduce((n, c) => n + c, 0)
  for (const [f, m] of Object.entries(now)) {
    if (base.lines[f] && m.lines > LINE_LIMIT) lines[f] = Math.min(base.lines[f], m.lines)
    if (m.casts > 0 && total <= baseTotal) casts[f] = m.casts
    else if (m.casts > 0 && base.casts[f]) casts[f] = Math.min(base.casts[f], m.casts)
  }
  return { lines: sortKeys(lines), casts: sortKeys(casts) }
}

const sortKeys = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)))

function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
  const files = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split('\n').filter(isSource)
  const now = Object.fromEntries(files.filter((f) => fs.existsSync(path.join(root, f))).map((f) => [f, measure(fs.readFileSync(path.join(root, f), 'utf8'))]))
  const basePath = path.join(root, BASELINE)
  if (process.argv.includes('--init')) {
    const lines = Object.fromEntries(Object.entries(now).filter(([, m]) => m.lines > LINE_LIMIT).map(([f, m]) => [f, m.lines]))
    const casts = Object.fromEntries(Object.entries(now).filter(([, m]) => m.casts > 0).map(([f, m]) => [f, m.casts]))
    fs.writeFileSync(basePath, `${JSON.stringify({ lines: sortKeys(lines), casts: sortKeys(casts) }, null, 2)}\n`)
    console.log(`${BASELINE}를 지금 숫자로 새로 썼습니다`)
    return
  }
  const base = JSON.parse(fs.readFileSync(basePath, 'utf8'))
  if (process.argv.includes('--update')) {
    fs.writeFileSync(basePath, `${JSON.stringify(lowered(now, base), null, 2)}\n`)
    console.log(`${BASELINE}의 기준을 낮췄습니다 (올리지는 않습니다)`)
    const { problems } = compare(now, lowered(now, base))
    if (problems.length) { console.error(`아직 넘은 것이 있습니다:\n${problems.map((p) => `  - ${p}`).join('\n')}`); process.exit(1) }
    return
  }
  const { problems, lower } = compare(now, base)
  if (lower.length) console.log(`줄어든 것이 있습니다. node scripts/ci/check-ratchet.mjs --update로 기준을 낮추세요:\n${lower.map((l) => `  - ${l}`).join('\n')}`)
  if (problems.length) {
    console.error(`구조 래칫을 넘었습니다 (${BASELINE}):\n${problems.map((p) => `  - ${p}`).join('\n')}`)
    process.exit(1)
  }
  console.log('구조 래칫 검사 통과')
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
