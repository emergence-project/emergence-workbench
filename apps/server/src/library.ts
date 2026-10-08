import fs from 'node:fs'
import { fileCache } from './readCache.js'
import path from 'node:path'
import { parseBlock } from '@rw/core'
import { isLatexSafePath } from './fsutil.js'

/**
 * 공유 라이브러리(research-library)의 서식. 파일 머리말 형식은 블록과 같다.
 *   % title: 기본
 *   % description: …
 *   % place: first | last
 */
/** 서식 파일 안에서 정의하는 기호(\\newcommand 등)와 환경(\\newtheorem 등) 이름 */
export interface TexDefinitions {
  commands: string[]
  environments: string[]
}

export function describeTex(content: string): TexDefinitions {
  const body = content.replace(/(^|[^\\])%.*$/gm, '$1') // 주석 제외
  const commands = [...body.matchAll(/\\(?:new|renew|provide)command\*?\s*\{?\s*\\([A-Za-z]+)/g)].map((m) => `\\${m[1]}`)
  const environments = [...body.matchAll(/\\(?:newtheorem\*?|rwtheorem|newenvironment)\s*\{([A-Za-z*]+)\}/g)].map((m) => m[1]!)
  // \\rw로 시작하는 것은 라이브러리 내부 도우미라 보여 주지 않는다
  return { commands: [...new Set(commands)].filter((c) => !c.startsWith('\\rw')), environments: [...new Set(environments)] }
}

export interface LibraryPreamble extends TexDefinitions {
  /** 파일 이름에서 .tex를 뺀 것 (예: base) */
  name: string
  /** 라이브러리 안 경로 (예: preamble/base.tex) */
  file: string
  title: string
  description: string
  place: 'first' | 'last'
  status?: string
}

const preambleText = fileCache((text) => text)
export function listLibraryPreambles(libraryRoot: string | undefined): LibraryPreamble[] {
  if (!libraryRoot) return []
  const dir = path.join(libraryRoot, 'preamble')
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.tex') && /^[a-z0-9-]+\.tex$/.test(f))
    .map((f) => {
      const content = preambleText(path.join(dir, f))
      const meta = parseBlock(content).meta
      const place: 'first' | 'last' = meta.extra.place === 'first' ? 'first' : 'last'
      return { name: f.slice(0, -4), file: `preamble/${f}`, title: meta.title ?? f.slice(0, -4), description: meta.extra.description ?? '', place, status: meta.status, ...describeTex(content) }
    })
    // 맨 앞에 올 것부터, 그다음 이름순
    .sort((a, b) => (a.place === b.place ? a.name.localeCompare(b.name) : a.place === 'first' ? -1 : 1))
}

const PREAMBLE_NAME = /^(preamble|macros|notation|defs|definitions|commands)\.tex$/i
const SKIP_DIRS = new Set(['node_modules', 'workbench', 'build', 'dist', '.git'])

/** 연구 저장소 안에서 함께 쓸 만한 서식 파일을 찾는다 (두 단계 깊이까지) */
export function findRepoPreambles(repoRoot: string): string[] {
  const found: string[] = []
  const walk = (dir: string, depth: number) => {
    let entries: fs.Dirent[]
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      if (e.name.startsWith('.') || SKIP_DIRS.has(e.name)) continue
      const full = path.join(dir, e.name)
      if (e.isDirectory() && depth < 2) walk(full, depth + 1)
      else if (e.isFile() && PREAMBLE_NAME.test(e.name) && isLatexSafePath(full)) found.push(path.relative(repoRoot, full))
    }
  }
  walk(repoRoot, 0)
  return found.sort()
}
