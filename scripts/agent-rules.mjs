// pnpm agent:rules [--days 30] [--today YYYY-MM-DD] [--answers <피드백 폴더>] — 규칙과 실험을 다시 볼 때인지 알린다
// (2026-11-27 사용자 결정 "규칙은 늘 의심하고 꼭 필요한지 확인" · "실험은 해 보고 별로면 기록 남기고 되돌린다").
// 목록은 docs/rules/registry.json, 절차는 docs/rules/README.md, 화면은 소개 › 연구. 계산은 화면과 같은 apps/server/src/ruleRegistry.ts.
// git 이력만 읽고 파일은 고치지 않는다. --answers를 주면(맥: ~/.config/research-workspace/personal/feedback) 사용자가 화면에서 누른 답도 보인다.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { tsxApi } from './ci/tsx-api.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
process.chdir(root)
const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : fallback }
const days = Number(arg('--days', '30'))
const today = arg('--today', new Date().toISOString().slice(0, 10))
const personal = path.join(os.homedir(), '.config/research-workspace/personal/feedback')
const answersDir = arg('--answers', fs.existsSync(personal) ? personal : undefined)

const { tsImport } = await tsxApi()
const { readRegistry, recentCommits, rowsOf, readRuleAnswers, needsUser } = await tsImport('../apps/server/src/ruleRegistry.ts', { parentURL: import.meta.url, tsconfig: false })

let rules
try { rules = readRegistry(root).rules } catch (e) { console.error(`✗ docs/rules/registry.json: ${e instanceof Error ? e.message : e}`); process.exit(1) }
const commits = await recentCommits(root, days)
const rows = rowsOf(rules, commits, today, answersDir ? readRuleAnswers(answersDir) : {})

/** 규칙 문서의 크기: 지금과 days일 전 (바이트) */
function sizeThen(file) {
  const git = (...a) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  const now = fs.existsSync(file) ? fs.statSync(file).size : 0
  let then = 0
  try {
    const rev = git('rev-list', '-1', `--before=${days} days ago`, 'HEAD').trim()
    if (rev) then = Buffer.byteLength(git('show', `${rev}:${file}`))
  } catch { /* 그때 없던 파일 */ }
  return { now, then }
}

const { now, then } = sizeThen('CLAUDE.md')
const exp = rows.filter((r) => r.entry.kind === 'experiment').length
console.log(`규칙 ${rows.length - exp}개 · 실험 ${exp}개 · 최근 ${days}일 커밋 ${commits.length}개 · CLAUDE.md ${Math.round(then / 1024)}KB → ${Math.round(now / 1024)}KB`)
const AUD = { uses: '쓰는', fixes: '고치는', both: '둘 다' }
const ENF = { prompt: '글', code: '코드', both: '글 + 코드' }
const tag = (e) => e.kind === 'experiment' ? `실험 · ${e.verdict}` : `${e.kind} · ${e.verdict} · ${AUD[e.audience]} · ${ENF[e.enforce]}`
const flagged = rows.filter((r) => r.flags.length)
if (!flagged.length) console.log('다시 볼 규칙 · 실험 없음')
for (const r of flagged) console.log(`- ${r.entry.id} (${tag(r.entry)}): ${r.flags.join(' · ')}`)
const asks = rows.filter((r) => r.entry.verdict === 'ask')
for (const r of asks) console.log(`? ${r.entry.id}: ${r.answer ? `사용자 답 「${r.answer.answer}」 (${r.answer.at}) — 그대로 반영하는 PR을 올린다` : '사용자 결정 기다림 (소개 › 연구, 알림 「답할 것」)'}`)
if (!answersDir && asks.some(needsUser)) console.log('  (사용자 답은 --answers <피드백 폴더>로 함께 본다)')
const prompts = rows.filter((r) => r.entry.enforce === 'prompt' && r.entry.toCode)
if (prompts.length) console.log(`글로만 지키는 규칙 ${prompts.length}개는 코드로 옮길 길이 적혀 있다: ${prompts.map((r) => r.entry.id).join(', ')}`)
if (flagged.some((r) => r.entry.kind === 'safety')) console.log('안전 규칙(safety)은 사용자 허락 없이 풀지 않습니다.')
