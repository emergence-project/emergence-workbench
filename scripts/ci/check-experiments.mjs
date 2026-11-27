// 실험 기능의 울타리 (2026-11-27 사용자 결정 "실험 기능은 단계별로 켜고 끄고, 별로면 깨끗이 떼어 낸다"):
// docs/rules/registry.json에서 code:를 가진 실험(kind experiment)마다
// - 울타리: 실험이 가진 파일(owns)을 import하는 바깥 파일은 이음매(seams)에 적힌 것뿐이다. 새 자리에서 부르면 실패한다
//   → 그 자리가 꼭 필요하면 seams에 더하고, 아니면 이미 있는 이음매를 거친다. 끌 때 · 지울 때 고칠 곳이 이 목록이다
// - 지도가 맞음: seams에 적힌 파일이 실제로 owns를 부르고, owns의 무늬마다 파일이 하나 이상 있다(옮기거나 지운 뒤 목록이 낡지 않게)
// - 다시 볼 날: review가 지났는데 판단(verdict)이 되돌림 · 없앰이 아니면 실패한다 → 유지 · 되돌림을 정해 verdict · note · review를 고친다
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

/** 무늬(`*`는 / 밖의 아무 글자)를 정규식으로 */
export const globRe = (glob) => new RegExp(`^${glob.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*')}$`)

/** 글에서 import하는 경로들: from '…', import '…', import('…'), export … from '…', CSS @import */
export function specifiers(source) {
  const out = []
  for (const re of [/\bfrom\s*['"]([^'"]+)['"]/g, /\bimport\s*['"]([^'"]+)['"]/g, /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g, /@import\s+(?:url\()?['"]([^'"]+)['"]/g]) {
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

/**
 * 검사 결과: 문제 문장 목록 (비면 통과)
 * @param {{ registry: { rules: any[] }, files: string[], read: (p: string) => string, today: string }} input
 */
export function checkExperiments({ registry, files, read, today }) {
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
    for (const s of seams) {
      if (!used.has(s)) problems.push(`${r.id}: seams의 ${s}는 이제 실험 파일을 부르지 않습니다. ${REGISTRY}의 목록에서 빼세요.`)
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
  const files = execFileSync('git', ['ls-files', '-co', '--exclude-standard', 'apps', 'packages', 'scripts'], { encoding: 'utf8' })
    .split('\n').filter((f) => f && fs.existsSync(f))
  const today = new Date().toISOString().slice(0, 10)
  const problems = checkExperiments({ registry, files, read: (p) => fs.readFileSync(p, 'utf8'), today })
  if (problems.length) { console.error(problems.map((p) => `✗ ${p}`).join('\n')); process.exit(1) }
  const fenced = registry.rules.filter((r) => r.kind === 'experiment' && r.code)
  console.log(`실험 울타리 검사 통과 (${fenced.map((r) => `${r.id}: 이음매 ${r.code.seams.length}곳`).join(', ') || '울타리를 둔 실험 없음'})`)
}
