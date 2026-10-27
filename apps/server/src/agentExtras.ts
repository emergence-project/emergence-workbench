/**
 * 앱 대화에 맥의 Claude Code 스킬 · 커넥터를 붙인다 (10/21 22:40 피드백, 10/27 사용자 「진행」).
 * 사용자 설정(settingSources)은 계속 읽지 않는다: 그러면 훅 · 허락 규칙도 함께 들어와 "허락은 앱이 정한다"가 깨진다.
 * - 스킬: ~/.claude/skills/<이름>/SKILL.md. 그 폴더들을 잇는 작은 플러그인 폴더를 만들어 SDK의 plugins로 넘긴다.
 * - 커넥터: ~/.claude.json의 mcpServers(사용자 범위로 등록한 MCP 서버). 설정을 그대로 SDK의 mcpServers에 더한다.
 *   커넥터 도구를 쓰는 것은 다른 도구처럼 허락 카드를 거친다(judge). claude.ai에서 붙인 커넥터는 이 파일에 없어 들지 않는다.
 * 화면에는 이름과 설명만 보낸다(커넥터의 명령 · 주소 · 키는 보내지 않는다).
 */
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import YAML from 'yaml'
import type { ChatExtras } from '@rw/core/contract/agentChats'

/** 플러그인 이름: 스킬은 에이전트 안에서 `${SKILLS_PLUGIN}:<이름>`이 된다 */
export const SKILLS_PLUGIN = 'my-skills'

type McpConfig = Record<string, unknown> & { type?: string; command?: string; url?: string }

const home = () => process.env.RW_CLAUDE_HOME ?? os.homedir()

/** SKILL.md 머리말의 name · description (없으면 폴더 이름 · 빈 설명) */
function skillOf(dir: string, id: string): { name: string; description: string } | null {
  const file = path.join(dir, 'SKILL.md')
  let text: string
  try { text = fs.readFileSync(file, 'utf8') } catch { return null }
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)
  let head: Record<string, unknown> = {}
  try { head = m ? (YAML.parse(m[1]!) ?? {}) as Record<string, unknown> : {} } catch { /* 머리말이 깨졌으면 폴더 이름만 */ }
  const name = typeof head.name === 'string' && head.name.trim() ? head.name.trim() : id
  const description = typeof head.description === 'string' ? head.description.trim().replace(/\s+/g, ' ').slice(0, 300) : ''
  return { name, description }
}

/** 사용자 스킬 폴더들 (이름 순) */
export function userSkills(): { id: string; dir: string; name: string; description: string }[] {
  const root = path.join(home(), '.claude', 'skills')
  let names: string[]
  try { names = fs.readdirSync(root) } catch { return [] }
  return names.filter((n) => !n.startsWith('.')).sort().flatMap((id) => {
    const dir = path.join(root, id)
    const s = skillOf(dir, id)
    return s ? [{ id, dir, ...s }] : []
  })
}

/** 사용자 범위 MCP 서버 (~/.claude.json mcpServers). 앱 MCP와 이름이 겹치는 것은 뺀다 */
export function userConnectors(reserved: string): Record<string, McpConfig> {
  let raw: unknown
  try { raw = JSON.parse(fs.readFileSync(path.join(home(), '.claude.json'), 'utf8')) } catch { return {} }
  const servers = (raw as { mcpServers?: unknown })?.mcpServers
  if (!servers || typeof servers !== 'object') return {}
  const out: Record<string, McpConfig> = {}
  for (const [name, c] of Object.entries(servers as Record<string, unknown>)) {
    if (name === reserved || !c || typeof c !== 'object') continue
    const cfg = c as McpConfig
    if (typeof cfg.command === 'string' || typeof cfg.url === 'string') out[name] = cfg
  }
  return out
}

/** 화면의 / 메뉴 · @ 메뉴에 보일 것 */
export function chatExtras(reserved: string): ChatExtras {
  return {
    skills: userSkills().map(({ name, description }) => ({ name, description })),
    connectors: Object.entries(userConnectors(reserved)).map(([name, c]) => ({ name, type: c.type === 'http' || c.type === 'sse' ? c.type : c.url ? 'http' : 'stdio' })),
  }
}

/**
 * 사용자 스킬을 담은 플러그인 폴더: <base>/<지문>/.claude-plugin/plugin.json과 skills/<이름> → 원래 스킬 폴더(링크).
 * 폴더 이름이 스킬 목록의 지문이라, 목록이 같으면 있는 폴더를 그대로 쓴다(도는 대화가 읽는 폴더를 지우지 않는다). 스킬이 없으면 null
 */
export function skillsPluginDir(base = path.join(os.tmpdir(), `rw-agent-skills-${process.getuid?.() ?? 'u'}`)): string | null {
  const skills = userSkills()
  if (!skills.length) return null
  const sig = createHash('sha256').update(skills.map((s) => `${s.id}\0${s.dir}`).join('\n')).digest('hex').slice(0, 12)
  const dir = path.join(base, sig)
  if (fs.existsSync(path.join(dir, '.claude-plugin', 'plugin.json'))) return dir
  const tmp = `${dir}.${process.pid}.tmp`
  fs.rmSync(tmp, { recursive: true, force: true })
  fs.mkdirSync(path.join(tmp, '.claude-plugin'), { recursive: true })
  fs.mkdirSync(path.join(tmp, 'skills'))
  fs.writeFileSync(path.join(tmp, '.claude-plugin', 'plugin.json'), `${JSON.stringify({ name: SKILLS_PLUGIN, description: 'Skills from ~/.claude/skills, passed in by the workbench app' }, null, 2)}\n`)
  for (const s of skills) fs.symlinkSync(s.dir, path.join(tmp, 'skills', s.id), 'dir')
  try { fs.renameSync(tmp, dir) } catch { fs.rmSync(tmp, { recursive: true, force: true }) /* 다른 차례가 먼저 만들었다 */ }
  return dir
}
