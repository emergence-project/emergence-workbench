/**
 * 규칙과 실험의 목록 (docs/rules/registry.json, 2026-11-27 사용자 결정): 읽고, git 이력에서 잰 값과 알릴 것을 붙이고, 사용자 답을 적는다.
 * 소개 › 연구 화면(routes/rules.ts)과 pnpm agent:rules(scripts/agent-rules.mjs)가 같은 함수를 쓴다.
 * 사용자 답(결정을 기다리는 줄의 「진행」 · 「그대로」)은 소개 확인 기록처럼 피드백 폴더의 rules.yaml에 둔다(공개 앱 코드에 섞이지 않게).
 *
 *   codex-implements:
 *     answer: 진행        # 진행 = 제안대로(지우기 · 되돌리기 · 풀기), 그대로 = 두기
 *     at: 2026-11-27T09:40
 */
import fs from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'
import { RuleAnswer, RuleRegistry, type RuleEntry, type RuleRow } from '@rw/core/contract/rules'
import { git } from './git.js'

export const REGISTRY_FILE = 'docs/rules/registry.json'
export const RULE_ANSWER_FILE = 'rules.yaml'
const HEAD = '# 규칙 · 실험 가운데 결정을 기다리는 줄에 사용자가 누른 답 (소개 › 연구). 키는 docs/rules/registry.json의 id\n'

export interface Commit { body: string; files: string[] }

/** 목록 파일을 읽고 모양을 본다 (틀리면 던진다: 고친 사람이 바로 알게) */
export function readRegistry(root: string): { about: string; rules: RuleEntry[] } {
  return RuleRegistry.parse(JSON.parse(fs.readFileSync(path.join(root, REGISTRY_FILE), 'utf8')))
}

/** 커밋 목록에서 규칙 하나를 센다. measure가 없으면 undefined */
export function measure(rule: RuleEntry, commits: Commit[]): RuleRow['measured'] {
  const m = rule.measure
  if (!m) return undefined
  const out: NonNullable<RuleRow['measured']> = { commits: commits.length }
  if (m.attest) {
    const re = new RegExp(m.attest, 'm')
    out.attest = commits.filter((c) => re.test(c.body)).length
  }
  if (m.touch) out.touch = commits.filter((c) => c.files.some((f) => m.touch!.some((p) => f.includes(p)))).length
  return out
}

/** 알릴 것: 다시 볼 날이 지남, 커밋의 25% 넘게 의례 줄. 되돌림 · 없앰 · 보류는 알리지 않는다(사용자가 이미 정함) */
export function flagsOf(rule: RuleEntry, measured: RuleRow['measured'], today: string): string[] {
  if (rule.verdict === 'removed' || rule.verdict === 'reverted' || rule.verdict === 'hold') return []
  const flags: string[] = []
  if (rule.review <= today) flags.push(`다시 볼 날(${rule.review})이 지났습니다`)
  if (measured?.attest !== undefined && measured.commits && measured.attest / measured.commits > 0.25) {
    flags.push(`커밋 ${measured.commits}개 중 ${measured.attest}개(${Math.round((100 * measured.attest) / measured.commits)}%)가 이 규칙 때문에 줄을 썼습니다`)
  }
  return flags
}

/** git log 출력(%x01%B%x01 --name-only)을 커밋 목록으로 */
export function parseLog(raw: string): Commit[] {
  const parts = raw.split('\u0001')
  const commits: Commit[] = []
  for (let i = 1; i + 1 < parts.length; i += 2) commits.push({ body: parts[i] ?? '', files: (parts[i + 1] ?? '').split('\n').filter(Boolean) })
  return commits
}

/** 최근 days일 커밋 (저장소가 아니면 빈 목록) */
export async function recentCommits(root: string, days: number, ref = 'HEAD'): Promise<Commit[]> {
  const raw = await git(root, ['log', ref, `--since=${days} days ago`, '--format=%x01%B%x01', '--name-only'], { maxBuffer: 64 * 1024 * 1024 }).catch(() => '')
  return parseLog(raw)
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** 사용자 답 (파일이 없거나 깨졌으면 빈 표) */
export function readRuleAnswers(dir: string): Record<string, RuleAnswer> {
  let doc: unknown
  try { doc = YAML.parse(fs.readFileSync(path.join(dir, RULE_ANSWER_FILE), 'utf8')) } catch { return {} }
  const out: Record<string, RuleAnswer> = {}
  if (isRecord(doc)) for (const [id, v] of Object.entries(doc)) {
    const at = isRecord(v) && v.at instanceof Date ? { ...v, at: v.at.toISOString().slice(0, 16) } : v
    const r = RuleAnswer.safeParse(at)
    if (r.success) out[id] = r.data
  }
  return out
}

/** 답 하나를 적는다 (다른 줄은 그대로) */
export function writeRuleAnswer(dir: string, id: string, answer: RuleAnswer['answer'], now = new Date()): void {
  fs.mkdirSync(dir, { recursive: true })
  let text = HEAD
  try { text = fs.readFileSync(path.join(dir, RULE_ANSWER_FILE), 'utf8') } catch { /* 처음 */ }
  let doc = YAML.parseDocument(text)
  if (doc.contents !== null && !YAML.isMap(doc.contents)) doc = YAML.parseDocument(HEAD)
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
  doc.setIn([id, 'answer'], answer)
  doc.setIn([id, 'at'], local)
  fs.writeFileSync(path.join(dir, RULE_ANSWER_FILE), doc.toString({ lineWidth: 0 }))
}

/** 화면의 줄: 목록 차례 그대로, 잰 값 · 알릴 것 · 답을 붙인다 */
export function rowsOf(rules: RuleEntry[], commits: Commit[], today: string, answers: Record<string, RuleAnswer> = {}): RuleRow[] {
  return rules.map((entry) => {
    const measured = measure(entry, commits)
    const answer = answers[entry.id]
    return { entry, ...(measured && { measured }), flags: flagsOf(entry, measured, today), ...(answer && { answer }) }
  })
}

/** 사용자가 정할 줄: 판단이 ask인데 아직 답이 없는 것 (알림 「답할 것」) */
export const needsUser = (row: RuleRow) => row.entry.verdict === 'ask' && !row.answer
