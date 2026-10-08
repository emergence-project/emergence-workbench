import chokidar, { type FSWatcher } from 'chokidar'
import fs from 'node:fs'
import path from 'node:path'
import { parseBlock } from '@rw/core'
import { hashOf } from './fsutil.js'
import { statementsDir } from './statements.js'

/**
 * workbench 파일 변경 알림. 에이전트나 다른 편집기가 파일을 바꾸면 화면이 알 수 있게 한다.
 * AAD의 VaultWatcher(apps/backend/src/adapters/filesystem/VaultWatcher.ts)에서 방법만 가져왔다:
 * 쓰기가 끝날 때까지 기다리기, 숨김·임시 파일 무시, 내용 해시 전달.
 * 화면은 자기가 아는 해시와 비교해, 자기가 저장한 변경인지 바깥 변경인지 가린다.
 */
type Target =
  | { type: 'block'; id: string }
  | { type: 'journal'; date: string }
  | { type: 'research' }
  | { type: 'preamble' }
  | { type: 'comments'; target: string }
  | { type: 'tasks'; id: string }
  | { type: 'note'; file: string }

export type WorkbenchEvent =
  | { type: 'block'; research: string; id: string; hash: string | null }
  | { type: 'journal'; research: string; date: string }
  | { type: 'research'; research: string }
  | { type: 'preamble'; research: string }
  | { type: 'statement'; research: string; id: string; hash: string | null }
  | { type: 'comments'; research: string; target: string }
  | { type: 'tasks'; research: string; id: string }
  /** 노트 파일(workbench/notes/…, workbench/calc/…). file은 저장소 기준 경로(원고 화면의 file과 같다) */
  | { type: 'note'; research: string; file: string; hash: string | null }
  /** research.yaml sources의 파일(작업 목록·검토 문서·참고문헌)이 바뀜. 작업 탭·개괄이 다시 읽는다 */
  | { type: 'sources'; research: string }
  /** 공용 라이브러리(research-library) 파일이 바뀜. 어느 프로젝트의 것도 아니다. file은 라이브러리 기준 경로 */
  | { type: 'library'; research: null; part: 'concepts' | 'figures' | 'papers'; file: string }

/** workbench 안의 어떤 파일인지. 알림 대상이 아니면 null */
export function classify(root: string, file: string): Target | null {
  const rel = path.relative(root, file).split(path.sep)
  if (rel.some((p) => p.startsWith('.'))) return null
  const [a, b] = rel
  if (rel.length === 2 && a === 'blocks' && /\.(tex|md)$/.test(b!)) return { type: 'block', id: b!.replace(/\.(tex|md)$/, '') }
  if (rel.length === 2 && a === 'log') {
    const m = /^(\d{4}-\d{2}-\d{2})\.md$/.exec(b!)
    return m ? { type: 'journal', date: m[1]! } : null
  }
  if (rel.length === 2 && a === 'comments' && b!.endsWith('.md')) return { type: 'comments', target: b!.slice(0, -3) }
  if (rel.length === 2 && a === 'tasks' && b!.endsWith('.md')) return { type: 'tasks', id: b!.slice(0, -3) }
  if (rel.length === 1 && a === 'research.yaml') return { type: 'research' }
  if (rel.length === 1 && a === 'preamble.tex') return { type: 'preamble' }
  if ((a === 'notes' || a === 'calc') && rel.length >= 2 && /\.(md|tex|ya?ml)$/.test(rel[rel.length - 1]!)) {
    return { type: 'note', file: ['workbench', ...rel].join('/') }
  }
  return null
}

export function watchWorkbench(research: string, root: string, emit: (e: WorkbenchEvent) => void): FSWatcher {
  // 저장소의 진술 폴더(statements/)도 함께 본다
  const stmts = statementsDir(root)
  const bases = stmts ? [root, stmts] : [root]
  const watcher = chokidar.watch(bases, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 },
    ignored: (file) => {
      const base = bases.find((b) => file === b || file.startsWith(b + path.sep))
      const rel = base ? path.relative(base, file) : ''
      return rel !== '' && rel.split(path.sep).some((p) => p.startsWith('.'))
    },
  })
  watcher.on('all', (event, file) => {
    if (event !== 'add' && event !== 'change' && event !== 'unlink') return
    if (stmts && file.startsWith(stmts + path.sep)) {
      if (!file.endsWith('.tex') || path.dirname(file) !== stmts) return
      const content = event === 'unlink' || !fs.existsSync(file) ? null : fs.readFileSync(file, 'utf8')
      const id = (content && parseBlock(content).meta.id) || path.basename(file, '.tex')
      return emit({ type: 'statement', research, id, hash: content === null ? null : hashOf(content) })
    }
    const t = classify(root, file)
    if (!t) return
    const hash = () => (event === 'unlink' || !fs.existsSync(file) ? null : hashOf(fs.readFileSync(file, 'utf8')))
    if (t.type === 'block') {
      emit({ type: 'block', research, id: t.id, hash: hash() })
    } else if (t.type === 'note') {
      emit({ type: 'note', research, file: t.file, hash: hash() })
    } else {
      emit({ ...t, research })
    }
  })
  return watcher
}
