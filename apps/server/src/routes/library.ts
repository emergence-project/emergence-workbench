// 공유 라이브러리와 Study
import type { FastifyInstance } from 'fastify'
import fs from 'node:fs'
import path from 'node:path'
import { compileLibraryNote } from '../latex.js'
import { listLibraryPreambles } from '../library.js'
import { contentTypeOf, listMaterials } from '../materials.js'
import { createConcept, createPaper, findStudyAsset, libraryNoteFile, listStudy, readLibraryNote, readStudy, writeLibraryNote } from '../libraryNotes.js'
import { WorkbenchError } from '../workbench.js'
import { setProjectConcept } from '../projectConcepts.js'
import { checkCitations, citedKeys } from '../libraryBib.js'
import { repoInfo } from '../gitsync.js'
import type { RouteContext } from './context.js'
import { t } from '../i18n.js'

/** 공유 라이브러리의 참고문헌 하나 (나중에 Zotero Better BibTeX가 자동으로 내보낼 곳) */
const LIBRARY_BIB = 'references.bib'

export function registerLibrary(app: FastifyInstance, ctx: RouteContext): void {
  const { registry, wbOf } = ctx
  /** 공유 라이브러리: 위치와 고를 수 있는 서식 */
  app.get('/api/library', async () => ctx.libraryReads.library())
  /** 라이브러리 폴더의 Git 상태 (지식 첫 화면의 "라이브러리 정보"): 마지막 커밋 · 올리지 않은 커밋 · 고친 파일. 받아오기·올리기는 하지 않는다 */
  app.get('/api/library/repo', async () => ({ repo: registry.libraryPath && fs.existsSync(registry.libraryPath) ? await repoInfo(registry.libraryPath) : null }))
  /** 프로젝트 전체를 개념노트에 잇거나 끊는다 (research.yaml의 concepts:). 보조 노트 없이 메인 노트만 있는 프로젝트용 */
  app.post<{ Params: { rid: string }; Body: { id?: unknown; on?: unknown } }>('/api/researches/:rid/concepts', async (req) => {
    const b = req.body ?? {}
    return setProjectConcept(wbOf(req.params.rid), b.id, b.on)
  })
  app.get<{ Params: { kind: string; id: string } }>('/api/library/notes/:kind/:id', async (req) => readLibraryNote(registry.libraryPath, req.params.kind, req.params.id))
  app.put<{ Params: { kind: string; id: string }; Body: { content: string; baseHash: string } }>('/api/library/notes/:kind/:id', async (req, reply) => {
    const { content, baseHash } = req.body ?? ({} as never)
    if (typeof content !== 'string' || typeof baseHash !== 'string') throw new WorkbenchError(400, t('content와 baseHash가 필요함', 'content and baseHash are required'))
    const r = writeLibraryNote(registry.libraryPath, req.params.kind, req.params.id, content, baseHash)
    if (!r.ok) return reply.status(409).send({ error: t('다른 곳에서 파일이 바뀌어 저장하지 않았음', 'The file changed elsewhere, so it was not saved'), currentHash: r.currentHash })
    return { hash: r.hash }
  })
  /** 라이브러리 노트를 PDF로 (라이브러리 서식을 모두 불러와서). 빌드는 앱 설정 폴더 아래 library-build/ */
  const libBuildDir = (kind: string, id: string) => path.join(registry.configDir, 'library-build', `${kind}-${id}`)
  /** body.template: 설정의 LaTeX 서식 id (10/4 13:05 피드백 "compile시 선택"). 없으면 예전처럼 article. 발표 서식은 노트에 쓰지 않는다 */
  app.post<{ Params: { kind: string; id: string }; Body: { template?: unknown } | undefined }>('/api/library/notes/:kind/:id/compile', async (req) => {
    const tid = req.body?.template
    const template = typeof tid === 'string' && tid ? registry.template(tid) : undefined
    if (template?.kind === 'slides') throw new WorkbenchError(400, t('발표 서식은 노트 PDF에 쓸 수 없습니다 (본문을 장면으로 나눠야 함).', 'A slides template cannot be used for a note PDF (the body must be split into frames).'))
    const lib = registry.libraryPath
    const note = libraryNoteFile(lib, req.params.kind, req.params.id)
    const preambles = listLibraryPreambles(lib).map((p) => path.join(lib!, p.file))
    // 참고문헌: 노트는 \cite{키}만 쓰고, 라이브러리 references.bib(Zotero가 내보낼 곳)에서 인용한 것만 붙인다
    const bib = path.join(lib!, LIBRARY_BIB)
    const text = fs.existsSync(note) ? fs.readFileSync(note, 'utf8') : ''
    const hasBib = fs.existsSync(bib)
    const warnings = checkCitations(text, hasBib ? fs.readFileSync(bib, 'utf8') : null)
    const result = await compileLibraryNote(lib!, preambles, note, libBuildDir(req.params.kind, req.params.id), registry.engine, citedKeys(text).length && hasBib ? bib : undefined, template)
    return { ...result, warnings }
  })
  app.get<{ Params: { kind: string; id: string } }>('/api/library/notes/:kind/:id/pdf', async (req, reply) => {
    libraryNoteFile(registry.libraryPath, req.params.kind, req.params.id)
    const file = path.join(libBuildDir(req.params.kind, req.params.id), 'main.pdf')
    if (!fs.existsSync(file)) return reply.status(404).send({ error: t('아직 컴파일하지 않음', 'Not compiled yet') })
    return reply.type('application/pdf').header('cache-control', 'no-store').send(fs.createReadStream(file))
  })
  /** 새 개념노트 (기본 양식의 Markdown, format: 'tex'면 옛 LaTeX). study를 주면 그 Study 노트 원문을 재료로 붙인다 */
  app.post<{ Body: { title?: string; study?: string; format?: string } }>('/api/library/concepts', async (req) => {
    const b = req.body ?? {}
    const st = typeof b.study === 'string' ? { path: b.study, ...readStudy(registry.studyPath, b.study) } : undefined
    return createConcept(registry.libraryPath, { title: typeof b.title === 'string' && b.title.trim() ? b.title : st?.title ?? '', study: st && { path: st.path, text: st.text }, format: b.format === 'tex' ? 'tex' : 'md' })
  })
  /** 새 문헌노트 — 프로젝트 bib의 항목에서. 이미 있으면 그대로 */
  app.post<{ Body: { rid: string; key: string } }>('/api/library/papers', async (req) => {
    const { rid, key } = req.body ?? ({} as never)
    const wb = wbOf(String(rid))
    const e = listMaterials(wb.root, wb.readResearch().sources).bib.find((x) => x.key === key)
    if (!e) throw new WorkbenchError(404, t(`bib에 없는 키: ${key}`, `Key not in bib: ${key}`))
    return createPaper(registry.libraryPath, e)
  })
  /** Study vault (읽기만): Concept-Space 노트 목록과 본문 */
  app.get('/api/study', async () => ({ path: registry.studyPath ?? null, notes: listStudy(registry.studyPath) }))
  app.get<{ Querystring: { path: string } }>('/api/study/note', async (req) => readStudy(registry.studyPath, String(req.query.path ?? '')))
  /** Study 노트의 ![[그림]] — 이름으로 찾아 내보낸다 (그림만, 읽기만) */
  app.get<{ Querystring: { name: string } }>('/api/study/asset', async (req, reply) => {
    const file = findStudyAsset(registry.studyPath, String(req.query.name ?? ''))
    if (!file) return reply.status(404).send({ error: t('그림을 찾지 못함', 'Figure not found') })
    return reply.type(contentTypeOf(file)).header('cache-control', 'max-age=600').send(fs.createReadStream(file))
  })
}
