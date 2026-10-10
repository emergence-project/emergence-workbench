import fs from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'
import { readSubjects, validateSubjects } from './subjects.js'
import { hashOf, localDate, writeAtomic } from './fsutil.js'
import { WorkbenchError } from './workbench.js'
import { t } from './i18n.js'
import { frontMatter } from '@rw/core'

/**
 * Markdown 개념노트 — research-library/concepts/<id>.md (2026-10-04 개념노트 재설계).
 * Study(Obsidian)의 Concept-Space를 옮겨 오고, 앞으로 앱이 원본을 맡는다.
 * - 머리말(YAML): title, aliases, subject(분류, "Mathematics › Graph Theory"), study(옮겨 온 Study 노트),
 *   checked { at, hash } (사람이 "확인함"을 누른 때와 그때 본문의 해시), locked(고치기 잠금, 에이전트도 고치지 않음).
 * - 본문: Markdown + KaTeX 수식. 기호 모음은 concepts/macros.tex 하나를 앱 화면과 PDF가 함께 쓴다.
 * - 상태는 손으로 매기지 않는다: "미완성"은 본문을 보고 자동으로, 사람이 하는 것은 "확인함" 하나.
 *   확인한 뒤 본문이 바뀌면 "확인 뒤 고침"이 된다.
 * 머리말을 고칠 때 본문 바이트는 그대로 둔다.
 */
export type { CheckState, ConceptMeta, ConceptMd } from '@rw/core/contract/concepts'
import type { CheckState, ConceptMeta, ConceptMd, ConceptMemo } from '@rw/core/contract/concepts'

const ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
export const CONCEPTS_DIR = 'concepts'
export const MACROS_FILE = 'concepts/macros.tex'

/** 머리말과 본문을 나눈다. 머리말이 없으면 본문 전체 */
export function splitFrontmatter(raw: string): { fm: Record<string, unknown>; fmText: string | null; body: string } {
  const f = frontMatter(raw)
  if (!f) return { fm: {}, fmText: null, body: raw }
  let fm: Record<string, unknown> = {}
  try { const v = YAML.parse(f.yaml); if (v && typeof v === 'object' && !Array.isArray(v)) fm = v as Record<string, unknown> } catch { /* 깨진 머리말은 비어 있는 것으로 */ }
  return { fm, fmText: f.yaml, body: f.body }
}

const strs = (v: unknown) => (Array.isArray(v) ? v : typeof v === 'string' ? [v] : []).filter((a): a is string => typeof a === 'string' && !!a.trim()).map((a) => a.trim())
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)

export function metaOf(fm: Record<string, unknown>, id: string): ConceptMeta {
  const c = fm.checked as Record<string, unknown> | undefined
  const at = c && typeof c === 'object' ? str(c.at) ?? (c.at instanceof Date ? c.at.toISOString().slice(0, 10) : undefined) : undefined
  return {
    title: str(fm.title) ?? id,
    aliases: strs(fm.aliases),
    subject: str(fm.subject),
    subjects: Array.isArray(fm.subjects) ? fm.subjects as string[] : [],
    study: str(fm.study),
    checked: c && typeof c === 'object' && str(c.hash) ? { at: at ?? '', hash: str(c.hash)! } : undefined,
    locked: fm.locked === true,
    ...(fm.review === 'todo' && { review: 'todo' as const }),
    sources: strs(fm.sources),
    related: strs(fm.related).map((r) => r.replace(/^\[\[|\]\]$/g, '')),
    sourcesUnsorted: strs(fm.sources_unsorted),
  }
}

export const bodyHash = (body: string) => hashOf(body.replace(/\r\n/g, '\n').trim())

export function checkStateOf(meta: ConceptMeta, body: string): CheckState {
  if (!meta.checked) return 'none'
  return meta.checked.hash === bodyHash(body) ? 'ok' : 'changed'
}

const TODO = /\bTODO\b|\bTBD\b|\bFIXME\b|작성\s?중|작성\s?예정|\[!todo\]/i
/** 체크하지 않은 할 일 상자 (- [ ] · * [ ] · + [ ], 10/6 승인: TODO와 같은 갈래로 센다) */
const TASK = /^\s*[-*+]\s+\[ \]/
/** 미완성 이유 ①: 저장 값이자 판정 표시다. 화면에 보일 때만 번역한다(이 문자열을 바꾸면 빈 노트 판정이 꺼진다) */
export const EMPTY_NOTE = '제목·틀뿐'

/**
 * 미완성인 이유 (없으면 빈 배열). 기계적으로만 판단한다 (10/04 사용자 확인, 10/6 "지식 점검 기준"):
 * ① 노트 전체가 제목·틀뿐 ② 제목(#) 아래 본문이 빈 절 ③ TODO·작성 중 표시나 체크하지 않은 할 일 상자가 남음.
 * 코드 블록과 표시 수식 안은 보지 않는다. "맨 위에 무엇인지부터" 같은 내용 규칙은 research-library README(규칙 4)가 맡고
 * 여기서 판정하지 않는다 (예전 "Definition 절 없음"은 10/6에 뺐다: 내용 있는 노트 대부분이 걸리는 잡음).
 */
export function unfinishedReasons(body: string): string[] {
  const text = body.replace(/\r\n/g, '\n').replace(/```[\s\S]*?```/g, '[code]').replace(/\$\$[\s\S]+?\$\$/g, '[math]')
  const lines = text.split('\n')
  const heading = (l: string) => /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(l)
  const prose = lines.filter((l) => !heading(l) && !/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(l)).join(' ').replace(/\s+/g, ' ').trim()
  if (prose.length < 40) return [EMPTY_NOTE]
  const out: string[] = []
  const empty: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const h = heading(lines[i]!)
    if (!h) continue
    const level = h[1]!.length
    let j = i + 1
    while (j < lines.length && !heading(lines[j]!) && !lines[j]!.trim()) j++
    const next = j < lines.length ? heading(lines[j]!) : null
    // 바로 다음이 같은 깊이 이상의 제목(또는 끝)이면 빈 절. 더 깊은 제목이면 그 아래를 본다
    if (j >= lines.length || (next && next[1]!.length <= level)) empty.push(h[2]!.trim() || '(제목 없음)')
  }
  if (empty.length) out.push(`빈 절: ${empty.join(', ')}`)
  if (lines.some((l) => TODO.test(l) || TASK.test(l))) out.push('TODO·작성 중 표시')
  return out
}

/** 출처가 있는가: 머리말 sources: 또는 본문 인용 [@키] (지식 점검 "출처 없음") */
export function hasSource(meta: Pick<ConceptMeta, 'sources'>, body: string): boolean {
  return meta.sources.length > 0 || inlineCites(body).length > 0
}

function noteFile(lib: string | undefined, id: string): string {
  if (!lib) throw new WorkbenchError(404, t('공유 라이브러리가 설정되지 않았음', 'No shared library is set'))
  if (!ID.test(id)) throw new WorkbenchError(400, t(`id가 올바르지 않음: ${id}`, `Invalid id: ${id}`))
  return path.join(lib, CONCEPTS_DIR, `${id}.md`)
}

export function conceptMdExists(lib: string | undefined, id: string): boolean {
  try { return fs.existsSync(noteFile(lib, id)) } catch { return false }
}

function parse(id: string, raw: string): ConceptMd {
  const { fm, body } = splitFrontmatter(raw)
  const meta = metaOf(fm, id)
  return { id, meta, body, hash: hashOf(raw), unfinished: unfinishedReasons(body), checked: checkStateOf(meta, body) }
}

export function listConceptMd(lib: string | undefined): (ConceptMd & { mtime: number })[] {
  if (!lib) return []
  const dir = path.join(lib, CONCEPTS_DIR)
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir).filter((f) => f.endsWith('.md') && !f.endsWith(MEMO_SUFFIX) && !f.startsWith('.') && ID.test(f.slice(0, -3)) && f !== 'README.md').sort().map((f) => {
    const file = path.join(dir, f)
    return { ...parse(f.slice(0, -3), fs.readFileSync(file, 'utf8')), mtime: fs.statSync(file).mtimeMs }
  })
}

/** 본문의 [@키] (Pandoc 꼴: [@a; @b], [see @a, p. 3]) */
export function inlineCites(body: string): string[] {
  const keys: string[] = []
  // 코드·수식 안은 보지 않는다. \[@…]는 글자 그대로, [글](주소)는 링크
  const text = body.replace(/```[\s\S]*?```/g, '').replace(/\$\$[\s\S]+?\$\$/g, '').replace(/\$[^$\n]+\$/g, '')
  for (const m of text.matchAll(/(?<!\\)\[([^\[\]]*@[^\[\]]*)\](?!\()/g)) for (const k of m[1]!.matchAll(/(?:^|[\s;])-?@([A-Za-z0-9_:.\-]*[A-Za-z0-9_])/g)) if (!keys.includes(k[1]!)) keys.push(k[1]!)
  return keys
}

export function readConceptMd(lib: string | undefined, id: string): ConceptMd {
  const file = noteFile(lib, id)
  if (!fs.existsSync(file)) throw new WorkbenchError(404, t(`개념노트가 없음: ${id}`, `No such concept note: ${id}`))
  return parse(id, fs.readFileSync(file, 'utf8'))
}

/**
 * 본문만 고친다 (앱의 "고치기"). 머리말 글자는 그대로 둔다.
 * 잠긴 노트는 고치지 않고, baseHash가 지금 파일과 다르면 덮지 않는다.
 */
export function writeConceptBody(lib: string | undefined, id: string, body: string, baseHash: string): ConceptMd {
  const file = noteFile(lib, id)
  if (!fs.existsSync(file)) throw new WorkbenchError(404, t(`개념노트가 없음: ${id}`, `No such concept note: ${id}`))
  const raw = fs.readFileSync(file, 'utf8')
  if (hashOf(raw) !== baseHash) throw new WorkbenchError(409, t('다른 곳에서 파일이 바뀌어 저장하지 않았음. 다시 읽어 주세요', 'Not saved: the file was changed elsewhere. Read it again'))
  const { fm, body: old } = splitFrontmatter(raw)
  if (metaOf(fm, id).locked) throw new WorkbenchError(423, t('잠긴 노트는 고치지 않음. 잠금을 먼저 풀어 주세요', 'Locked notes are not changed. Unlock it first'))
  if (body === old) return parse(id, raw)
  const head = raw.slice(0, raw.length - old.length)
  const next = head + body
  writeAtomic(file, next)
  return parse(id, next)
}

/**
 * 머리말만 고친다 (본문 바이트는 그대로). baseHash가 지금 파일과 다르면 고치지 않는다 (바깥 수정을 덮지 않게).
 * 머리말의 다른 키와 순서는 YAML 문서로 읽어 그대로 둔다.
 */
function patchFrontmatter(lib: string | undefined, id: string, baseHash: string, edit: (doc: YAML.Document, body: string) => void): ConceptMd {
  const file = noteFile(lib, id)
  if (!fs.existsSync(file)) throw new WorkbenchError(404, t(`개념노트가 없음: ${id}`, `No such concept note: ${id}`))
  const raw = fs.readFileSync(file, 'utf8')
  if (hashOf(raw) !== baseHash) throw new WorkbenchError(409, t('다른 곳에서 파일이 바뀌어 고치지 않았음. 다시 읽어 주세요', 'Not changed: the file was changed elsewhere. Read it again'))
  const { fmText, body } = splitFrontmatter(raw)
  const doc = YAML.parseDocument(fmText ?? '')
  if (doc.errors.length) throw new WorkbenchError(422, t('머리말을 읽지 못해 고치지 않았습니다', 'Not changed: could not read the front matter'))
  if (!YAML.isMap(doc.contents)) doc.contents = doc.createNode({}) as never
  edit(doc, body)
  const next = `---\n${doc.toString().replace(/\n*$/, '\n')}---\n${body}`
  writeAtomic(file, next)
  return parse(id, next)
}

/** Classification edits never rewrite body bytes or checked metadata. */
export function setConceptSubjects(lib: string | undefined, id: string, value: unknown, baseHash: string): ConceptMd {
  const subjects = validateSubjects(lib, value)
  return patchFrontmatter(lib, id, baseHash, (doc) => doc.set('subjects', doc.createNode(subjects)))
}

/** "확인함" 켜기·끄기. 켜면 지금 본문의 해시를 적어 둔다 */
export function setConceptChecked(lib: string | undefined, id: string, on: boolean, baseHash: string): ConceptMd {
  return patchFrontmatter(lib, id, baseHash, (doc, body) => {
    if (on) doc.set('checked', doc.createNode({ at: localDate(), hash: bodyHash(body) }))
    else doc.delete('checked')
  })
}

/**
 * 사용자 확인 고르기 (10/4 사용자: "승인/검토 예정 등의 사용자 확인도 문서 정보에서 선택").
 * none: 표시 없음 · todo: 검토 예정(review: todo) · ok: 확인함(checked, 지금 본문 해시). 셋 중 하나만 머리말에 남긴다.
 */
export type ReviewChoice = 'none' | 'todo' | 'ok'
export function setConceptReview(lib: string | undefined, id: string, choice: ReviewChoice, baseHash: string): ConceptMd {
  return patchFrontmatter(lib, id, baseHash, (doc, body) => {
    if (choice === 'ok') doc.set('checked', doc.createNode({ at: localDate(), hash: bodyHash(body) }))
    else doc.delete('checked')
    if (choice === 'todo') doc.set('review', 'todo')
    else doc.delete('review')
  })
}

/** 고치기 잠금 켜기·끄기 */
export function setConceptLocked(lib: string | undefined, id: string, on: boolean, baseHash: string): ConceptMd {
  return patchFrontmatter(lib, id, baseHash, (doc) => {
    if (on) doc.set('locked', true)
    else doc.delete('locked')
  })
}

// ---------- 새 개념노트 (기본 양식) ----------

/**
 * 개념노트 기본 양식 (10/4 17:09 사용자: "필수로 ## Definition 섹션은 두고 싶어", 나머지 절은 제안대로 두고 나중에 바꿀 수 있다).
 * Definition(필수) → Properties(성질마다 번호, 바로 아래 접히는 Proof) → Examples. Remarks는 쓸 때만 ("/" 메뉴).
 */
export const CONCEPT_TEMPLATE = ['## Definition', '', '## Properties', '', '1. ', '', '**Proof.** ∎', '', '## Examples', ''].join('\n')

/** 새 Markdown 개념노트. Study에서 가져오면 원문은 본문이 아니라 옆 메모에 재료로 둔다 */
export function createConceptMd(lib: string | undefined, id: string, input: { title: string; study?: { path: string; text: string }; subject?: string; body?: string; fm?: Record<string, unknown> }): { id: string } {
  const file = noteFile(lib, id)
  if (fs.existsSync(file)) throw new WorkbenchError(409, t(`이미 있는 개념노트: ${id}`, `Concept note already exists: ${id}`))
  const idsModel = readSubjects(lib).enabled
  if (idsModel && input.fm?.subjects !== undefined) validateSubjects(lib, input.fm.subjects)
  const fields = { title: input.title, ...(input.subject && !idsModel && { subject: input.subject }), ...(input.study && { study: input.study.path }), ...input.fm } as Record<string, unknown>
  if (idsModel) { delete fields.subject; fields.subjects ??= [] }
  const fm = YAML.stringify(fields).trimEnd()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  writeAtomic(file, `---\n${fm}\n---\n# ${input.title}\n\n${input.body ?? CONCEPT_TEMPLATE}`)
  if (input.study) writeAtomic(memoFile(lib, id), `- [ ] Study 원문을 본문 양식으로 옮기고 이 재료를 지우기\n\n## Study 원문 (${input.study.path})\n\n${input.study.text.trim()}\n`)
  return { id }
}

// ---------- 메모 (concepts/<id>.memo.md) ----------

/**
 * 노트마다 본문 밖에 두는 메모: 할 일(- [ ] …), 열린 질문, 코멘트, 작업 지침 (2026-10-04 사용자 코멘트: 지침·코멘트는 본문에 적지 않는다).
 * 본문·PDF·"미완성" 판단에 들어가지 않고, 노트가 잠겨도 고칠 수 있다. 비우면 파일을 지운다.
 */
export const MEMO_SUFFIX = '.memo.md'

export type { ConceptMemo } from '@rw/core/contract/concepts'

function memoFile(lib: string | undefined, id: string): string {
  return noteFile(lib, id).replace(/\.md$/, MEMO_SUFFIX)
}

export function readConceptMemo(lib: string | undefined, id: string): ConceptMemo {
  if (!conceptMdExists(lib, id)) throw new WorkbenchError(404, t(`개념노트가 없음: ${id}`, `No such concept note: ${id}`))
  const file = memoFile(lib, id)
  const raw = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
  // 화면은 줄을 \n으로 나눠 하이라이트를 찾는다. 다른 편집기가 CRLF로 저장해도 하이라이트가 사라지지 않게 글은 \n으로 준다
  // (hash는 파일 그대로의 것이라 baseHash 확인은 바뀌지 않는다)
  return { id, text: raw.replace(/\r\n/g, '\n'), hash: hashOf(raw), exists: fs.existsSync(file) }
}

/** 메모를 통째로 쓴다. baseHash가 지금 메모와 다르면 쓰지 않는다 (바깥 수정을 덮지 않게) */
export function writeConceptMemo(lib: string | undefined, id: string, text: string, baseHash: string): ConceptMemo {
  const now = readConceptMemo(lib, id)
  if (now.hash !== baseHash) throw new WorkbenchError(409, t('다른 곳에서 메모가 바뀌어 고치지 않았음. 다시 읽어 주세요', 'Not changed: the memo was changed elsewhere. Read it again'))
  const file = memoFile(lib, id)
  const next = text.trim() ? text.replace(/\s*$/, '\n') : ''
  if (next) writeAtomic(file, next)
  else if (fs.existsSync(file)) fs.rmSync(file)
  return readConceptMemo(lib, id)
}

// ---------- 기호 모음 (concepts/macros.tex) ----------

/** {…} 하나를 읽는다 (중괄호 짝 맞춤). i는 '{' 위치 */
function group(s: string, i: number): { text: string; end: number } | null {
  if (s[i] !== '{') return null
  let depth = 0
  for (let j = i; j < s.length; j++) {
    const c = s[j]
    if (c === '\\') { j++; continue }
    if (c === '{') depth++
    else if (c === '}' && --depth === 0) return { text: s.slice(i + 1, j), end: j + 1 }
  }
  return null
}

/**
 * \newcommand·\renewcommand·\providecommand·\DeclareMathOperator 줄을 KaTeX macros로.
 * 인자 수([n])는 KaTeX가 정의 속 #n으로 알아서 센다. 주석(%)은 뺀다.
 */
export function parseMacros(tex: string): Record<string, string> {
  const s = tex.split('\n').map((l) => l.replace(/(?<!\\)%.*$/, '')).join('\n')
  const out: Record<string, string> = {}
  const re = /\\(newcommand|renewcommand|providecommand|DeclareMathOperator)(\*?)\s*/g
  let m: RegExpExecArray | null
  while ((m = re.exec(s))) {
    let i = re.lastIndex
    let name: string | undefined
    if (s[i] === '{') { const g = group(s, i); if (!g) continue; name = g.text.trim(); i = g.end } else { const n = /^\\[A-Za-z]+/.exec(s.slice(i)); if (!n) continue; name = n[0]; i += n[0].length }
    if (!name?.startsWith('\\')) continue
    while (/\s/.test(s[i] ?? '')) i++
    if (m[1] !== 'DeclareMathOperator') while (s[i] === '[') { const e = s.indexOf(']', i); if (e < 0) break; i = e + 1; while (/\s/.test(s[i] ?? '')) i++ }
    const body = group(s, i)
    if (!body) continue
    out[name] = m[1] === 'DeclareMathOperator' ? `\\operatorname${m[2] ? '*' : ''}{${body.text}}` : body.text
    re.lastIndex = body.end
  }
  return out
}

export function readMacros(lib: string | undefined): { file: string; exists: boolean; macros: Record<string, string> } {
  const abs = lib ? path.join(lib, MACROS_FILE) : ''
  const exists = !!lib && fs.existsSync(abs)
  return { file: MACROS_FILE, exists, macros: exists ? parseMacros(fs.readFileSync(abs, 'utf8')) : {} }
}

/** 개념노트 그림: concepts/attachments/<이름> (옮겨 온 Obsidian 그림도 여기에). 그림만 */
const IMAGE = /\.(png|jpe?g|gif|svg|webp)$/i
export function conceptAsset(lib: string | undefined, name: string): string | null {
  if (!lib || !IMAGE.test(name) || name.includes('/') || name.includes('\\') || name.includes('..')) return null
  const file = path.join(lib, CONCEPTS_DIR, 'attachments', name)
  return fs.existsSync(file) ? file : null
}
