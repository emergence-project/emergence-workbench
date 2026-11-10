// 에이전트 저장은 에이전트 이름으로 따로 커밋 (11/8 15:16 피드백 진행 ①, 시안 N7ik 7절):
// 에이전트가 앱으로 노트 · 개념노트를 고치면(MCP edit_note · edit_concept) 그 파일 하나만 에이전트를 작성자로 커밋해 올린다.
// 그래야 git blame이 문단마다 사람이 썼는지 에이전트가 썼는지 안다(뒤의 ② 내 문단은 제안으로 · ③ 여백 띠가 이것을 읽는다).
// 사람이 커밋하지 않은 고침이 그 파일에 이미 있으면 섞이므로 커밋하지 않는다(지금처럼 나중에 사람이 올린다).
// 올리기는 기록 올리기와 같은 길(pathsync.ts: 그 파일만, GitHub 최신 위에, 이 컴퓨터의 브랜치를 옮겨 저절로 받기가 막히지 않게).
import { git } from './git.js'
import { offDefaultBranch } from './gitsync.js'
import { locate, publishPaths, type PathPublishResult } from './pathsync.js'
import path from 'node:path'

const NAMES: Record<string, string> = { claude: 'Claude', 'claude-code': 'Claude', codex: 'Codex', gemini: 'Gemini' }

/** 에이전트 이름 → git 작성자. 메일 주소는 실제로 받지 않는 표시용 */
export function agentAuthor(agent: string | undefined): { name: string; email: string } {
  const key = (agent ?? '').trim().toLowerCase()
  const name = NAMES[key] ?? (agent?.trim() || 'Agent')
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'agent'
  return { name, email: `${slug}@agents.emergence-workbench` }
}

/** 쓰기 전에 볼 것: 이 파일이 git 저장소 안에 있고, 커밋하지 않은 고침이 없으면 그 저장소와 상대 경로. 아니면 null */
export async function cleanBeforeAgent(abs: string): Promise<{ top: string; rel: string } | null> {
  if (!abs || !path.isAbsolute(abs)) return null
  try {
    const { top, rel: dirRel } = await locate(path.dirname(abs))
    const rel = dirRel ? `${dirRel}/${path.basename(abs)}` : path.basename(abs)
    // 추적하지 않는 파일(??)도 사람이 아직 올리지 않은 글이라 섞인다
    if (await git(top, ['status', '--porcelain', '--', rel])) return null
    return { top, rel }
  } catch { return null }
}

/** 에이전트가 쓴 파일 하나를 에이전트 이름으로 커밋해 올린다. 기본 브랜치가 아니면 하지 않는다 */
export async function commitAgentWrite(at: { top: string; rel: string }, agent: string | undefined, summary?: string): Promise<PathPublishResult | null> {
  if (await offDefaultBranch(at.top)) return null
  const author = agentAuthor(agent)
  const what = summary?.replace(/\s+/g, ' ').trim().slice(0, 72)
  return publishPaths(at.top, [at.rel], { message: `${author.name}: ${what || `edit ${path.basename(at.rel)}`}`, adopt: true, merge: true, author })
}
