import fs from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'
import type * as C from '@rw/core/contract/learn'
import type { LearnFrom, LearnItem } from '@rw/core/contract/learn'
import { hashOf, localDate, localTime, writeAtomic } from './fsutil.js'
import { WorkbenchError } from './workbench.js'
import { t } from './i18n.js'

/**
 * 공부할 것 (2026-10-04 사용자: "지식은 축적하고, 모르는 것은 빠르게 공부하고 채운다").
 * 읽다가 모르는 말을 "모름"으로 남기면 research-library/to-learn.yaml에 쌓인다.
 * 에이전트(맥의 claude -p)가 개념노트 초안을 쓰고, 사람이 읽고 "확인함"을 누르면 지식이 된다.
 * 상태는 따로 적지 않고 연결된 개념노트에서 읽는다: 없음 = 대기, 있음 = 초안, 확인함 = 앎.
 */
export const LEARN_FILE = 'to-learn.yaml'

export type { LearnFrom, LearnItem } from '@rw/core/contract/learn'
/** 파일에서 읽은 목록 (화면에 보낼 때 라우트가 drafting을 붙인다) */
export type LearnList = Omit<C.LearnList, 'drafting'>

function learnFile(lib: string | undefined): string {
  if (!lib) throw new WorkbenchError(404, t('공유 라이브러리가 설정되지 않았음', 'No shared library is set'))
  return path.join(lib, LEARN_FILE)
}

const str = (v: unknown, max = 2000) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined)

function itemOf(v: unknown): LearnItem | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  const id = str(o.id, 80)
  const term = str(o.term, 200)
  if (!id || !term) return null
  const f = o.from && typeof o.from === 'object' ? o.from as Record<string, unknown> : undefined
  const from: LearnFrom | undefined = f ? {
    ...(str(f.rid) && { rid: str(f.rid) }), ...(str(f.project) && { project: str(f.project) }),
    ...(str(f.title) && { title: str(f.title) }), ...(str(f.target) && { target: str(f.target) }),
    ...(typeof f.page === 'number' && { page: f.page }), ...(str(f.quote) && { quote: str(f.quote) }),
  } : undefined
  return {
    id, term, at: str(o.at, 40) ?? '',
    ...(str(o.note) && { note: str(o.note) }),
    ...(from && Object.keys(from).length && { from }),
    ...(str(o.concept, 200) && { concept: str(o.concept, 200) }),
  }
}

export function readLearn(lib: string | undefined): LearnList {
  const file = learnFile(lib)
  if (!fs.existsSync(file)) return { items: [], hash: hashOf(''), exists: false }
  const text = fs.readFileSync(file, 'utf8')
  let doc: unknown
  try { doc = YAML.parse(text) } catch (e) { throw new WorkbenchError(500, t(`${LEARN_FILE}을 읽지 못했습니다: ${(e as Error).message}`, `Could not read ${LEARN_FILE}: ${(e as Error).message}`)) }
  const raw = doc && typeof doc === 'object' ? (doc as Record<string, unknown>).items : undefined
  const items = (Array.isArray(raw) ? raw : []).map(itemOf).filter((x): x is LearnItem => !!x)
  return { items, hash: hashOf(text), exists: true }
}

const HEADER = '# 공부할 것 — 연구 작업대의 "모름"이 쌓이는 곳. 앱이 쓰고, 사람·에이전트가 고쳐도 된다.\n'

/**
 * 한 항목만 바꾼다. 늘 방금 읽은 파일의 YAML 문서 위에서 그 항목만 고쳐,
 * 바깥(사람·에이전트)이 더한 항목·칸·주석과 앱이 못 읽는 항목을 지우지 않는다.
 */
function editLearn(lib: string | undefined, edit: (items: YAML.YAMLSeq, doc: YAML.Document) => void): LearnList {
  const file = learnFile(lib)
  const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
  const doc = YAML.parseDocument(text.trim() ? text : `${HEADER}items: []\n`)
  if (doc.errors.length) throw new WorkbenchError(500, t(`${LEARN_FILE}을 읽지 못했습니다: ${doc.errors[0]!.message}`, `Could not read ${LEARN_FILE}: ${doc.errors[0]!.message}`))
  if (doc.contents === null) doc.contents = doc.createNode({}) as never
  if (!YAML.isMap(doc.contents)) throw new WorkbenchError(500, t(`${LEARN_FILE}의 맨 위가 items: 목록이 아니라 고치지 않았습니다`, `Not changed: the top of ${LEARN_FILE} is not an items: list`))
  let items = doc.get('items')
  if (!YAML.isSeq(items)) {
    if (items !== undefined && items !== null) throw new WorkbenchError(500, t(`${LEARN_FILE}의 items가 목록이 아니라 고치지 않았습니다`, `Not changed: items in ${LEARN_FILE} is not a list`))
    items = doc.createNode([])
    doc.set('items', items)
  }
  edit(items as YAML.YAMLSeq, doc)
  writeAtomic(file, doc.toString({ lineWidth: 0 }))
  return readLearn(lib)
}

const nodeIndex = (items: YAML.YAMLSeq, id: string) => items.items.findIndex((n) => YAML.isMap(n) && String(n.get('id')) === id)
function nodeOf(items: YAML.YAMLSeq, id: string): number {
  const i = nodeIndex(items, id)
  if (i < 0) throw new WorkbenchError(404, t(`공부할 것이 없음: ${id}`, `No such item to study: ${id}`))
  return i
}

export interface NewLearn { term?: unknown; note?: unknown; from?: unknown; concept?: unknown }

export function addLearn(lib: string | undefined, input: NewLearn, now = new Date()): { item: LearnItem; list: LearnList } {
  const term = str(input.term, 200)?.replace(/\s+/g, ' ')
  if (!term) throw new WorkbenchError(400, t('모르는 말이 비어 있음', 'The unknown term is empty'))
  const stamp = `${localDate(now).replace(/-/g, '')}-${localTime(now).replace(':', '')}`
  let item: LearnItem | null = null
  const list = editLearn(lib, (items, doc) => {
    let id = `l-${stamp}`
    for (let n = 2; nodeIndex(items, id) >= 0; n++) id = `l-${stamp}-${n}`
    item = itemOf({ id, term, at: `${localDate(now)} ${localTime(now)}`, note: input.note, from: input.from, concept: input.concept })!
    items.add(doc.createNode(item))
  })
  return { item: item!, list }
}

export function removeLearn(lib: string | undefined, id: string): LearnList {
  return editLearn(lib, (items) => { items.items.splice(nodeOf(items, id), 1) })
}

export function setLearnConcept(lib: string | undefined, id: string, concept: string | undefined): LearnList {
  return editLearn(lib, (items) => {
    const node = items.items[nodeOf(items, id)] as YAML.YAMLMap
    if (concept) node.set('concept', concept)
    else node.delete('concept')
  })
}

export function learnItem(lib: string | undefined, id: string): LearnItem {
  const it = readLearn(lib).items.find((i) => i.id === id)
  if (!it) throw new WorkbenchError(404, t(`공부할 것이 없음: ${id}`, `No such item to study: ${id}`))
  return it
}

// ---------- 개념노트 초안 ----------

/** Claude에게 넘기는 글. 답의 첫 줄들은 TITLE·SUBJECT, `---` 아래는 본문, `=== MEMO ===` 아래는 노트 옆 메모 */
export function draftPrompt(it: LearnItem, subjects: string[]): string {
  const f = it.from
  return [
    '연구자가 연구 작업대 앱에서 읽다가 모른다고 표시한 개념이 있습니다. 공유 라이브러리(이 폴더)에 넣을 개념노트 초안을 써 주세요.',
    '',
    `- 모르는 말: ${it.term}`,
    f?.title ? `- 읽던 것: ${f.title}${f.page ? ` ${f.page}쪽` : ''}${f.project ? ` (프로젝트 ${f.project})` : ''}` : null,
    f?.quote ? `- 고른 글: "${f.quote}"` : null,
    it.note ? `- 막힌 점: ${it.note}` : null,
    '',
    '먼저 할 것:',
    '- README.md의 "concepts/ — 개념노트" 절(규칙 1–4와 형식)을 Read로 끝까지 읽고 그대로 따릅니다. 본문 구성과 첫 절의 모양은 그 규칙이 정합니다.',
    '- concepts/ 의 개념노트 두세 개를 Read로 읽고 언어·문체·수식 표기를 따릅니다. concepts/macros.tex의 매크로를 씁니다.',
    '- 같은 개념이 이미 다른 이름으로 있으면 새로 쓰지 말고 첫 줄에 EXISTS: <파일 이름에서 .md를 뺀 id> 한 줄만 출력합니다.',
    '- 출처는 references.bib에 있는 키만 [@키]로 인용합니다. bib에 없는 출처는 본문에 쓰지 말고 메모에 적습니다.',
    '',
    '이 초안에만 더하는 것:',
    '- 연구와 무관한 일반 지식만 씁니다. 위 연구의 맥락은 본문에 넣지 않습니다.',
    '- 내용을 지어내지 않습니다. 확실하지 않은 내용은 쓰지 말고 메모의 "확인할 점"에 적습니다. 수식은 $…$, $$…$$.',
    '- 관련 개념은 [[제목]]으로 링크합니다. 할 일·질문은 본문이 아니라 메모에 적습니다.',
    '',
    '출력 형식 (이것만 출력합니다. 파일은 고치지 않습니다):',
    'TITLE: <개념 이름, 라이브러리의 다른 제목들과 같은 언어>',
    `SUBJECT: <분류, "›"로 나눔. 될 수 있으면 있는 것에서 고름: ${subjects.slice(0, 60).join(' | ') || '없음'}>`,
    '---',
    '<본문 Markdown, 제목 줄 없이 첫 절(## …)부터>',
    '=== MEMO ===',
    '<확인할 점, 본문에 못 넣은 출처, 더 공부할 것을 - 목록으로>',
  ].filter((l) => l !== null).join('\n')
}

export type DraftReply = { exists: string } | { title?: string; subject?: string; body: string; memo?: string }

export function parseDraft(out: string): DraftReply {
  const text = out.replace(/\r\n/g, '\n').replace(/^```(?:markdown|md)?\n([\s\S]*?)\n```\s*$/, '$1').trim()
  const ex = /^EXISTS:\s*(\S+)/m.exec(text.split('\n').slice(0, 3).join('\n'))
  if (ex) return { exists: ex[1]!.replace(/\.md$/, '') }
  const sep = /^---\s*$/m.exec(text)
  const head = sep ? text.slice(0, sep.index) : ''
  let rest = sep ? text.slice(sep.index + sep[0].length) : text
  const title = /^TITLE:\s*(.+)$/m.exec(head)?.[1]?.trim()
  const subject = /^SUBJECT:\s*(.+)$/m.exec(head)?.[1]?.trim()
  let memo: string | undefined
  const mm = /^=== MEMO ===\s*$/m.exec(rest)
  if (mm) { memo = rest.slice(mm.index + mm[0].length).trim() || undefined; rest = rest.slice(0, mm.index) }
  const body = rest.trim()
  if (!/^## /m.test(body)) throw new WorkbenchError(502, t('Claude의 답에서 개념노트 본문을 찾지 못했습니다', 'Could not find a concept note body in the answer from Claude'))
  return { title, subject: subject && subject !== '없음' ? subject : undefined, body: `${body}\n`, memo }
}

/** 초안 옆 메모: 처음 막힌 자리와 Claude가 남긴 확인할 점 */
export function draftMemo(it: LearnItem, memo: string | undefined): string {
  const f = it.from
  return [
    '- [ ] 초안을 읽고 맞으면 "확인함"',
    '',
    `## 처음 막힌 곳 (${it.at})`,
    '',
    f?.title ? `- ${f.project ? `${f.project} · ` : ''}${f.title}${f.page ? ` ${f.page}쪽` : ''}` : null,
    f?.quote ? `> ${f.quote.replace(/\n/g, ' ')}` : null,
    it.note ? `- 막힌 점: ${it.note}` : null,
    ...(memo ? ['', '## 초안을 쓴 Claude가 남긴 확인할 점', '', memo] : []),
    '',
  ].filter((l) => l !== null).join('\n')
}
