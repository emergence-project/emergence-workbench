// pnpm agent:rules [--days 30] [--today YYYY-MM-DD] — 에이전트에게 지우는 규칙을 다시 볼 때인지 알린다 (2026-11-27 사용자 결정 "규칙은 늘 의심하고 꼭 필요한지 확인").
// 규칙 목록은 docs/rules/registry.json, 절차는 docs/rules/README.md. git 이력만 읽고 파일은 고치지 않는다.
// 규칙마다 센다: 최근 커밋 중 그 규칙 때문에 쓴 줄('소개: 그대로' 같은 것)의 비율, 그 규칙이 지키는 파일을 고친 커밋 수.
// 알리는 것: 다시 볼 날이 지난 규칙, 커밋의 25% 넘게 의례 줄을 쓰게 하는 규칙, 규칙 문서(CLAUDE.md)가 커진 정도.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const KINDS = ['safety', 'quality', 'process', 'format']
export const VERDICTS = ['keep', 'relaxed', 'removed', 'ask', 'watch']
const DATE = /^\d{4}-\d{2}-\d{2}$/

/** 목록의 모양을 본다: 문제 문장 목록 (비면 통과) */
export function checkRegistry(registry) {
  const problems = []
  const seen = new Set()
  for (const r of registry.rules ?? []) {
    const at = r.id ?? '(id 없음)'
    if (!r.id || seen.has(r.id)) problems.push(`${at}: id가 없거나 겹칩니다`)
    seen.add(r.id)
    for (const k of ['rule', 'where', 'why', 'note']) if (!r[k]) problems.push(`${at}: ${k}가 비었습니다`)
    if (!KINDS.includes(r.kind)) problems.push(`${at}: kind는 ${KINDS.join(' · ')} 중 하나`)
    if (!VERDICTS.includes(r.verdict)) problems.push(`${at}: verdict는 ${VERDICTS.join(' · ')} 중 하나`)
    if (!DATE.test(r.since ?? '') || !DATE.test(r.review ?? '')) problems.push(`${at}: since · review는 YYYY-MM-DD`)
  }
  return problems
}

/** 커밋 목록에서 규칙마다 센다. commits: [{ body, files }] */
export function measure(rule, commits) {
  const m = rule.measure
  if (!m) return null
  const out = { commits: commits.length }
  if (m.attest) {
    const re = new RegExp(m.attest, 'm')
    out.attest = commits.filter((c) => re.test(c.body)).length
  }
  if (m.touch) out.touch = commits.filter((c) => c.files.some((f) => m.touch.some((p) => f.includes(p)))).length
  return out
}

/** 알릴 것: 규칙마다 { id, flags: string[] } (flags가 빈 규칙은 뺀다) */
export function flagsFor(registry, commits, today) {
  const out = []
  for (const r of registry.rules) {
    if (r.verdict === 'removed') continue
    const flags = []
    if (r.review <= today) flags.push(`다시 볼 날(${r.review})이 지났습니다`)
    const got = measure(r, commits)
    if (got?.attest !== undefined && got.commits && got.attest / got.commits > 0.25) {
      flags.push(`커밋 ${got.commits}개 중 ${got.attest}개(${Math.round((100 * got.attest) / got.commits)}%)가 이 규칙 때문에 줄을 썼습니다`)
    }
    if (flags.length) out.push({ id: r.id, kind: r.kind, verdict: r.verdict, flags })
  }
  return out
}

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })

/** 최근 커밋: 몸 글과 바뀐 파일 */
export function recentCommits(days, ref = 'HEAD') {
  const SEP = '\u0001'
  const raw = git('log', ref, `--since=${days} days ago`, `--format=${SEP}%B${SEP}`, '--name-only')
  const parts = raw.split(SEP)
  const commits = []
  for (let i = 1; i + 1 < parts.length; i += 2) commits.push({ body: parts[i] ?? '', files: (parts[i + 1] ?? '').split('\n').filter(Boolean) })
  return commits
}

/** 규칙 문서의 크기: 지금과 days일 전 (바이트) */
function sizeThen(file, days) {
  const now = fs.existsSync(file) ? fs.statSync(file).size : 0
  let then = 0
  try {
    const rev = git('rev-list', '-1', `--before=${days} days ago`, 'HEAD').trim()
    if (rev) then = Buffer.byteLength(git('show', `${rev}:${file}`))
  } catch { /* 그때 없던 파일 */ }
  return { now, then }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  process.chdir(root)
  const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : fallback }
  const days = Number(arg('--days', '30'))
  const today = arg('--today', new Date().toISOString().slice(0, 10))
  const registry = JSON.parse(fs.readFileSync('docs/rules/registry.json', 'utf8'))
  const problems = checkRegistry(registry)
  if (problems.length) { console.error(problems.map((p) => `✗ ${p}`).join('\n')); process.exit(1) }
  const commits = recentCommits(days)
  const flagged = flagsFor(registry, commits, today)
  const { now, then } = sizeThen('CLAUDE.md', days)
  console.log(`규칙 ${registry.rules.length}개 · 최근 ${days}일 커밋 ${commits.length}개 · CLAUDE.md ${Math.round(then / 1024)}KB → ${Math.round(now / 1024)}KB`)
  if (!flagged.length) console.log('다시 볼 규칙 없음')
  for (const f of flagged) console.log(`- ${f.id} (${f.kind} · ${f.verdict}): ${f.flags.join(' · ')}`)
  if (flagged.some((f) => f.kind === 'safety')) console.log('안전 규칙(safety)은 사용자 허락 없이 풀지 않습니다.')
}
