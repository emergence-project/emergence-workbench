// 에이전트마다 로그인한 계정 (11/9 사용자 "로그인된 계정을 확인할 수 있게 하자", 시안 https://claude.ai/artifact/3rzyEjiuLgnmBvmWLJoER8 2절)
// 그 에이전트가 이 컴퓨터에 적어 둔 로그인 정보에서 이메일과 요금제만 읽는다. 토큰은 읽어도 밖으로 내보내지 않는다
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export interface Account { email?: string; plan?: string }

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v)) : {})
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined)
function readJson(file: string): Record<string, unknown> {
  try { return obj(JSON.parse(fs.readFileSync(file, 'utf8'))) } catch { return {} }
}
/** 요금제 이름: max → Max, chatgpt plus → Plus */
const planName = (v: string | undefined): string | undefined => (v ? v.replace(/^chatgpt[_ ]?/i, '').replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) : undefined)

/**
 * Claude Code: ~/.claude.json의 oauthAccount.emailAddress, 요금제는 ~/.claude/.credentials.json의 subscriptionType
 * (맥은 키체인에 두어 파일이 없을 수 있다: 그때는 이메일만). CLAUDE_CONFIG_DIR이 있으면 거기서
 */
export function claudeAccount(home = os.homedir()): Account {
  const dir = process.env.CLAUDE_CONFIG_DIR
  const cfg = readJson(dir ? path.join(dir, '.claude.json') : path.join(home, '.claude.json'))
  const acct = obj(cfg.oauthAccount)
  const cred = obj(readJson(path.join(dir ?? path.join(home, '.claude'), '.credentials.json')).claudeAiOauth)
  const email = str(acct.emailAddress)
  const plan = planName(str(cred.subscriptionType))
  return { ...(email && { email }), ...(plan && { plan }) }
}

/** JWT 가운데 토막(payload)을 읽는다. 서명은 보지 않는다(보이기만 하므로) */
export function jwtClaims(token: unknown): Record<string, unknown> {
  const part = typeof token === 'string' ? token.split('.')[1] : undefined
  if (!part) return {}
  try { return obj(JSON.parse(Buffer.from(part, 'base64url').toString('utf8'))) } catch { return {} }
}

/** Codex: CODEX_HOME(기본 ~/.codex)의 auth.json에 든 id_token의 email과 chatgpt_plan_type. API 키로 로그인했으면 없음 */
export function codexAccount(home = os.homedir()): Account {
  const auth = readJson(path.join(process.env.CODEX_HOME || path.join(home, '.codex'), 'auth.json'))
  const claims = jwtClaims(obj(auth.tokens).id_token)
  const email = str(claims.email)
  const plan = planName(str(obj(claims['https://api.openai.com/auth']).chatgpt_plan_type))
  return { ...(email && { email }), ...(plan && { plan }) }
}
