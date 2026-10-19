// 기록 글 속 저장소 경로 열기 (10/19): 찾기 · 원본 · 맥 앱으로 열기
import type { FastifyInstance } from 'fastify'
import fs from 'node:fs'
import path from 'node:path'
import * as C from '@rw/core/contract/research'
import { parseBody, replies } from '../contract.js'
import { contentTypeOf, openWithSystem } from '../materials.js'
import { findRepoFile, readRepoText, repoRelative } from '../repoFiles.js'
import { WorkbenchError } from '../workbench.js'
import type { RouteContext } from './context.js'
import { t } from '../i18n.js'

export function registerFiles(app: FastifyInstance, ctx: RouteContext): void {
  /** 적힌 경로를 찾는다. body=1이면 글 파일의 내용도 (링크를 그릴 때는 찾기만) */
  app.get<{ Params: { rid: string }; Querystring: { path?: string; body?: string } }>('/api/researches/:rid/file', replies(C.RepoFile), async (req): Promise<C.RepoFile> => {
    const root = ctx.repoPath(req.params.rid)
    const found = await findRepoFile(root, req.query.path ?? '')
    if (req.query.body !== '1') return found
    const body = await readRepoText(root, found)
    return body ? { ...found, ...body } : found
  })
  /** 지금 있는 파일의 원본 (PDF · 그림을 탭에 그릴 때) */
  app.get<{ Params: { rid: string }; Querystring: { path?: string } }>('/api/researches/:rid/file/raw', async (req, reply) => {
    const root = ctx.repoPath(req.params.rid)
    const file = path.join(root, repoRelative(root, req.query.path ?? ''))
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new WorkbenchError(404, t('저장소에 없는 파일', 'File not in the repository'))
    return reply.type(contentTypeOf(file)).header('cache-control', 'no-store').send(fs.createReadStream(file))
  })
  app.post<{ Params: { rid: string } }>('/api/researches/:rid/file/open', replies(C.Ok), async (req): Promise<C.Ok> => {
    const root = ctx.repoPath(req.params.rid)
    const file = path.join(root, repoRelative(root, parseBody(C.RepoFileOpen, req.body).path))
    if (!fs.existsSync(file)) throw new WorkbenchError(404, t('저장소에 없는 파일', 'File not in the repository'))
    await openWithSystem(file)
    return { ok: true as const }
  })
}
