// 에이전트 규칙 모음 (MCP rules 도구, 2026-10-08): 일하기 전에 읽을 규칙이 여러 저장소에 흩어져 있어
// 에이전트가 찾아다니지 않게 앱 서버가 한 번에 돌려준다. 읽기만 한다.
import fs from 'node:fs'
import path from 'node:path'
import { homeShort } from './agentPaths.js'

/** 규칙 파일 하나가 이보다 크면 자른다 (에이전트가 읽는 양) */
const MAX = 64 * 1024

export interface RuleFile { file: string; text: string; truncated?: true }

function readRule(root: string, file: string): RuleFile | null {
  let text: string
  try { text = fs.readFileSync(path.join(root, file), 'utf8') } catch { return null }
  return text.length > MAX ? { file, text: text.slice(0, MAX), truncated: true } : { file, text }
}

/**
 * 연구 저장소 맨 위의 AGENTS.md · CLAUDE.md. CLAUDE.md가 `@AGENTS.md` 한 줄처럼 다른 파일만 가리키면 뺀다
 * (같은 글을 두 번 돌려주지 않게).
 */
export function projectRules(repo: string): RuleFile[] {
  const out: RuleFile[] = []
  for (const file of ['AGENTS.md', 'CLAUDE.md']) {
    const r = readRule(repo, file)
    if (!r || !r.text.trim()) continue
    if (/^(\s*@\S+\s*)+$/.test(r.text)) continue
    out.push(r)
  }
  return out
}

/** 연구 공통 규칙의 자리: 설정 폴더 안 개인 저장소 사본의 rules/research.md */
export const COMMON_RULES_FILE = path.join('personal', 'rules', 'research.md')

/**
 * 연구 공통 규칙 (2026-10-13 결정 "연구 저장소 폴더" R1): 모든 연구 저장소에 통하는 규칙을 프로젝트마다 복사하지 않고
 * 개인 저장소 한 곳에 둔다. 앱은 그 사본(설정 폴더 personal/)에서 읽기만 한다. RW_COMMON_RULES로 다른 파일을
 * 가리킬 수 있다(개인 저장소를 따로 받아 둔 클라우드 에이전트). 파일이 없거나 비면 null
 */
export function commonRules(configDir: string | undefined): RuleFile | null {
  const abs = process.env.RW_COMMON_RULES || (configDir ? path.join(configDir, COMMON_RULES_FILE) : '')
  if (!abs) return null
  const r = readRule(path.dirname(abs), path.basename(abs))
  return r && r.text.trim() ? { ...r, file: homeShort(abs) } : null
}

/** 공유 라이브러리 README.md의 개념노트 절 (`## concepts/`부터 다음 `## `까지). 그 절이 없으면 README 전체 */
export function conceptRules(lib: string | undefined): RuleFile | null {
  if (!lib) return null
  const r = readRule(lib, 'README.md')
  if (!r) return null
  const lines = r.text.split('\n')
  const start = lines.findIndex((l) => /^##\s+concepts\//.test(l))
  if (start < 0) return r
  const end = lines.findIndex((l, i) => i > start && /^##\s/.test(l))
  return { file: 'README.md', text: lines.slice(start, end < 0 ? undefined : end).join('\n').trim() }
}
