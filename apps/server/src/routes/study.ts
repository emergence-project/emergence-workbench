import type { FastifyInstance } from 'fastify'
import * as C from '@rw/core/contract/study'
import { parseBody, replies } from '../contract.js'
import { createStudy, listStudy, readStudy, saveStudy } from '../study.js'
import type { RouteContext } from './context.js'

/** 공부(책 · 강의, 라이브러리 study/<id>.yaml). 옛 Obsidian Study 읽기(/api/study, /api/study/note)와 겹치지 않게 /api/library/study */
export function registerStudy(app: FastifyInstance, ctx: RouteContext): void {
  const lib = () => ctx.registry.libraryPath
  app.get('/api/library/study', replies(C.StudyBooks), async (): Promise<C.StudyBooks> => listStudy(lib()))
  app.post('/api/library/study', replies(C.StudyCreated), async (req): Promise<C.StudyCreated> => createStudy(lib(), parseBody(C.NewStudyBookBody, req.body)))
  app.get<{ Params: { id: string } }>('/api/library/study/:id', replies(C.StudyBook), async (req): Promise<C.StudyBook> => {
    const ix = ctx.conceptIndex()
    await ix?.ready()
    return readStudy(lib(), req.params.id, (ids) => ix?.rows(ids) ?? [])
  })
  app.put<{ Params: { id: string } }>('/api/library/study/:id', replies(C.StudyBook), async (req): Promise<C.StudyBook> => {
    saveStudy(lib(), req.params.id, parseBody(C.SaveStudyBookBody, req.body))
    const ix = ctx.conceptIndex()
    return readStudy(lib(), req.params.id, (ids) => ix?.rows(ids) ?? [])
  })
}
