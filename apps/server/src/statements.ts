import fs from 'node:fs'
import path from 'node:path'
import { parseBlock, parseList } from '@rw/core'
import { hashOf, writeAtomic } from './fsutil.js'
import { WorkbenchError, type SaveResult } from './workbench.js'
import { t } from './i18n.js'

/**
 * 진술: "무엇이 참인가" — 정의·공리·보조정리·명제·정리. 노트의 한 종류.
 * 저장소가 이미 진술 폴더를 갖고 있으면(예: statements/) 앱은 그 파일을 그대로 읽고 고친다. 옮기거나 복사하지 않는다.
 * 머리말 형식은 블록과 같다:
 *   % id: skk-cor-distance-preservation
 *   % kind: corollary            (axiom · definition · lemma · proposition · corollary · theorem)
 *   % label: Corollary 3.9.1
 *   % title: Distance preservation
 *   % uses: [skk-prop-elementary-step]   사용 — 이 진술이 기대는 진술
 *   % proofs: [distance-preservation]    증명 — 이 진술을 증명하는 유도(workbench/blocks/의 id)
 *   % source: sampletesterexample2020kempe       인용 — refs.bib 키
 *   % page: 16
 */
export interface Statement {
  id: string
  kind: string
  label?: string
  title?: string
  uses: string[]
  proofs: string[]
  source?: string
  page?: string
  /** 저장소 기준 파일 경로 */
  file: string
  mtime: number
  hash: string
}

/** 진술 폴더로 보는 이름 (저장소 맨 위). 처음 찾은 것을 쓴다 */
export const STATEMENT_DIRS = ['statements']
const SKIP = new Set(['preamble.tex'])
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

export function statementsDir(wbRoot: string): string | null {
  const repo = path.dirname(wbRoot)
  for (const d of STATEMENT_DIRS) {
    const p = path.join(repo, d)
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) return p
  }
  return null
}

export function listStatements(wbRoot: string): Statement[] {
  const dir = statementsDir(wbRoot)
  if (!dir) return []
  const repo = path.dirname(wbRoot)
  return fs.readdirSync(dir).filter((f) => f.endsWith('.tex') && !SKIP.has(f)).sort().map((f) => {
    const file = path.join(dir, f)
    const content = fs.readFileSync(file, 'utf8')
    const { meta } = parseBlock(content)
    const x = meta.extra
    return {
      id: meta.id ?? f.slice(0, -4),
      kind: x.kind ?? 'statement',
      label: x.label,
      title: meta.title,
      uses: x.uses ? parseList(x.uses) : [],
      proofs: x.proofs ? parseList(x.proofs) : [],
      source: x.source,
      page: x.page,
      file: path.relative(repo, file),
      mtime: fs.statSync(file).mtimeMs,
      hash: hashOf(content),
    }
  })
}

function statementFile(wbRoot: string, id: string): string {
  if (!ID.test(id)) throw new WorkbenchError(400, t(`진술 id가 올바르지 않음: ${id}`, `Invalid statement id: ${id}`))
  const dir = statementsDir(wbRoot)
  if (!dir) throw new WorkbenchError(404, t('이 저장소에는 진술 폴더(statements/)가 없음', 'This repository has no statements folder (statements/)'))
  // 파일 이름이 id와 다를 수 있다 (머리말 id가 정본)
  const hit = listStatements(wbRoot).find((s) => s.id === id)
  const file = hit ? path.join(path.dirname(wbRoot), hit.file) : path.join(dir, `${id}.tex`)
  if (!fs.existsSync(file)) throw new WorkbenchError(404, t(`진술이 없음: ${id}`, `No such statement: ${id}`))
  return file
}

export function readStatement(wbRoot: string, id: string): { content: string; hash: string; file: string } {
  const file = statementFile(wbRoot, id)
  const content = fs.readFileSync(file, 'utf8')
  return { content, hash: hashOf(content), file: path.relative(path.dirname(wbRoot), file) }
}

/** 블록과 같은 안전장치: 읽은 뒤 바깥(에이전트·다른 편집기)에서 바뀌었으면 덮어쓰지 않는다 */
export function writeStatement(wbRoot: string, id: string, content: string, baseHash: string): SaveResult {
  const file = statementFile(wbRoot, id)
  const current = hashOf(fs.readFileSync(file, 'utf8'))
  if (current !== baseHash) return { ok: false, currentHash: current }
  writeAtomic(file, content)
  return { ok: true, content, hash: hashOf(content) }
}
