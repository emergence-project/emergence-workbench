import fs from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'
import { frontMatter, isValidBlockId, isBlockStatus, parseBlock, parseList } from '@rw/core'
import { NOTE_CATEGORIES } from '@rw/core/contract/notes'
import { NOTE_STATES } from './noteMeta.js'
import { researchText } from './researchYaml.js'
import { readTopics } from './topics.js'
import { scanTasks } from './tasks.js'
import { isOutside } from './fsutil.js'
import { t } from './i18n.js'
import type { Workbench } from './workbench.js'

export interface WorkbenchDiagnostic { level: 'error' | 'warning'; file: string; line: number; message: string }
export interface WorkbenchCheck { files: number; diagnostics: WorkbenchDiagnostic[] }
const RESEARCH_KEYS = new Set(['title', 'question', 'started', 'agent-status', 'latex-macros', 'latex-template', 'image', 'concepts', 'topics', 'sources'])
const NOTE_KEYS = new Set(['name', 'from', 'description', 'state', 'resume', 'topics', 'concepts', 'kind', 'star'])
const BLOCK_KEYS = new Set(['id', 'created', 'title', 'status', 'blocked-reason', 'resume-condition', 'stopped-reason', 'parent', 'alternatives', 'next', 'concepts', 'topics', 'kind', 'description', 'star'])
const record = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {}
const list = (v: unknown): unknown[] => Array.isArray(v) ? v : v == null ? [] : [v]

/** 직접 고친 파일의 형식을 읽기만 한다. 앱이 넘어가는 값도 파일·줄로 남긴다 (docs/repo-format.md). */
export function checkWorkbench(wb: Workbench): WorkbenchCheck {
  const diagnostics: WorkbenchDiagnostic[] = []
  const files = new Set<string>()
  const rel = (abs: string) => path.relative(wb.repo, abs).split(path.sep).join('/')
  const issue = (level: WorkbenchDiagnostic['level'], file: string, line: number, ko: string, en: string) => diagnostics.push({ level, file, line, message: t(ko, en) })
  const read = (abs: string): string | undefined => {
    const file = rel(abs)
    try {
      if (!fs.lstatSync(abs).isFile()) {
        issue('error', file, 1, '일반 파일이 아닙니다. 링크·폴더는 읽지 않습니다.', 'Not a regular file. Links and folders are not read.')
        return undefined
      }
      files.add(file)
      const text = abs === wb.researchPath ? researchText(wb) : fs.readFileSync(abs, 'utf8')
      if (text.startsWith('\uFEFF')) issue('error', file, 1, '파일 앞의 BOM을 지우세요.', 'Remove the BOM at the start of the file.')
      return text
    } catch (e) {
      issue('error', file, 1, `파일을 읽지 못했습니다: ${(e as Error).message}`, `Could not read the file: ${(e as Error).message}`)
      return undefined
    }
  }
  const entries = (dir: string) => {
    try { return fs.readdirSync(dir, { withFileTypes: true }).filter((e) => !e.name.startsWith('.')) } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') issue('error', rel(dir), 1, '폴더를 읽지 못했습니다.', 'Could not read the folder.')
      return []
    }
  }
  const yaml = (file: string, text: string) => {
    const counter = new YAML.LineCounter()
    const doc = YAML.parseDocument(text, { lineCounter: counter, prettyErrors: false })
    for (const e of doc.errors) issue('error', file, counter.linePos(e.pos[0]).line, `YAML 오류: ${e.message}`, `YAML error: ${e.message}`)
    if (doc.errors.length) return undefined
    if (doc.contents !== null && !YAML.isMap(doc.contents)) {
      issue('error', file, 1, 'YAML은 키와 값의 지도로 적으세요.', 'YAML must be a map of keys and values.')
      return undefined
    }
    let data: Record<string, unknown>
    try { data = record(doc.toJSON()) } catch (e) {
      issue('error', file, 1, `YAML 오류: ${(e as Error).message}`, `YAML error: ${(e as Error).message}`)
      return undefined
    }
    // 값이 없는 키도 키 자체의 줄을 가리킨다.
    const line = (...keys: (string | number)[]) => {
      const parent = keys.length === 1 ? doc.contents : doc.getIn(keys.slice(0, -1), true)
      const key = keys.at(-1)
      const node = (YAML.isMap(parent) ? parent.items.find((p) => YAML.isScalar(p.key) && p.key.value === key)?.key : doc.getIn(keys, true)) ?? parent
      const pos = YAML.isNode(node) ? node.range?.[0] : undefined
      return pos === undefined ? 1 : counter.linePos(pos).line
    }
    return { data, line }
  }
  const researchFile = rel(wb.researchPath)
  const research = read(wb.researchPath)
  const y = research === undefined ? undefined : yaml(researchFile, research)
  const topicIds = new Set<string>()
  if (y) {
    for (const key of Object.keys(y.data)) if (!RESEARCH_KEYS.has(key)) issue('warning', researchFile, y.line(key), `모르는 research.yaml 키: ${key}`, `Unknown research.yaml key: ${key}`)
    const seen = new Set<string>()
    list(y.data.topics).forEach((v, i) => {
      const topic = record(v)
      if (typeof topic.title !== 'string' || !topic.title.trim()) issue('error', researchFile, y.line('topics', i, 'title'), '주제의 title이 필요합니다.', 'A topic title is required.')
      if (topic.id !== undefined) {
        if (typeof topic.id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(topic.id)) issue('error', researchFile, y.line('topics', i, 'id'), '주제 id는 [a-z0-9][a-z0-9-]* 모양으로 적으세요.', 'Topic id must match [a-z0-9][a-z0-9-]*.')
        else {
          if (seen.has(topic.id)) issue('error', researchFile, y.line('topics', i, 'id'), `같은 주제 id가 두 번 있습니다: ${topic.id}`, `Duplicate topic id: ${topic.id}`)
          seen.add(topic.id)
        }
      }
    })
    for (const topic of readTopics(wb)) topicIds.add(topic.id)
    for (const source of list(record(y.data.sources).manuscript)) {
      const file = typeof source === 'string' ? source.split(/\s+[—-]\s+/)[0]!.trim() : ''
      const abs = path.resolve(wb.repo, file)
      if (!file.endsWith('.tex') || isOutside(path.relative(wb.repo, abs)) || !fs.existsSync(abs) || !fs.statSync(abs).isFile()) issue('warning', researchFile, y.line('sources', 'manuscript'), `sources.manuscript는 있는 .tex 파일이어야 합니다: ${file}`, `sources.manuscript must reference an existing .tex file: ${file}`)
    }
  }
  const checkTopics = (file: string, line: number, ids: unknown[]) => {
    for (const id of ids) if (!topicIds.has(String(id))) issue('warning', file, line, `research.yaml에 없는 주제 id: ${String(id)}`, `Topic id not in research.yaml: ${String(id)}`)
  }
  for (const folder of ['notes', 'calc']) for (const entry of entries(path.join(wb.root, folder))) {
    if (!entry.isDirectory()) continue
    const dir = path.join(wb.root, folder, entry.name)
    const meta = path.join(dir, 'note.yaml')
    const file = rel(meta)
    if (!fs.existsSync(path.join(dir, 'note.md')) && !fs.existsSync(path.join(dir, 'main.tex'))) issue('warning', file, 1, '폴더에 note.md도 main.tex도 없습니다.', 'The folder has neither note.md nor main.tex.')
    for (const body of ['note.md', 'main.tex']) if (fs.existsSync(path.join(dir, body))) {
      const text = read(path.join(dir, body))
      if (body === 'note.md' && text !== undefined && (frontMatter(text) || /^---[ \t]*(?:\r?\n|$)/.test(text))) issue('warning', rel(path.join(dir, body)), 1, 'note.md 머리말은 읽지 않는다. 노트 정보는 note.yaml에 적으세요.', 'note.md front matter is not read. Put note metadata in note.yaml.')
    }
    if (!fs.existsSync(meta)) continue
    const text = read(meta)
    const n = text === undefined ? undefined : yaml(file, text)
    if (!n) continue
    const { data, line } = n
    if ('status' in data) issue('error', file, line('status'), 'note.yaml은 `state:`를 쓴다. `status:`는 블록 노트 머리의 키입니다.', 'note.yaml uses `state:`. `status:` is a block note header key.')
    if ('state' in data && (!NOTE_STATES.some((state) => state === data.state) || data.state === 'active')) issue('error', file, line('state'), 'state는 paused · stopped · done 중 하나입니다. 진행이면 키를 두지 않는다.', 'state must be paused · stopped · done. Omit the key for an active note.')
    for (const key of Object.keys(data)) if (!NOTE_KEYS.has(key) && key !== 'status') {
      const replacement = key === 'summary' ? 'description' : key === 'done' ? 'state: done' : undefined
      issue('warning', file, line(key), replacement ? `옛 키 ${key} 대신 ${replacement}을 쓰세요.` : `모르는 note.yaml 키: ${key}`, replacement ? `Use ${replacement} instead of legacy key ${key}.` : `Unknown note.yaml key: ${key}`)
    }
    if ('resume' in data) {
      if (data.state !== 'paused' && data.state !== 'stopped') issue('warning', file, line('resume'), 'resume은 멈춤·폐기 노트에만 적습니다.', 'resume is only for paused or stopped notes.')
      if (typeof data.resume === 'string' && data.resume.length > 300) issue('warning', file, line('resume'), 'resume은 300자까지입니다.', 'resume is limited to 300 characters.')
    }
    if ('kind' in data && ![...NOTE_CATEGORIES, 'none'].some((kind) => kind === data.kind)) issue('error', file, line('kind'), 'kind는 proof calc check summary explore design none 중 하나입니다.', 'kind must be proof calc check summary explore design none.')
    checkTopics(file, line('topics'), list(data.topics))
  }
  const blocks = entries(wb.blocksDir).filter((e) => /\.(md|tex)$/.test(e.name))
  const names = new Set(blocks.map((e) => e.name))
  for (const entry of blocks) {
    const file = rel(path.join(wb.blocksDir, entry.name))
    const id = entry.name.replace(/\.(md|tex)$/, '')
    if (!isValidBlockId(id)) issue('error', file, 1, '파일 이름이 블록 id 모양이 아닙니다 (소문자·숫자·하이픈, 80자까지).', 'Filename is not a block id (lowercase letters, digits, hyphens, up to 80 characters).')
    if (entry.name.endsWith('.md') && names.has(`${id}.tex`)) issue('warning', file, 1, `같은 id의 .md·.tex가 함께 있습니다. .md가 이긴다: ${id}`, `Both .md and .tex exist for ${id}; .md takes precedence.`)
    const text = read(path.join(wb.blocksDir, entry.name))
    if (text === undefined) continue
    const parsed = parseBlock(text)
    const rows = text.split(/\r?\n/)
    if (/^(?:%\s*)?---\s*$/.test(rows[0]!) && !parsed.hasHeader) issue('error', file, 1, '블록 머리가 80줄 안에서 닫히지 않았거나 % 줄 형식이 깨졌습니다.', 'Block header is not closed within 80 lines or has invalid % lines.')
    if (!parsed.hasHeader) continue
    const header = rows.slice(1, parsed.bodyStartLine - 2).map((row) => row.replace(/^%\s?/, ''))
    const line = (key: string) => { const i = header.findIndex((row) => /^([a-z][a-z0-9_-]*)\s*:/.exec(row)?.[1] === key); return i < 0 ? 1 : i + 2 }
    const { meta } = parsed
    if (meta.id !== undefined && meta.id !== id) issue('error', file, line('id'), '머리 id가 파일 이름과 다릅니다.', 'Header id differs from the filename.')
    if (meta.status !== undefined && !isBlockStatus(meta.status)) issue('error', file, line('status'), 'status는 in-progress · blocked · stopped · solved 중 하나입니다. 앱은 틀린 값을 진행으로 읽습니다.', 'status must be in-progress · blocked · stopped · solved. The app treats invalid values as in-progress.')
    if (meta.status === 'blocked') for (const [key, value] of [['blocked-reason', meta.blockedReason], ['resume-condition', meta.resumeCondition]]) if (!value) issue('warning', file, line('status'), `blocked이면 ${key}이 필요합니다.`, `${key} is required for blocked notes.`)
    if (meta.status === 'stopped' && !meta.stoppedReason) issue('warning', file, line('status'), 'stopped이면 stopped-reason이 필요합니다.', 'stopped-reason is required for stopped notes.')
    header.forEach((row, i) => {
      const key = /^([a-z][a-z0-9_-]*)\s*:/.exec(row)?.[1]
      if (!key) return
      if (key.includes('_')) issue('warning', file, i + 2, `키에 _ 대신 -를 쓰세요: ${key}`, `Use - instead of _ in key: ${key}`)
      if (BLOCK_KEYS.has(key) && /^[a-z][a-z0-9-]*\s*:\s*$/.test(row)) {
        const more: string[] = []
        for (let j = i + 1; j < header.length; j++) {
          if (!header[j]!.trim()) continue
          if (/^\s/.test(header[j]!) || /^-\s/.test(header[j]!)) more.push(header[j]!); else break
        }
        if (more.some((v) => /^\s*-\s/.test(v))) issue('error', file, i + 2, `${key}는 여러 줄 목록 대신 한 줄 [a, b]로 적으세요. 앱은 목록을 []로 읽습니다.`, `Write ${key} as a single-line [a, b], not a multiline list. The app reads it as [].`)
      }
    })
    checkTopics(file, line('topics'), parseList(meta.extra.topics ?? ''))
  }
  for (const entry of entries(path.join(wb.root, 'tasks'))) if (entry.name.endsWith('.md') && entry.isFile()) read(path.join(wb.root, 'tasks', entry.name))
  diagnostics.push(...scanTasks(wb).diagnostics.map(({ file, line, message }) => ({ level: 'error' as const, file, line, message })))
  return { files: files.size, diagnostics }
}
