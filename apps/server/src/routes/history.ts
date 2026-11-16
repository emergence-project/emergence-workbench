// 파일 이력 (11/16 시안 N7ik 2절 ③′): 노트 툴바 시계 → 오른쪽 사이드바의 커밋 목록, 고른 커밋의 전 · 후 글
import type { FastifyInstance } from 'fastify'
import * as C from '@rw/core/contract/history'
import { replies } from '../contract.js'
import { fileHistory, fileVersions } from '../fileHistory.js'
import { repoRelative } from '../repoFiles.js'
import type { RouteContext } from './context.js'

export function registerHistory(app: FastifyInstance, ctx: RouteContext): void {
  app.get<{ Params: { rid: string }; Querystring: { path?: string } }>('/api/researches/:rid/history', replies(C.FileHistory), async (req): Promise<C.FileHistory> => {
    const root = ctx.repoPath(req.params.rid)
    return fileHistory(root, repoRelative(root, req.query.path ?? ''))
  })
  app.get<{ Params: { rid: string }; Querystring: { path?: string; to?: string; from?: string } }>('/api/researches/:rid/history/versions', replies(C.FileVersions), async (req): Promise<C.FileVersions> => {
    const root = ctx.repoPath(req.params.rid)
    const rev = (s?: string) => (s && /^[0-9a-f]{4,40}$/i.test(s) ? s : undefined)
    const to = rev(req.query.to)
    if (!to) return { before: '', after: '', found: false }
    return fileVersions(root, repoRelative(root, req.query.path ?? ''), to, rev(req.query.from))
  })
}
