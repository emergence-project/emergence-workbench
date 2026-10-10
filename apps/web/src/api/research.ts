// ---------- 프로젝트 (연구 저장소 하나: 요약·작업노트·진술·원고·카드·자료·일지) ----------
import type { JournalEntry, MetaPatch } from '@rw/core'
import type {
  AgentStatusPreview, AllBodyOnlyResult, BlockCreateBody, BlockDoc, BlockMetaSaved, BlockPdfState, BlockSpot, BodyOnlyResult, CompileResult, CreatedNote, InfoBody, InfoSaved,
  JournalEdited, JournalEntryReply, JournalList, MainNoteCandidates, ManuscriptCompileResult, ManuscriptInfo, ManuscriptList, ManuscriptSpot, ManuscriptView, MaterialFile,
  MaterialList, MaterialUploaded, NoteMetaBody, Ok, PartDoc, PdfBoxes, ProfileBody, ProjectInfo, ProjectIssues, RepoReply, ResearchList, ResearchListItem, ResearchOrder,
  ResearchSummary, RestoredNote, Saved, StatementDoc, SyncReply, SyncUpdated, TopicList, TrashedNote, TrashList,
} from '@rw/core/contract/research'
import { choiceParams, type ExportChoice } from './noteExport'
import { ConflictError, enc, json, req, send } from './http'

export type {
  BibEntry, BlockDoc, BlockMetaSaved, BlockRow, CompileResult, LatexProblem as Problem, ManuscriptCompileResult, ManuscriptInfo, ManuscriptPart, ManuscriptPdfStatus, ManuscriptView,
  MaterialFile, NoteKind, NoteState, PdfBox, ProjectColor, ProjectInfo, ProjectIssues, ProjectKind, ProjectState, RepoInfo, RepoSync, ResearchListItem, ResearchSummary, SourceSpot, Statement,
  Topic, TrashedNote,
} from '@rw/core/contract/research'

/** 서버가 보내는 파일 변경 알림 */
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

/** 등록한 프로젝트 목록과 태그 */
export const researchListCalls = {
  researches: () => req('/api/researches').then((r) => json<ResearchList>(r)),

  /** 성격 · 분야 · 진행 상태 중 보낸 것만 바꾼다 */
  setProfile: (rid: string, patch: Omit<ProfileBody, 'tags'>) => req(`/api/researches/${enc(rid)}`, send('PATCH', patch)).then((r) => json<ResearchListItem>(r)),
  /** 프로젝트 순서 (홈 카드 끌기) */
  setOrder: (ids: string[]) => req('/api/researches/order', send('PUT', { ids })).then((r) => json<ResearchOrder>(r)),
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
    sync: (fetch = false) => req(`${base}/sync${fetch ? '?fetch=1' : ''}`).then((r) => json<SyncReply>(r)).then((r) => r.sync),
    repo: (fetch = false) => req(`${base}/repo${fetch ? '?fetch=1' : ''}`).then((r) => json<RepoReply>(r)).then((r) => r.repo),
    update: () => req(`${base}/sync/update`, { method: 'POST' }).then((r) => json<SyncUpdated>(r)).then((r) => r.sync),
    readBlock: (id: string) => req(b(id)).then((r) => json<BlockDoc>(r)),
    saveBlock: (id: string, content: string, baseHash: string) =>
      req(b(id), send('PUT', { content, baseHash })).then((r) => json<Saved>(r)).then((r) => r.hash),
    deleteBlock: (id: string, baseHash: string) =>
      req(b(id), send('DELETE', { baseHash })).then((r) => json<Ok>(r)),
    patchMeta: (id: string, patch: MetaPatch, baseHash: string) =>
      req(`${b(id)}/meta`, send('PATCH', { patch, baseHash })).then((r) => json<BlockMetaSaved>(r)),
    createBlock: (input: Omit<BlockCreateBody, 'id'>) =>
      req(`${base}/blocks`, send('POST', input)).then((r) => json<BlockDoc>(r)),
    compile: (id: string, o: ExportChoice = {}) => req(`${b(id)}/compile?${choiceParams(o).join('&')}`, { method: 'POST' }).then((r) => json<CompileResult>(r)),
    pdfUrl: (id: string, version: number) => `${b(id)}/pdf?v=${version}`,
    /** 결과 PDF가 지금 노트의 것인지 (stale = 노트를 PDF 뒤에 고침) */
    pdfState: (id: string) => req(`${b(id)}/pdf/state`).then((r) => json<BlockPdfState>(r)),
    view: (id: string, line: number) => req(`${b(id)}/synctex/view?line=${line}`).then((r) => json<PdfBoxes>(r)),
    edit: (id: string, page: number, x: number, y: number) =>
      req(`${b(id)}/synctex/edit?page=${page}&x=${x}&y=${y}`).then((r) => json<BlockSpot>(r)),
    journal: (days = 30) => req(`${base}/journal?days=${days}`).then((r) => json<JournalList>(r)),
    readStatement: (sid: string) => req(`${base}/statements/${enc(sid)}`).then((r) => json<StatementDoc>(r)),
    saveStatement: async (sid: string, content: string, baseHash: string): Promise<string> => {
      const r = await req(`${base}/statements/${enc(sid)}`, send('PUT', { content, baseHash }))
      if (r.status === 409) throw new ConflictError(((await r.json()) as { currentHash: string }).currentHash)
      return (await json<Saved>(r)).hash
    },
    project: () => req(`${base}/project`).then((r) => json<ProjectInfo>(r)),
    setInfo: (patch: Omit<InfoBody, 'baseHash'>, baseHash: string) => req(`${base}/info`, send('PATCH', { ...patch, baseHash })).then((r) => json<InfoSaved>(r)),
    agentStatus: () => req(`${base}/agent-status`).then((r) => json<AgentStatusPreview>(r)),
    manuscripts: () => req(`${base}/manuscripts`).then((r) => json<ManuscriptList>(r)),
    manuscript: (ms = '', o: ExportChoice = {}) => req(`${base}/manuscript?${[`ms=${enc(ms)}`, ...choiceParams(o)].join('&')}`).then((r) => json<ManuscriptView>(r)),
    topics: () => req(`${base}/topics`).then((r) => json<TopicList>(r)).then((r) => r.topics),
    readPart: (file: string) => req(`${base}/manuscript/part?file=${enc(file)}`).then((r) => json<PartDoc>(r)),
    savePart: async (file: string, content: string, baseHash: string): Promise<string> => {
      const r = await req(`${base}/manuscript/part`, send('PUT', { file, content, baseHash }))
      if (r.status === 409) throw new ConflictError(((await r.json()) as { currentHash: string }).currentHash)
      return (await json<Saved>(r)).hash
    },
    /** o: 컴파일 설정에서 고른 서식·저자·날짜 (빼면 프로젝트 서식과 처음 값) */
    compileManuscript: (ms = '', o: ExportChoice = {}) => req(`${base}/manuscript/compile?${[`ms=${enc(ms)}`, ...choiceParams(o)].join('&')}`, { method: 'POST' }).then((r) => json<ManuscriptCompileResult>(r)),
    manuscriptPdfUrl: (v: number, ms = '') => `${base}/manuscript/pdf?v=${v}&ms=${enc(ms)}`,
    /** Markdown 노트 폴더 안의 그림 (읽기 화면의 ![](파일)) */
    noteAssetUrl: (file: string, name: string) => `${base}/manuscript/asset?file=${enc(file)}&name=${enc(name)}`,
    manuscriptView: (file: string, line: number) => req(`${base}/manuscript/synctex/view?file=${enc(file)}&line=${line}`).then((r) => json<PdfBoxes>(r)),
    manuscriptEdit: (page: number, x: number, y: number, ms = '') => req(`${base}/manuscript/synctex/edit?page=${page}&x=${x}&y=${y}&ms=${enc(ms)}`).then((r) => json<ManuscriptSpot>(r)),
    materials: () => req(`${base}/materials`).then((r) => json<MaterialList>(r)),
    materialUrl: (name: string) => `${base}/materials/${enc(name)}`,
    fetchPaper: (key: string) => req(`${base}/materials/fetch/${enc(key)}`, { method: 'POST' }).then((r) => json<MaterialFile>(r)),
    openMaterial: (name: string) => req(`${base}/materials/${enc(name)}/open`, { method: 'POST' }).then((r) => json<Ok>(r)),
    uploadMaterial: (file: File) => req(`${base}/materials/${enc(file.name)}`, { method: 'PUT', headers: { 'content-type': 'application/octet-stream' }, body: file }).then((r) => json<MaterialUploaded>(r)),
    // ---------- 메인 노트 정하기 (갈래 T2) ----------
    mainNoteCandidates: () => req(`${base}/main-note/candidates`).then((r) => json<MainNoteCandidates>(r)),
    setMainNote: (path: string, name: string, baseHash: string) => req(`${base}/main-note`, send('PUT', { path, name, baseHash })).then((r) => json<Ok>(r)),
    unsetMainNote: (path: string) => req(`${base}/main-note?path=${enc(path)}`, { method: 'DELETE' }).then((r) => json<Ok>(r)),
    /** 연구노트·계산 노트의 note.yaml 정보. baseHash는 본문이 아닌 노트 목록 줄의 머리말 해시 */
    setNoteMeta: (ms: string, patch: Omit<NoteMetaBody, 'baseHash'>, baseHash: string) => req(`${base}/notes/meta?ms=${enc(ms)}`, send('PATCH', { ...patch, baseHash })).then((r) => json<ManuscriptInfo>(r)),
    /** 연구노트·계산 노트 지우기: 15일 보관 뒤 지움 (10/4 17:04) */
    trashNote: (ms: string) => req(`${base}/notes?ms=${enc(ms)}`, { method: 'DELETE' }).then((r) => json<TrashedNote>(r)),
    noteTrash: () => req(`${base}/notes/trash`).then((r) => json<TrashList>(r)),
    restoreNote: (id: string) => req(`${base}/notes/trash/${enc(id)}/restore`, { method: 'POST' }).then((r) => json<RestoredNote>(r)),
    createNote: (kind: 'note' | 'calc', name: string, from?: string) => req(`${base}/notes`, send('POST', { kind, name, ...(from !== undefined && { from }) })).then((r) => json<CreatedNote>(r)),
    /** 연구노트·계산 노트에서 머리와 제목·저자 줄을 뗀다 (앱이 컴파일·내보내기 때 붙인다) */
    makeBodyOnly: (ms: string) => req(`${base}/manuscript/body-only?ms=${enc(ms)}`, { method: 'POST' }).then((r) => json<BodyOnlyResult>(r)),
    /** 머리나 제목 줄이 남은 연구노트·계산 노트를 모두 본문만 남긴다 */
    makeAllBodyOnly: () => req(`${base}/notes/body-only`, { method: 'POST' }).then((r) => json<AllBodyOnlyResult>(r)),
    // ---------- (갈래 T2 끝) ----------
    addJournal: (kind: 'memo' | 'todo', text: string, target?: string) =>
      req(`${base}/journal`, send('POST', { kind, text, target })).then((r) => json<JournalEntryReply>(r)),
    setTodo: (e: JournalEntry, done: boolean) =>
      req(`${base}/journal/${e.date}/${e.index}`, send('PATCH', { done, was: e.text, link: e.link })).then((r) => json<JournalEdited>(r)),
    editJournal: (e: JournalEntry, text: string) =>
      req(`${base}/journal/${e.date}/${e.index}`, send('PATCH', { text, was: e.text, link: e.link })).then((r) => json<JournalEdited>(r)),
    deleteJournal: (e: JournalEntry) =>
      req(`${base}/journal/${e.date}/${e.index}?was=${enc(e.text)}${e.link ? `&link=${enc(e.link)}` : ''}`, { method: 'DELETE' }).then((r) => json<Ok>(r)),
  }
}

export type ResearchApi = ReturnType<typeof researchApi>

/**
 * 파일 변경 알림을 받는다. 연결이 끊기면 다시 붙는다. 반환값을 부르면 그만 받는다.
 * 다시 붙었을 때(서버 재시작·잠자기 뒤) 끊긴 동안 바뀐 것은 알림이 없으므로 onReconnect로 한 번 다시 읽게 한다.
 */
export function subscribeEvents(onEvent: (e: WorkbenchEvent) => void, onReconnect?: () => void): () => void {
  let ws: WebSocket | null = null
  let stopped = false
  let retry: number | undefined
  let opened = false
  const connect = () => {
    ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/events`)
    ws.onopen = () => { if (opened) onReconnect?.(); opened = true }
    ws.onmessage = (m) => { try { onEvent(JSON.parse(String(m.data))) } catch { /* 무시 */ } }
    ws.onclose = () => { if (!stopped) retry = window.setTimeout(connect, 1500) }
  }
  connect()
  return () => { stopped = true; window.clearTimeout(retry); ws?.close() }
}
