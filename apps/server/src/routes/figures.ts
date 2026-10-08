// 그림 라이브러리 (왼쪽 띠 "그림")
import { matchesSubject } from '../subjects.js'
import { figureBrief } from '../figures.js'
import type { FastifyInstance } from 'fastify'
import fs from 'node:fs'
import { addFigure, figureFile, listFigureSources, resolveFigure, setFigureMeta, tikzSvg } from '../figures.js'
import { openWithSystem, revealInFinder } from '../materials.js'
import { WorkbenchError } from '../workbench.js'
import type { RouteContext } from './context.js'
import { t } from '../i18n.js'

const TYPES = { svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', pdf: 'application/pdf' } as const

export function registerFigures(app: FastifyInstance, ctx: RouteContext): void {
  const { registry } = ctx
  /** 공용(research-library/figures)과 프로젝트 전용(workbench/figures) 그림, 그림마다 쓰는 노트 */
  app.get<{ Querystring: { subjectPrefix?: string } }>('/api/figures', async (req) => {
    const list = ctx.libraryReads.figures()
    return req.query.subjectPrefix === undefined ? list : { ...list, figures: list.figures.filter((x) => matchesSubject(x.subjects, req.query.subjectPrefix!)) }
  })
  /** 그림 첫 화면: 최근 더한 그림(?recent=개수) · 점검(그림으로 못 바꾼 tikz) · 통계(원본 종류 · 쓰는 노트 없음) · 저장 위치 수 */
  app.get<{ Querystring: { recent?: string; subjectPrefix?: string } }>('/api/figures/brief', async (req) => {
    const recent = Math.min(Number(req.query.recent) || 8, 50)
    if (req.query.subjectPrefix === undefined) return ctx.libraryReads.figuresBrief(recent)
    const list = ctx.libraryReads.figures()
    return figureBrief({ ...list, figures: list.figures.filter((x) => matchesSubject(x.subjects, req.query.subjectPrefix!)) }, recent)
  })
  /** 그림 하나. tikz는 SVG로 바꿔서 (맥의 TeX가 있어야), ?source=1이면 원본 글 */
  app.get<{ Querystring: { id?: string; source?: string } }>('/api/figures/file', async (req, reply) => {
    const { abs, kind } = figureFile(registry, req.query.id)
    reply.header('cache-control', 'no-cache')
    // SVG를 주소로 바로 열어도 그 안의 스크립트는 돌지 않게
    reply.header('content-security-policy', "script-src 'none'")
    if (kind === 'tikz') {
      if (req.query.source === '1') return reply.type('text/plain; charset=utf-8').send(fs.readFileSync(abs, 'utf8'))
      try { return reply.type(TYPES.svg).send(fs.createReadStream(await tikzSvg(registry.configDir, abs))) }
      finally { ctx.libraryReads.invalidateFigures() }
    }
    return reply.type(TYPES[kind]).send(fs.createReadStream(abs))
  })
  /** 노트의 ![[이름]]: 그 프로젝트(rid) 전용 그림 먼저, 그다음 공용 */
  app.get<{ Querystring: { name?: string; rid?: string } }>('/api/figures/embed', async (req, reply) => {
    const name = (req.query.name ?? '').trim()
    const fig = resolveFigure(listFigureSources(registry), name, req.query.rid || undefined)
    if (!fig) throw new WorkbenchError(404, t(`없는 그림: ${name}`, `No such figure: ${name}`))
    return reply.redirect(`/api/figures/file?id=${encodeURIComponent(fig.id)}`)
  })
  /** 끌어다 놓은 그림 (application/octet-stream, ?name=파일 이름, ?scope=library 또는 프로젝트 id) */
  app.put<{ Querystring: { name?: string; scope?: string }; Body: Buffer }>('/api/figures/upload', { bodyLimit: 50 * 1024 * 1024 }, async (req) =>
    addFigure(registry, req.query.scope, req.query.name, req.body))
  /** 이름과 설명: { id, name?, description? } (figures.yaml) */
  app.patch<{ Body: { id?: unknown; name?: unknown; description?: unknown } }>('/api/figures/meta', async (req) => {
    setFigureMeta(registry, req.body?.id, req.body ?? {})
    return { ok: true }
  })
  /** 원본 고치기: 맥의 기본 앱으로 연다 · Finder에서 보기 */
  app.post<{ Body: { id?: unknown; reveal?: unknown } }>('/api/figures/open', async (req) => {
    const { abs } = figureFile(registry, req.body?.id)
    await (req.body?.reveal ? revealInFinder(abs) : openWithSystem(abs))
    return { ok: true }
  })
}
