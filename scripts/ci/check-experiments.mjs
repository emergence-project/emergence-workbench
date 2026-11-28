// 실험 기능의 울타리 (2026-11-27 사용자 결정 "실험 기능은 단계별로 켜고 끄고, 별로면 깨끗이 떼어 낸다"):
// docs/rules/registry.json에서 code:를 가진 실험(kind experiment)마다
// - 울타리: 실험이 가진 파일(owns)을 import하는 바깥 파일은 이음매(seams)에 적힌 것뿐이다. 새 자리에서 부르면 실패한다(이음매가 export *로 다시 내보낸 이름을 가져오는 것도)
//   → 그 자리가 꼭 필요하면 seams에 더하고, 아니면 이미 있는 이음매를 거친다. 끌 때 · 지울 때 고칠 코드 연결이 이 목록이다
//   (import가 아닌 연결 — 주소 · 페이지 이름 같은 문자열 — 은 세지 않는다)
// - 지도가 맞음: seams에 적힌 파일이 실제로 owns를 부르고, owns의 무늬마다 파일이 하나 이상 있다(옮기거나 지운 뒤 목록이 낡지 않게)
// - 다시 볼 날: 7일 안이면 알리고(실패 아님), review가 지났는데 판단(verdict)이 되돌림 · 없앰이 아니면 실패한다 → 유지 · 되돌림을 정해 verdict · note · review를 고친다
// 테스트 파일(*.test.*)은 부르는 쪽으로 세지 않는다(기능을 지우면 함께 지워진다). 자세한 차례: docs/rules/README.md「실험 기능의 울타리」
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

export const REGISTRY = 'docs/rules/registry.json'
const SOURCE = /\.(ts|tsx|mjs|js|css)$/
const TEST = /\.test\.(ts|tsx|mjs|js)$/
/** 패키지 이름 → 소스 폴더 (package.json exports와 같은 대응) */
const PACKAGES = { '@rw/core': 'packages/core/src' }
const addDays = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10)

/** 무늬(`*`는 / 밖의 아무 글자)를 정규식으로 */
const escapeRe = (text) => text.replace(/[.+?^$()|[\]\\{}]/g, '\\$&')
export const globRe = (glob) => new RegExp('^' + glob.split('*').map(escapeRe).join('[^/]*') + '$')

/** 글에서 import하는 경로들: from '…', import '…', import('…'), tsImport('…')(스크립트가 서버 코드를 부르는 꼴), export … from '…', CSS의 import 줄 */
export function specifiers(source) {
  const out = []
  for (const re of [/\bfrom\s*['"]([^'"]+)['"]/g, /\bimport\s*['"]([^'"]+)['"]/g, /\b(?:import|tsImport)\(\s*['"]([^'"]+)['"]/g, /@import\s+(?:url\()?['"]([^'"]+)['"]/g]) {
    for (const m of source.matchAll(re)) out.push(m[1])
  }
  return out
}

/** import 경로를 저장소 안의 파일로 (없으면 null) */
export function resolve(from, spec, has) {
  let base
  if (spec.startsWith('.')) base = path.posix.join(path.posix.dirname(from), spec)
  else {
    const pkg = Object.keys(PACKAGES).find((p) => spec === p || spec.startsWith(`${p}/`))
    if (!pkg) return null
    base = spec === pkg ? `${PACKAGES[pkg]}/index` : `${PACKAGES[pkg]}/${spec.slice(pkg.length + 1)}`
  }
  const stem = base.replace(/\.(js|mjs)$/, '')
  for (const c of [base, `${stem}.ts`, `${stem}.tsx`, `${stem}.mjs`, `${stem}.js`, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`]) if (has(c)) return c
  return null
}

/** 파일이 내보내는 이름들 (export const · function · class · type · interface · enum · let) */
export const exportedNames = (source) => new Set([...source.matchAll(/\bexport\s+(?:declare\s+)?(?:async\s+)?(?:const|let|function\*?|class|type|interface|enum)\s+(\w+)/g)].map((m) => m[1]))

/** 경로 spec에서 이름을 꺼내 가져오는 것들: import { a, b as c } from 'spec' · import type { … } (이름은 원래 이름) */
export function namedFrom(source, matches) {
  const out = []
  for (const m of source.matchAll(/\bimport\s+(?:type\s+)?\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g)) {
    if (!matches(m[2])) continue
    for (const part of m[1].split(',')) {
      const name = part.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0]?.trim()
      if (name) out.push(name)
    }
  }
  return out
}

/**
 * 검사 결과: 문제 문장 목록 (비면 통과)
 * warnings를 주면 다시 볼 날이 7일 안인 실험을 거기에 더한다(실패는 아님)
 * @param {{ registry: { rules: any[] }, files: string[], read: (p: string) => string, today: string, warnings?: string[] }} input
 */
export function checkExperiments({ registry, files, read, today, warnings }) {
  const problems = []
  const set = new Set(files)
  const has = (p) => set.has(p)
  const fenced = registry.rules.filter((r) => r.kind === 'experiment' && r.code)
  if (!fenced.length) return problems
  // 파일마다 부르는 파일 (한 번만 읽는다)
  const imports = new Map()
  for (const f of files) {
    if (!SOURCE.test(f) || TEST.test(f)) continue
    const targets = specifiers(read(f)).map((s) => resolve(f, s, has)).filter(Boolean)
    if (targets.length) imports.set(f, targets)
  }
  for (const r of fenced) {
    const res = (r.code.owns ?? []).map(globRe)
    for (const [i, glob] of (r.code.owns ?? []).entries()) {
      if (!files.some((f) => res[i].test(f))) problems.push(`${r.id}: owns의 ${glob}에 맞는 파일이 없습니다. 옮겼거나 지웠으면 ${REGISTRY}의 목록을 고치세요.`)
    }
    const owned = (f) => res.some((re) => re.test(f))
    const seams = new Set(r.code.seams ?? [])
    const used = new Set()
    for (const [f, targets] of imports) {
      if (owned(f)) continue
      const hit = targets.filter(owned)
      if (!hit.length) continue
      if (seams.has(f)) { used.add(f); continue }
      problems.push(`${r.id}(실험): ${f}가 ${[...new Set(hit)].join(', ')}을 부릅니다. 실험 기능은 정해 둔 이음매에서만 부릅니다. 이 자리가 꼭 필요하면 ${REGISTRY} ${r.id}의 code.seams에 더하고(끄거나 지울 때 고칠 곳이 하나 늘어남), 아니면 이미 있는 이음매를 거치세요.`)
    }
    // 다시 내보내기(export * from)를 하는 이음매(barrel)를 거쳐 실험의 이름을 가져오는 것도 새 자리로 센다
    for (const barrel of seams) {
      const src = read(barrel)
      const names = new Set()
      for (const m of src.matchAll(/\bexport\s*\*\s*from\s*['"]([^'"]+)['"]/g)) {
        const t = resolve(barrel, m[1], has)
        if (t && owned(t)) for (const n of exportedNames(read(t))) names.add(n)
      }
      if (!names.size) continue
      for (const f of files) {
        if (!SOURCE.test(f) || TEST.test(f) || owned(f) || seams.has(f) || !imports.get(f)?.includes(barrel)) continue
        const hit = namedFrom(read(f), (spec) => resolve(f, spec, has) === barrel).filter((n) => names.has(n))
        if (hit.length) problems.push(`${r.id}(실험): ${f}가 ${barrel}을 거쳐 실험의 ${[...new Set(hit)].join(', ')}을 가져옵니다. 이 자리가 꼭 필요하면 ${REGISTRY} ${r.id}의 code.seams에 더하고, 아니면 이미 있는 이음매를 거치세요.`)
      }
    }
    for (const s of seams) {
      if (!used.has(s)) problems.push(`${r.id}: seams의 ${s}는 이제 실험 파일을 부르지 않습니다. ${REGISTRY}의 목록에서 빼세요.`)
    }
    if (warnings && r.review >= today && r.review <= addDays(today, 7) && !['reverted', 'removed'].includes(r.verdict)) {
      warnings.push(`${r.id}(실험): 다시 볼 날 ${r.review}이 7일 안입니다. 그날이 지나면 이 검사가 모든 PR에서 실패하니 미리 사용자와 유지 · 되돌림을 정하세요.`)
    }
    if (r.review < today && !['reverted', 'removed'].includes(r.verdict)) {
      problems.push(`${r.id}(실험): 다시 볼 날 ${r.review}이 지났습니다. 유지할지 되돌릴지 사용자와 정해 ${REGISTRY}의 verdict · note · review를 고치세요 (docs/rules/README.md 차례 3).`)
    }
  }
  return problems
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
  process.chdir(root)
  const registry = JSON.parse(fs.readFileSync(REGISTRY, 'utf8'))
  const files = execFileSync('git', ['ls-files', '-z', '-co', '--exclude-standard', 'apps', 'packages', 'scripts'], { encoding: 'utf8' })
    .split('\0').filter((f) => f && fs.existsSync(f))
  const today = new Date().toISOString().slice(0, 10)
  const warnings = []
  const problems = checkExperiments({ registry, files, read: (p) => fs.readFileSync(p, 'utf8'), today, warnings })
  if (warnings.length) console.warn(warnings.map((w) => `! ${w}`).join('\n'))
  if (problems.length) { console.error(problems.map((p) => `✗ ${p}`).join('\n')); process.exit(1) }
  const fenced = registry.rules.filter((r) => r.kind === 'experiment' && r.code)
  console.log(`실험 울타리 검사 통과 (${fenced.map((r) => `${r.id}: 이음매 ${r.code.seams.length}곳`).join(', ') || '울타리를 둔 실험 없음'})`)
}
