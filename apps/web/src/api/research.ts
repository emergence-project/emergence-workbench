// ---------- 프로젝트 (연구 저장소 하나: 요약·작업노트·진술·원고·카드·자료·일지) ----------
import type { BlockMeta, BlockTree, JournalEntry, MetaPatch } from '@rw/core'
import { choiceParams, type ExportChoice } from './noteExport'
import { ConflictError, enc, json, req, send } from './http'
import type { TopicColor } from './notes'

export interface TrashedNote { id: string; name: string; from: string; at: string; until: string }
/** 프로젝트 성격: 연구 · 업무 (서버 registry.ts) */
export type ProjectKind = 'research' | 'work'
/** 프로젝트 진행 상태: 진행 · 멈춤 · 완료 */
export type ProjectState = 'active' | 'paused' | 'done'
/** 등록한 프로젝트(연구 저장소). 성격 · 분야 · 진행 상태 · 순서는 이 컴퓨터의 설정에만 있다 */
export interface ResearchListItem {
  id: string; path: string; title: string
  kind: ProjectKind
  /** 분야 (개념노트 분류에서 고른 이름) */
  fields: string[]
  state: ProjectState
  /** 예전 모양(업무 + 분야). 구글 동기화 · 검색용 */
  tags: string[]
  available: boolean; problem?: string
}
export interface BlockRow extends BlockMeta {
  id: string; hash: string; mtime: number
  /** 'md' = Markdown + KaTeX (blocks/<id>.md), 'tex' = 예전 LaTeX */
  format?: 'md' | 'tex'
  /** 이 작업노트가 "% 근거:"로 적은 원고의 장·부록 (장의 id: 저장소 기준 경로, 한 파일 원고의 절이면 "file#라벨") */
  grounds?: string[]
}
export interface ResearchSummary {
  id: string
  root: string
  engine: string
  research: { title: string; question: string; started: string; /** 프로젝트 카드 그림 (figure:<그림 id> 또는 기존 저장소 기준 경로) */ image?: string }
  blocks: BlockRow[]
  tree: BlockTree
  /** 진술 (저장소의 statements/). 없으면 빈 목록 */
  statements: Statement[]
}
/** 진술: 정의·공리·보조정리·명제·정리 (서버 statements.ts) */
export interface Statement {
  id: string; kind: string; label?: string; title?: string
  uses: string[]; proofs: string[]; source?: string; page?: string
  file: string; mtime: number; hash: string
}
/** 저장소와 GitHub의 차이 (서버 gitsync.ts의 RepoSync) */
export interface RepoSync {
  branch: string; upstream: string; ahead: number; behind: number; dirty: number
  fetchedAt: number | null; fetchError?: string; canUpdate: boolean
}
/** 프로젝트 정보의 저장소 칸 (서버 gitsync.ts의 RepoInfo) */
export interface RepoInfo {
  state: 'ok' | 'none' | 'inside'
  top?: string
  branch?: string | null
  remote?: { name: string; shown: string; web: string | null } | null
  upstream?: string | null
  last?: { sha: string; subject: string; date: string } | null
  dirty?: number; untracked?: number
  ahead?: number | null; behind?: number | null
  fetchedAt?: number | null; fetchError?: string; fetchDetail?: string
}
export interface BlockDoc { id: string; content: string; hash: string; meta: BlockMeta; format?: 'md' | 'tex'; ownHeader?: boolean }
export interface Problem { file: string; line: number; message: string; inBlock: boolean }
export interface CompileResult { ok: boolean; durationMs: number; hasPdf: boolean; problems: Problem[]; logTail: string }
export interface ManuscriptPdfStatus {
  hasPdf: boolean
  pdfState: 'missing' | 'current' | 'stale' | 'unknown'
  lastSuccessAt?: string
  lastCompile?: { at: string; ok: boolean }
  /** 보이는 PDF를 만든 컴파일 시각, 그 컴파일에 오류가 있었는지 */
  pdfAt?: string
  pdfErrors?: boolean
}
export interface ManuscriptCompileResult extends CompileResult, ManuscriptPdfStatus {}
export interface PdfBox { page: number; h: number; v: number; width: number; height: number }
export interface SourceSpot { file: string; line: number; inBlock: boolean }

/** 서버가 보내는 파일 변경 알림 */
/** 프로젝트마다 확인할 것의 수: counts = notes(확인이 필요한 노트) + tasks(판단할 맡긴 일) + edits(에이전트 고침 검토 · 고치기 요청, 10/8) */
export interface ProjectIssues { counts: Record<string, number>; notes: Record<string, number>; tasks: Record<string, number>; edits: Record<string, number> }

export type WorkbenchEvent =
  | { type: 'block'; research: string; id: string; hash: string | null }
  | { type: 'journal'; research: string; date: string }
  | { type: 'research'; research: string }
  | { type: 'preamble'; research: string }
  | { type: 'statement'; research: string; id: string; hash: string | null }
  | { type: 'comments'; research: string; target: string }
  | { type: 'tasks'; research: string; id: string }
  | { type: 'note'; research: string; file: string; hash: string | null }
  /** research.yaml sources의 파일(작업 목록·검토 문서·참고문헌)이 바뀜 */
  | { type: 'sources'; research: string }
  /** 공용 라이브러리 파일이 바뀜 (어느 프로젝트의 것도 아님). file은 라이브러리 기준 경로 */
  | { type: 'library'; research: null; part: 'concepts' | 'figures' | 'papers'; file: string }

/** 프로젝트 자료: refs.bib 논문과 workbench/materials/ 파일 (서버 materials.ts) */
export interface BibEntry { key: string; type: string; title?: string; author?: string; year?: string; eprint?: string; doi?: string; journal?: string; file?: string; source: string }
export interface MaterialFile { name: string; size: number; mtime: number; kind: 'pdf' | 'slides' | 'image' | 'other'; bibKey?: string }

/** 메인 노트 = 원고 (research.yaml sources.manuscript, 여럿일 수 있음) — 서버 manuscript.ts. key: research.yaml에 적은 첫째 원고는 '', 나머지(연구노트·계산 노트 포함)는 경로에서 */
/** 원고의 장. 장 파일이면 id = file, 한 파일 원고의 절이면 id = "file#라벨"이고 line이 그 \section 줄 */
export interface ManuscriptPart { id: string; file: string; title: string; appendix: boolean; line?: number }
/** 노트 구분: 원고(논문 원문) · 연구노트(workbench/notes/, 복사해 고쳐 쓰는 노트) · 계산 노트(workbench/calc/) */
export type NoteKind = 'paper' | 'note' | 'calc'
/** 연구노트 카드 상태: 진행 중 · 일시 정지 · 정지 · 완결 (10/4) */
export type NoteState = 'active' | 'paused' | 'stopped' | 'done'
/** summary·summaryAuto·done은 연구노트·계산 노트만 (note.yaml, 없으면 본문 첫 문단에서 뽑은 설명) */
export interface ManuscriptInfo extends ManuscriptPdfStatus {
  key: string; main: string; name: string; kind: NoteKind; parts: ManuscriptPart[]; hasPdf: boolean; summary?: string; summaryAuto?: boolean; done?: boolean; state?: 'paused' | 'stopped' | 'done'; resume?: string
  /** 연구노트·계산 노트인데 머리나 제목·저자 줄이 남아 있음 */
  needsBodyOnly?: boolean
  /** 컴파일·내보내기 때 앱이 저자 줄을 붙이는 원고 (본문만 있고 \\author가 없는 원고) */
  addsAuthors?: boolean
  /** 머리(\\documentclass)가 있어 내보내기가 파일을 그대로 묶는 노트 (서식·저자·날짜를 고를 수 없다) */
  ownHeader?: boolean
  /** 'md' = Markdown + KaTeX 노트 (note.md), 없으면 LaTeX */
  format?: 'md'
}
/**
 * 주제 (research.yaml의 topics:, 서버 topics.ts). parts는 원고의 장 id, blocks는 예전 기록의 보조 노트 id
 * (노트의 주제는 이제 노트 머리말 topics:, 한 목록은 api/notes.ts). description은 여러 줄 200자, preview는 주제 카드 미리보기
 */
export interface Topic {
  id: string; title: string; parts: string[]; blocks: string[]; done: boolean; star: boolean; manuscript?: string
  description?: string
  preview?: { text?: string; /** figure:<그림 id> 또는 기존 저장소 기준 경로 */ image?: string; color?: TopicColor }
}

/** 프로젝트가 이미 가진 정본 (research.yaml의 sources:) — 서버 agentStatus.ts */
export interface ProjectInfo {
  /** research.yaml의 해시 (정보 고칠 때 바깥 수정 확인용) */
  hash: string
  sources: { canon: { path: string; note: string }[]; tasks?: string; bib: string[]; materials: string[]; reviews: string[] }
  agentStatus: boolean
  tasks: { file: string; columns: string[]; rows: string[][] } | null
  reviews: { file: string; title: string; status: string; updated?: string }[]
}

/** 등록한 프로젝트 목록과 태그 */
export const researchListCalls = {
  researches: () => req('/api/researches').then((r) => json<{ engine: string; sandbox: boolean; researches: ResearchListItem[] }>(r)),

  /** 성격 · 분야 · 진행 상태 중 보낸 것만 바꾼다 */
  setProfile: (rid: string, patch: { kind?: ProjectKind; fields?: string[]; state?: ProjectState }) => req(`/api/researches/${enc(rid)}`, send('PATCH', patch)).then((r) => json<ResearchListItem>(r)),
  /** 프로젝트 순서 (홈 카드 끌기) */
  setOrder: (ids: string[]) => req('/api/researches/order', send('PUT', { ids })).then((r) => json<{ researches: ResearchListItem[] }>(r)),
  /** 프로젝트 카드 그림 주소 (research.yaml의 image:가 있을 때만) */
  imageUrl: (rid: string, v = '') => `/api/researches/${enc(rid)}/image${v ? `?v=${enc(v)}` : ''}`,
  /** 프로젝트마다 확인이 필요한 보조 노트 수 (왼쪽 띠의 프로젝트 버튼) */
  researchIssues: () => req('/api/research-issues').then((r) => json<ProjectIssues>(r)),
}

/** 연구 하나에 대한 요청들 */
export function researchApi(rid: string) {
  const base = `/api/researches/${enc(rid)}`
  const b = (id: string) => `${base}/blocks/${enc(id)}`
  return {
    summary: () => req(base).then((r) => json<ResearchSummary>(r)),
    sync: (fetch = false) => req(`${base}/sync${fetch ? '?fetch=1' : ''}`).then((r) => json<{ sync: RepoSync | null }>(r)).then((r) => r.sync),
    repo: (fetch = false) => req(`${base}/repo${fetch ? '?fetch=1' : ''}`).then((r) => json<{ repo: RepoInfo }>(r)).then((r) => r.repo),
    update: () => req(`${base}/sync/update`, { method: 'POST' }).then((r) => json<{ sync: RepoSync }>(r)).then((r) => r.sync),
    readBlock: (id: string) => req(b(id)).then((r) => json<BlockDoc>(r)),
    saveBlock: (id: string, content: string, baseHash: string) =>
      req(b(id), send('PUT', { content, baseHash })).then((r) => json<{ hash: string }>(r)).then((r) => r.hash),
    deleteBlock: (id: string, baseHash: string) =>
      req(b(id), send('DELETE', { baseHash })).then((r) => json<{ ok: true }>(r)),
    patchMeta: (id: string, patch: MetaPatch, baseHash: string) =>
      req(`${b(id)}/meta`, send('PATCH', { patch, baseHash })).then((r) => json<BlockDoc>(r)),
    createBlock: (input: { title: string; parent?: string; alternativeOf?: string }) =>
      req(`${base}/blocks`, send('POST', input)).then((r) => json<BlockDoc>(r)),
    compile: (id: string, o: ExportChoice = {}) => req(`${b(id)}/compile?${choiceParams(o).join('&')}`, { method: 'POST' }).then((r) => json<CompileResult>(r)),
    pdfUrl: (id: string, version: number) => `${b(id)}/pdf?v=${version}`,
    /** 결과 PDF가 지금 노트의 것인지 (stale = 노트를 PDF 뒤에 고침) */
    pdfState: (id: string) => req(`${b(id)}/pdf/state`).then((r) => json<{ hasPdf: boolean; pdfAt?: string; stale: boolean }>(r)),
    view: (id: string, line: number) => req(`${b(id)}/synctex/view?line=${line}`).then((r) => json<{ boxes: PdfBox[] }>(r)),
    edit: (id: string, page: number, x: number, y: number) =>
      req(`${b(id)}/synctex/edit?page=${page}&x=${x}&y=${y}`).then((r) => json<{ spot: SourceSpot | null }>(r)),
    journal: (days = 30) => req(`${base}/journal?days=${days}`).then((r) => json<{ entries: JournalEntry[] }>(r)),
    readStatement: (sid: string) => req(`${base}/statements/${enc(sid)}`).then((r) => json<{ content: string; hash: string; file: string }>(r)),
    saveStatement: async (sid: string, content: string, baseHash: string): Promise<string> => {
      const r = await req(`${base}/statements/${enc(sid)}`, send('PUT', { content, baseHash }))
      if (r.status === 409) throw new ConflictError(((await r.json()) as { currentHash: string }).currentHash)
      return (await json<{ hash: string }>(r)).hash
    },
    project: () => req(`${base}/project`).then((r) => json<ProjectInfo>(r)),
    setInfo: (patch: { title?: string; question?: string; started?: string; image?: string }, baseHash: string) => req(`${base}/info`, send('PATCH', { ...patch, baseHash })).then((r) => json<{ ok: true; hash: string }>(r)),
    agentStatus: () => req(`${base}/agent-status`).then((r) => json<{ markdown: string }>(r)),
    manuscripts: () => req(`${base}/manuscripts`).then((r) => json<ManuscriptInfo[]>(r)),
    manuscript: (ms = '', o: ExportChoice = {}) => req(`${base}/manuscript?${[`ms=${enc(ms)}`, ...choiceParams(o)].join('&')}`).then((r) => json<ManuscriptInfo>(r)),
    topics: () => req(`${base}/topics`).then((r) => json<{ topics: Topic[]; hash: string }>(r)).then((r) => r.topics),
    /** 소문제 카드 목록을 통째로 바꾼다. 새 카드는 id 없이 보내면 제목에서 만든다 */
    saveTopics: (topics: (Omit<Topic, 'id'> & { id?: string })[]) => req(`${base}/topics`, send('PUT', { topics })).then((r) => json<{ topics: Topic[] }>(r)).then((r) => r.topics),
    readPart: (file: string) => req(`${base}/manuscript/part?file=${enc(file)}`).then((r) => json<{ content: string; hash: string }>(r)),
    savePart: async (file: string, content: string, baseHash: string): Promise<string> => {
      const r = await req(`${base}/manuscript/part`, send('PUT', { file, content, baseHash }))
      if (r.status === 409) throw new ConflictError(((await r.json()) as { currentHash: string }).currentHash)
      return (await json<{ hash: string }>(r)).hash
    },
    /** o: 컴파일 설정에서 고른 서식·저자·날짜 (빼면 프로젝트 서식과 처음 값) */
    compileManuscript: (ms = '', o: ExportChoice = {}) => req(`${base}/manuscript/compile?${[`ms=${enc(ms)}`, ...choiceParams(o)].join('&')}`, { method: 'POST' }).then((r) => json<ManuscriptCompileResult>(r)),
    manuscriptPdfUrl: (v: number, ms = '') => `${base}/manuscript/pdf?v=${v}&ms=${enc(ms)}`,
    /** Markdown 노트 폴더 안의 그림 (읽기 화면의 ![](파일)) */
    noteAssetUrl: (file: string, name: string) => `${base}/manuscript/asset?file=${enc(file)}&name=${enc(name)}`,
    manuscriptView: (file: string, line: number) => req(`${base}/manuscript/synctex/view?file=${enc(file)}&line=${line}`).then((r) => json<{ boxes: PdfBox[] }>(r)),
    manuscriptEdit: (page: number, x: number, y: number, ms = '') => req(`${base}/manuscript/synctex/edit?page=${page}&x=${x}&y=${y}&ms=${enc(ms)}`).then((r) => json<{ spot: { file: string; line: number } | null }>(r)),
    materials: () => req(`${base}/materials`).then((r) => json<{ bib: BibEntry[]; files: MaterialFile[] }>(r)),
    materialUrl: (name: string) => `${base}/materials/${enc(name)}`,
    fetchPaper: (key: string) => req(`${base}/materials/fetch/${enc(key)}`, { method: 'POST' }).then((r) => json<MaterialFile>(r)),
    openMaterial: (name: string) => req(`${base}/materials/${enc(name)}/open`, { method: 'POST' }).then((r) => json<{ ok: true }>(r)),
    uploadMaterial: (file: File) => req(`${base}/materials/${enc(file.name)}`, { method: 'PUT', headers: { 'content-type': 'application/octet-stream' }, body: file }).then((r) => json<{ name: string }>(r)),
    // ---------- 메인 노트 정하기 (갈래 T2) ----------
    mainNoteCandidates: () => req(`${base}/main-note/candidates`).then((r) => json<{ candidates: { path: string; title: string }[]; hash: string }>(r)),
    setMainNote: (path: string, name: string, baseHash: string) => req(`${base}/main-note`, send('PUT', { path, name, baseHash })).then((r) => json<{ ok: true }>(r)),
    unsetMainNote: (path: string) => req(`${base}/main-note?path=${enc(path)}`, { method: 'DELETE' }).then((r) => json<{ ok: true }>(r)),
    /** 연구노트·계산 노트의 note.yaml 정보. baseHash는 본문이 아닌 노트 목록 줄의 머리말 해시 */
    setNoteMeta: (ms: string, patch: { summary?: string; done?: boolean; state?: NoteState; resume?: string }, baseHash: string) => req(`${base}/notes/meta?ms=${enc(ms)}`, send('PATCH', { ...patch, baseHash })).then((r) => json<ManuscriptInfo>(r)),
    /** 연구노트·계산 노트 지우기: 15일 보관 뒤 지움 (10/4 17:04) */
    trashNote: (ms: string) => req(`${base}/notes?ms=${enc(ms)}`, { method: 'DELETE' }).then((r) => json<TrashedNote>(r)),
    noteTrash: () => req(`${base}/notes/trash`).then((r) => json<TrashedNote[]>(r)),
    restoreNote: (id: string) => req(`${base}/notes/trash/${enc(id)}/restore`, { method: 'POST' }).then((r) => json<{ path: string }>(r)),
    createNote: (kind: 'note' | 'calc', name: string, from?: string) => req(`${base}/notes`, send('POST', { kind, name, ...(from !== undefined && { from }) })).then((r) => json<{ path: string; name: string; kind: 'note' | 'calc'; copied: number; skipped: string[] }>(r)),
    /** 연구노트·계산 노트에서 머리와 제목·저자 줄을 뗀다 (앱이 컴파일·내보내기 때 붙인다) */
    makeBodyOnly: (ms: string) => req(`${base}/manuscript/body-only?ms=${enc(ms)}`, { method: 'POST' }).then((r) => json<{ path: string; removedHead: boolean; removedFront: number; macros: number; template?: string }>(r)),
    /** 머리나 제목 줄이 남은 연구노트·계산 노트를 모두 본문만 남긴다 */
    makeAllBodyOnly: () => req(`${base}/notes/body-only`, { method: 'POST' }).then((r) => json<{ notes: number; template?: string }>(r)),
    // ---------- (갈래 T2 끝) ----------
    addJournal: (kind: 'memo' | 'todo', text: string, target?: string) =>
      req(`${base}/journal`, send('POST', { kind, text, target })).then((r) => json<{ entry: JournalEntry }>(r)),
    setTodo: (e: JournalEntry, done: boolean) =>
      req(`${base}/journal/${e.date}/${e.index}`, send('PATCH', { done, was: e.text, link: e.link })).then((r) => json<{ entry: JournalEntry }>(r)),
    editJournal: (e: JournalEntry, text: string) =>
      req(`${base}/journal/${e.date}/${e.index}`, send('PATCH', { text, was: e.text, link: e.link })).then((r) => json<{ entry: JournalEntry }>(r)),
    deleteJournal: (e: JournalEntry) =>
      req(`${base}/journal/${e.date}/${e.index}?was=${enc(e.text)}${e.link ? `&link=${enc(e.link)}` : ''}`, { method: 'DELETE' }).then((r) => json<{ ok: true }>(r)),
  }
}

export type ResearchApi = ReturnType<typeof researchApi>

/** 파일 변경 알림을 받는다. 연결이 끊기면 다시 붙는다. 반환값을 부르면 그만 받는다. */
export function subscribeEvents(onEvent: (e: WorkbenchEvent) => void): () => void {
  let ws: WebSocket | null = null
  let stopped = false
  let retry: number | undefined
  const connect = () => {
    ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/events`)
    ws.onmessage = (m) => { try { onEvent(JSON.parse(String(m.data))) } catch { /* 무시 */ } }
    ws.onclose = () => { if (!stopped) retry = window.setTimeout(connect, 1500) }
  }
  connect()
  return () => { stopped = true; window.clearTimeout(retry); ws?.close() }
}
