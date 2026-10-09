// 논문 라이브러리 (왼쪽 띠 "논문")
import { matchesSubject } from '../subjects.js'
import { paperBrief } from '../papers.js'
import type { FastifyInstance } from 'fastify'
import fs from 'node:fs'
import path from 'node:path'
import { askPrompt, claudeRunner } from '../ask.js'
import { addPaperNote, appendPaperAnswer, deletePaperNote, readPaperComments, updatePaperNote } from '../paperComments.js'
import { addPaper, addPaperPdf } from '../paperAdd.js'
import { cloudOf, libraryBibEntries, markOpened, paperPdfFile, setPaperProjects, detex } from '../papers.js'
import { WorkbenchError } from '../workbench.js'
import type { RouteContext } from './context.js'
import { t } from '../i18n.js'

export function registerPapers(app: FastifyInstance, ctx: RouteContext): void {
  const { registry, opts } = ctx
  const libOf = () => { const lib = registry.libraryPath; if (!lib) throw new WorkbenchError(400, t('공유 라이브러리가 설정되지 않았습니다', 'No shared library is set')); return lib }
  const titleOf = (lib: string, key: string) => { const e = libraryBibEntries(lib).find((x) => x.key === key); if (!e) throw new WorkbenchError(404, t(`references.bib에 없는 키: ${key}`, `Key not in references.bib: ${key}`)); return t(`논문 ${detex(e.title ?? key)}`, `Paper ${detex(e.title ?? key)}`) }
  const read = (key: string) => { const lib = libOf(); return readPaperComments(lib, key, titleOf(lib, key)) }
  const asking = new Set<string>()
  /** 라이브러리 bib의 논문 목록: 관련 프로젝트, PDF 위치(이 맥 · 클라우드 · 없음), 코멘트 수 */
  app.get<{ Querystring: { subjectPrefix?: string } }>('/api/papers', async (req) => {
    const list = ctx.libraryReads.papers()
    return req.query.subjectPrefix === undefined ? list : { ...list, papers: list.papers.filter((x) => matchesSubject(x.subjects, req.query.subjectPrefix!)) }
  })
  /** 논문 첫 화면: 최근 더한 논문(?recent=개수) · 점검(PDF 폴더 없음 · 답 온 질문) · 통계(PDF 없음 · arXiv로 받을 수 있음 · 프로젝트에 안 묶임 · 논문 · 책) · PDF 폴더 */
  app.get<{ Querystring: { recent?: string; subjectPrefix?: string } }>('/api/papers/brief', async (req) => {
    const recent = Math.min(Number(req.query.recent) || 8, 50)
    if (req.query.subjectPrefix === undefined) return ctx.libraryReads.papersBrief(recent)
    const list = ctx.libraryReads.papers()
    return paperBrief({ ...list, papers: list.papers.filter((x) => matchesSubject(x.subjects, req.query.subjectPrefix!)) }, recent)
  })
  /** 관련 프로젝트(손으로 적은 것)를 바꾼다: research-library/papers.yaml */
  app.put<{ Params: { key: string }; Body: { projects?: unknown } }>('/api/papers/:key/projects', async (req) => ({ projects: setPaperProjects(registry, req.params.key, req.body?.projects) }))
  /** 더하기: arXiv 번호나 DOI (references.bib 끝에 덧붙이고, arXiv면 PDF도 받는다) */
  app.post<{ Body: { id?: unknown } }>('/api/papers', async (req) => addPaper(registry, req.body?.id))
  /** 끌어다 놓은 PDF (application/octet-stream, ?name=파일 이름, ?id=번호를 따로 적었을 때) */
  app.put<{ Querystring: { name?: string; id?: string }; Body: Buffer }>('/api/papers/upload', { bodyLimit: 200 * 1024 * 1024 }, async (req) => addPaperPdf(registry, req.query.name, req.body, req.query.id))
  /** PDF. 클라우드에만 있으면 읽는 동안 맥이 받아 온다 */
  app.get<{ Params: { key: string }; Querystring: { peek?: string } }>('/api/papers/:key/pdf', async (req, reply) => {
    const file = paperPdfFile(registry, req.params.key)
    // 카드 표지(첫 쪽)를 그릴 때는 연 것으로 치지 않는다
    if (req.query.peek !== '1') { markOpened(registry.configDir, req.params.key); ctx.libraryReads.invalidatePapers() }
    return reply.type('application/pdf').header('cache-control', 'no-store').send(fs.createReadStream(file))
  })
  /** 설정 › 라이브러리 관리 › 논문. 첫 화면과 같은 cloudOf 분류를 쓴다. */
  app.get('/api/papers/folders', async () => ({ folders: registry.pdfFoldersSet.map((p) => ({ path: p, exists: fs.existsSync(p), cloud: cloudOf(p) })) }))
  app.put<{ Body: { folders?: unknown } }>('/api/papers/folders', async (req) => {
    registry.setPdfFolders(req.body?.folders)
    return { folders: registry.pdfFoldersSet.map((p) => ({ path: p, exists: fs.existsSync(p), cloud: cloudOf(p) })) }
  })

  /** 논문의 코멘트 · 질문 · 하이라이트 (research-library/comments/<키>/<id>.md) */
  app.get<{ Params: { key: string } }>('/api/papers/:key/comments', async (req) => read(req.params.key))
  app.post<{ Params: { key: string }; Body: Record<string, unknown> }>('/api/papers/:key/comments', async (req) => {
    const lib = libOf()
    titleOf(lib, req.params.key)
    const { id } = addPaperNote(lib, req.params.key, req.body ?? {})
    return { id, file: read(req.params.key) }
  })
  app.patch<{ Params: { key: string; id: string }; Body: { state?: unknown; color?: unknown; baseHash?: unknown } }>('/api/papers/:key/comments/:id', async (req) => {
    updatePaperNote(libOf(), req.params.key, req.params.id, req.body ?? {}, req.body?.baseHash); return read(req.params.key)
  })
  app.delete<{ Params: { key: string; id: string }; Querystring: { baseHash?: string } }>('/api/papers/:key/comments/:id', async (req) => {
    deletePaperNote(libOf(), req.params.key, req.params.id, req.query.baseHash); return read(req.params.key)
  })
  /** 질문을 맥의 Claude에게 넘기고, 답이 오면 그 파일 끝에 덧붙인다 (PDF가 클라우드에만 있으면 읽는 동안 받아 온다) */
  app.post<{ Params: { key: string; id: string } }>('/api/papers/:key/comments/:id/answer', async (req) => {
    const { key, id } = req.params
    const f = read(key)
    if (!f.comments.some((c) => c.id === id && c.kind === '질문')) throw new WorkbenchError(404, t(`질문이 없음: ${id}`, `No such question: ${id}`))
    if (asking.has(`${key}/${id}`)) throw new WorkbenchError(409, t('Claude가 이미 이 질문에 답을 쓰고 있습니다', 'Claude is already writing an answer to this question'))
    asking.add(`${key}/${id}`)
    try {
      const pdf = paperPdfFile(registry, key)
      const answer = await (opts.ask ?? claudeRunner)({ cwd: path.dirname(pdf), prompt: askPrompt(f, id, { repo: path.dirname(pdf), file: path.basename(pdf) }) })
      appendPaperAnswer(libOf(), key, id, 'claude', answer)
      return read(key)
    } finally { asking.delete(`${key}/${id}`) }
  })
}
