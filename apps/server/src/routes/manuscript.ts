// 원고와 메인 노트 정하기
import type { FastifyInstance } from 'fastify'
import fs from 'node:fs'
import path from 'node:path'
import { allManuscripts, compileManuscript, manuscriptEdit, manuscriptInfo, manuscriptKind, manuscriptPdfBytes, manuscriptPdfState, manuscriptView, noteAsset, NOTE_ASSET, readPart, writePart, type ManuscriptCompileOptions } from '../manuscript.js'
import { mainNoteCandidates, setMainNote, unsetMainNote } from '../mainNote.js'
import { createNote, makeAllBodyOnly, makeBodyOnly } from '../noteCopy.js'
import { writeNoteMeta } from '../noteMeta.js'
import { exportBlock, exportNotes } from '../noteExport.js'
import { sharedMacrosTex } from '../latexFiles.js'
import { LATEX_FILES_DIR } from './latexSetup.js'
import { requireHash, WorkbenchError } from '../workbench.js'
import type { RouteContext } from './context.js'
import { latexChoices, queryList as list, type LatexChoiceQuery as Pick } from './latexChoice.js'
import { figureEmbedResolver } from '../figureEmbeds.js'
import { figureFile, LIBRARY_SCOPE, listFigureSources, resolveFigure } from '../figures.js'
import type { Registry } from '../registry.js'
import type { Workbench } from '../workbench.js'
import { t } from '../i18n.js'

/** 그림 문단 ![캡션](파일)의 파일: 노트 폴더에 있으면 그것, 없으면 같은 이름의 라이브러리 그림 (이 프로젝트 전용 먼저, figureEmbeds.ts와 같게) */
function noteAssetOrFigure(registry: Registry, wb: Workbench, rid: string, file: string, name: string): string {
  try { return noteAsset(wb, file, name) } catch (error) {
    if (!(error instanceof WorkbenchError) || error.status !== 404) throw error
    const fig = resolveFigure(listFigureSources(registry, [LIBRARY_SCOPE, rid]), name, rid)
    const abs = fig && figureFile(registry, fig.id).abs
    if (!abs || !NOTE_ASSET.test(abs)) throw error
    return fs.realpathSync(abs)
  }
}

export function registerManuscript(app: FastifyInstance, ctx: RouteContext): void {
  const { registry, wbOf } = ctx
  // ms: 메인 노트 key (없으면 첫째). 장 파일을 받는 곳은 파일로 메인 노트를 찾는다
  const msq = (q: { ms?: unknown }) => (typeof q.ms === 'string' ? q.ms : '')
  app.get<{ Params: { rid: string }; Querystring: { ms?: string } & Pick }>('/api/researches/:rid/manuscript', async (req) => {
    const wb = wbOf(req.params.rid)
    const key = msq(req.query)
    return { ...manuscriptInfo(wb, key), ...manuscriptPdfState(wb, key, compileOptions(wb, req.query, req.params.rid)) }
  })
  app.get<{ Params: { rid: string } }>('/api/researches/:rid/manuscripts', async (req) => allManuscripts(wbOf(req.params.rid)))
  app.get<{ Params: { rid: string }; Querystring: { file: string } }>('/api/researches/:rid/manuscript/part', async (req) => {
    if (typeof req.query.file !== 'string') throw new WorkbenchError(400, t('file이 필요함', 'file is required'))
    return readPart(wbOf(req.params.rid), req.query.file)
  })
  app.put<{ Params: { rid: string }; Body: { file: string; content: string; baseHash: string } }>('/api/researches/:rid/manuscript/part', async (req, reply) => {
    const { file, content, baseHash } = req.body ?? ({} as never)
    if (typeof file !== 'string' || typeof content !== 'string' || typeof baseHash !== 'string') throw new WorkbenchError(400, t('file·content·baseHash가 필요함', 'file, content, and baseHash are required'))
    const r = writePart(wbOf(req.params.rid), file, content, baseHash)
    if (!r.ok) return reply.status(409).send({ error: t('다른 곳에서 파일이 바뀌어 저장하지 않았음', 'Not saved: the file was changed elsewhere'), currentHash: r.currentHash })
    return { hash: r.hash }
  })
  /**
   * 컴파일·내보내기에서 고른 서식·저자·날짜 (10/4 내보내기 상자, 20:56 "컴파일시 템플릿 설정에 대한 기본값을 정해두고, 원할 때 변경").
   * tpl: 서식 id (없으면 프로젝트 서식. 없는 서식은 내보내기는 404, 컴파일(lenient)은 프로젝트 서식으로), date: none | today | YYYY-MM-DD, au: 넣을 저자 이름을 차례대로 (au=(빈 값)이면 저자 없이).
   * 저자 목록에 없는 이름은 네트워킹의 사람(이름·다른 이름)에서 찾아 소속 없이 넣는다 (10/4 18:46 "검색하여 추가")
   */
  const { projectTemplate, latexPick } = latexChoices(registry)
  const compileOptions = (wb: ReturnType<typeof wbOf>, q: Pick & { ms?: string }, rid: string): ManuscriptCompileOptions => {
    const { template, ...pick } = latexPick(wb, q, true, manuscriptKind(wb, msq(q)))
    return { engine: registry.engine, template, authors: registry.authors, shared: sharedMacrosTex(registry.libraryPath), pick, figures: figureEmbedResolver(registry, rid) }
  }
  // 본문만 있는 노트는 고른 서식(없으면 research.yaml의 latex-template:, 그것도 없으면 내보내기 기본 서식)으로 감싼다
  app.post<{ Params: { rid: string }; Querystring: { ms?: string } & Pick }>('/api/researches/:rid/manuscript/compile', async (req) => {
    const wb = wbOf(req.params.rid)
    const options = compileOptions(wb, req.query, req.params.rid)
    return compileManuscript(wb, options.engine, msq(req.query), options.template, options.authors, options.shared, options.pick, () => compileOptions(wb, req.query, req.params.rid))
  })
  app.get<{ Params: { rid: string }; Querystring: { file: string; name: string } }>('/api/researches/:rid/manuscript/asset', async (req, reply) => {
    if (typeof req.query.file !== 'string' || typeof req.query.name !== 'string') throw new WorkbenchError(400, t('file·name이 필요함', 'file and name are required'))
    const real = noteAssetOrFigure(registry, wbOf(req.params.rid), req.params.rid, req.query.file, req.query.name)
    const ext = path.extname(real).slice(1).toLowerCase()
    const type = ext === 'pdf' ? 'application/pdf' : ext === 'svg' ? 'image/svg+xml' : `image/${ext === 'jpg' ? 'jpeg' : ext}`
    return reply.type(type).header('cache-control', 'no-store').send(fs.createReadStream(real))
  })
  app.get<{ Params: { rid: string }; Querystring: { ms?: string } }>('/api/researches/:rid/manuscript/pdf', async (req, reply) => {
    const bytes = manuscriptPdfBytes(wbOf(req.params.rid), msq(req.query))
    if (!bytes) return reply.status(404).send({ error: t('아직 완성된 PDF가 없음', 'No finished PDF yet') })
    return reply.type('application/pdf').header('cache-control', 'no-store').send(bytes)
  })
  app.get<{ Params: { rid: string }; Querystring: { file: string; line: string } }>('/api/researches/:rid/manuscript/synctex/view', async (req) => {
    const line = Number(req.query.line)
    if (typeof req.query.file !== 'string' || !Number.isInteger(line) || line < 1) throw new WorkbenchError(400, t('file과 1 이상의 line이 필요함', 'file and a line of 1 or more are required'))
    return { boxes: await manuscriptView(wbOf(req.params.rid), req.query.file, line) }
  })
  app.get<{ Params: { rid: string }; Querystring: { page: string; x: string; y: string; ms?: string } }>('/api/researches/:rid/manuscript/synctex/edit', async (req) => {
    const [page, x, y] = [Number(req.query.page), Number(req.query.x), Number(req.query.y)]
    if (![page, x, y].every(Number.isFinite)) throw new WorkbenchError(400, t('page·x·y가 필요함', 'page, x, and y are required'))
    return { spot: await manuscriptEdit(wbOf(req.params.rid), page, x, y, msq(req.query)) }
  })


  /** 메인 노트로 고를 수 있는 .tex (\documentclass가 있거나 본문만 있는 것)와 지금 research.yaml의 해시 */
  app.get<{ Params: { rid: string } }>('/api/researches/:rid/main-note/candidates', async (req) => mainNoteCandidates(wbOf(req.params.rid)))
  /** research.yaml의 sources.manuscript에 메인 노트를 더한다 (없으면 한 줄, 있으면 목록으로). 있던 것은 바꾸지 않는다 */
  app.put<{ Params: { rid: string }; Body: { path?: unknown; name?: unknown; baseHash?: unknown } }>('/api/researches/:rid/main-note', async (req, reply) => {
    const r = setMainNote(wbOf(req.params.rid), { path: req.body?.path, name: req.body?.name, baseHash: req.body?.baseHash })
    if (!r.ok) return reply.status(409).send({ error: t('다른 곳에서 research.yaml이 바뀌어 쓰지 않았음', 'Not written: research.yaml was changed elsewhere'), currentHash: r.currentHash })
    return r
  })
  /** 원고를 메인 노트 목록에서 뺀다 (research.yaml의 그 항목만). 파일은 그대로 */
  app.delete<{ Params: { rid: string }; Querystring: { path?: string } }>('/api/researches/:rid/main-note', async (req) => unsetMainNote(wbOf(req.params.rid), { path: req.query.path }))

  /** 연구노트·계산 노트 만들기: from(원고 key)이 있으면 그 원고를 복사, 없으면 LaTeX 공통 설정으로 빈 노트 */
  // 연구노트·계산 노트 카드의 한 줄 설명과 완결 (note.yaml). baseHash(노트 목록 줄의 hash)를 주면 그 뒤 바뀐 note.yaml은 고치지 않는다
  app.patch<{ Params: { rid: string }; Querystring: { ms?: string }; Body: { summary?: unknown; done?: unknown; state?: unknown; resume?: unknown; baseHash?: unknown } }>('/api/researches/:rid/notes/meta', async (req) => {
    const wb = wbOf(req.params.rid)
    const info = manuscriptInfo(wb, msq(req.query))
    if (info.kind === 'paper') throw new WorkbenchError(400, t('원고에는 카드 설명을 적지 않음', 'Manuscripts do not take a card description'))
    const { baseHash, ...patch } = req.body ?? {}
    writeNoteMeta(path.join(path.dirname(wb.root), info.main), patch, requireHash(baseHash, t('노트 목록 줄의 hash', 'the hash of the note list line')))
    return manuscriptInfo(wb, msq(req.query))
  })
  app.post<{ Params: { rid: string }; Body: { kind?: unknown; name?: unknown; from?: unknown } }>('/api/researches/:rid/notes', async (req) =>
    createNote(wbOf(req.params.rid), { kind: req.body?.kind, name: req.body?.name, from: req.body?.from }, { setup: registry.template(registry.latexDefault), authors: registry.authors }, registry.latexTemplates))

  /** 연구노트·계산 노트를 본문만 남긴 노트로: 머리와 제목·저자 줄을 뗀다 (원고는 거절) */
  app.post<{ Params: { rid: string }; Querystring: { ms?: string } }>('/api/researches/:rid/manuscript/body-only', async (req) => makeBodyOnly(wbOf(req.params.rid), msq(req.query), registry.latexTemplates))
  app.post<{ Params: { rid: string } }>('/api/researches/:rid/notes/body-only', async (req) => makeAllBodyOnly(wbOf(req.params.rid), registry.latexTemplates))
  /** 내보내기 상자의 서식 고르기: 고를 수 있는 서식과 이 프로젝트의 서식 (research.yaml의 latex-template:, 없으면 내보내기 기본 서식) */
  app.get<{ Params: { rid: string } }>('/api/researches/:rid/export/options', async (req) => ({
    template: projectTemplate(wbOf(req.params.rid)),
    noteTemplate: projectTemplate(wbOf(req.params.rid), 'note'),
    templates: registry.latexTemplates.map((t) => ({ id: t.id, name: t.name, kind: t.kind })),
  }))
  /** 노트 내보내기: ms(메인 노트 key) 하나 또는 여럿, 또는 block(보조 노트 id) 하나를 LaTeX 폴더 zip으로. 여럿이면 main.tex 하나로 모은다 */
  // 내보내기 상자에서 고른 것 (10/4 반려 "옵션으로 선택하게하자. 1. 디자인 템플릿, 2. 저자 포함 여부, 3. 날짜"): 위의 latexPick.
  // au가 없으면 원고는 설정의 저자 목록 차례 그대로·노트는 저자 없이, date가 없으면 원고는 today, 노트는 none
  app.get<{ Params: { rid: string }; Querystring: { ms?: string | string[]; block?: string } & Pick }>('/api/researches/:rid/export', async (req, reply) => {
    const wb = wbOf(req.params.rid)
    const keys = list(req.query.ms)
    const block = req.query.block
    if (block !== undefined && (typeof block !== 'string' || keys.length > 0)) throw new WorkbenchError(400, t('보조 노트는 하나씩 따로 내보내세요', 'Export notes one at a time'))
    const kind = block !== undefined || (keys.length > 0 && keys.every((k) => manuscriptKind(wb, k) !== 'paper')) ? 'note' : 'paper'
    const latex = { ...latexPick(wb, req.query, false, kind), allAuthors: registry.authors, filesDir: LATEX_FILES_DIR, sharedMacros: sharedMacrosTex(registry.libraryPath), figures: figureEmbedResolver(registry, req.params.rid) }
    const r = block !== undefined ? exportBlock(wb, block, latex) : exportNotes(wb, keys, latex)
    const ascii = /[A-Za-z0-9]/.test(r.filename.replace(/\.zip$/, '')) ? r.filename.replace(/[^\x20-\x7e]+/g, '_').replace(/["\\]/g, '_') : 'notes.zip'
    return reply.type('application/zip').header('cache-control', 'no-store')
      .header('content-disposition', `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(r.filename)}`).send(r.zip)
  })
}
