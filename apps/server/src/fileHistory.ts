// 파일 하나의 이력 (11/8 15:16 논의 → 11/16 「시안은 다 추천대로」, 시안 N7ik 2절 ③′ 이력 보기).
// 노트 툴바의 시계를 켜면 오른쪽 사이드바가 그 노트 파일을 고친 커밋 목록이 되고, 하나(또는 둘)를 고르면 그 사이 git diff를 본문에 겹친다.
// 재료는 git 기록뿐이다: 작성자 파일을 따로 두지 않는다. 에이전트 저장은 #419부터 에이전트 이름으로 커밋된다(agentCommit.ts).
import { git, gitBuffer, GIT_TIMEOUT } from './git.js'
import { locate } from './pathsync.js'
import type { FileCommit, FileHistory, FileVersions } from '@rw/core/contract/history'

const MAX = 200
/** 에이전트로 보는 이름 · 메일 (agentCommit.ts의 NAMES와 메일 끝) */
const AGENT_NAMES = new Set(['claude', 'codex', 'gemini', 'agent', 'claude code'])
export const isAgent = (name: string, email = '') => AGENT_NAMES.has(name.trim().toLowerCase()) || email.trim().toLowerCase().endsWith('@agents.emergence-workbench') || /^noreply@anthropic\.com$/i.test(email.trim())

/** 커밋 본문의 Co-Authored-By 줄 */
export function coAuthors(body: string): { name: string; email: string }[] {
  return [...body.matchAll(/^co-authored-by:\s*(.+?)\s*<([^>]*)>\s*$/gim)].map((m) => ({ name: m[1]!, email: m[2]! }))
}

const SEP = '\u001e'

/** 이 파일(저장소 안 상대 경로)을 고친 커밋, 최근이 위. 이름을 바꾼 것도 따라간다. git이 아니면 빈 목록 */
export async function fileHistory(root: string, rel: string): Promise<FileHistory> {
  let prefix = ''
  try { const at = await locate(root); prefix = at.rel ? `${at.rel}/` : '' } catch { return { commits: [] } }
  const out = await git(root, ['log', '--follow', `-n${MAX}`, `--format=${SEP}%H%x09%h%x09%cI%x09%an%x09%ae%x09%s%x09%b%x00`, '--name-only', '--', rel], { timeout: GIT_TIMEOUT.remote }).catch(() => '')
  const commits: FileCommit[] = []
  for (const chunk of out.split(SEP)) {
    if (!chunk.trim()) continue
    const [head = '', names = ''] = chunk.split('\0')
    const [hash, short, at, name, email, subject, ...body] = head.split('\t')
    if (!hash || !at) continue
    const file = names.split('\n').map((s) => s.trim()).find(Boolean) ?? ''
    const path = file.startsWith(prefix) ? file.slice(prefix.length) : file
    const people = [{ name: name ?? '', email: email ?? '' }, ...coAuthors(body.join('\t'))]
    const seen = new Set<string>()
    const authors = people.filter((p) => p.name && !seen.has(p.name) && seen.add(p.name)).map((p) => ({ name: p.name, agent: isAgent(p.name, p.email) }))
    commits.push({ hash, short: short ?? hash.slice(0, 7), at, subject: subject ?? '', authors, path: path || rel })
  }
  return { commits }
}

/** 그 커밋 때의 파일 글. 없던 파일이면 '' */
async function textAt(root: string, rev: string, rel: string): Promise<string> {
  return gitBuffer(root, ['show', `${rev}:./${rel}`], { timeout: GIT_TIMEOUT.remote }).then((b) => b.toString('utf8')).catch(() => '')
}

/**
 * 고른 커밋의 전 · 후 글. to만 주면 그 커밋 하나(부모 → 그 커밋), from도 주면 from 커밋 전 → to 커밋.
 * 경로는 이름을 바꾼 이력을 따라 그 커밋 때의 것을 쓴다.
 */
export async function fileVersions(root: string, rel: string, to: string, from?: string): Promise<FileVersions> {
  const { commits } = await fileHistory(root, rel)
  const at = (h: string) => commits.findIndex((c) => c.hash === h || c.short === h)
  const ti = at(to)
  const fi = from ? at(from) : ti
  if (ti < 0 || fi < 0) return { before: '', after: '', found: false }
  // 최근이 위: 더 오래된 쪽이 시작
  const [newer, older] = ti <= fi ? [commits[ti]!, commits[fi]!] : [commits[fi]!, commits[ti]!]
  const parentPath = commits[commits.indexOf(older) + 1]?.path ?? older.path
  const [before, after] = await Promise.all([textAt(root, `${older.hash}^`, parentPath), textAt(root, newer.hash, newer.path)])
  return { before, after, found: true }
}
