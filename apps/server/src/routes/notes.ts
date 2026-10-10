// 노트 한 목록 (연구노트·계산 노트·블록 노트)과 노트 머리말·링크 (10/5 "주제와 노트")
import path from 'node:path'
import type { FastifyInstance } from 'fastify'
import * as C from '@rw/core/contract/notes'
import { parseBody, replies } from '../contract.js'
import { listNotes, noteLinks, writeNoteHead } from '../noteList.js'
import { revealInFinder } from '../materials.js'
import { requireHash, WorkbenchError } from '../workbench.js'
import type { RouteContext } from './context.js'
import { t } from '../i18n.js'

export function registerNotes(app: FastifyInstance, ctx: RouteContext): void {
  const { wbOf } = ctx
  /** 프로젝트의 노트 전부 (지운 노트 빼고, 최근 고친 것부터): 상태 · 다시 열 조건 · 성격 · 설명 · 주제 · ★ · 고친 때 */
  app.get<{ Params: { rid: string } }>('/api/researches/:rid/notes', replies(C.NoteList), async (req): Promise<C.NoteList> => ({ notes: listNotes(wbOf(req.params.rid)) }))
  /** 노트 머리말 고치기: { file, patch: { title, topics, kind, description, star }, baseHash(줄의 hash) } */
  app.patch<{ Params: { rid: string } }>('/api/researches/:rid/notes/head', replies(C.NoteOne), async (req): Promise<C.NoteOne> => {
    const b = parseBody(C.NoteHeadBody, req.body)
    return { note: writeNoteHead(wbOf(req.params.rid), b.file, b.patch, requireHash(b.baseHash, t('노트 목록 줄의 hash', 'hash of the note list row'))) }
  })
  /** 노트 링크에서 모은 두 목록: 쓰는 개념노트(본문에 처음 나온 순서), 이 노트를 인용한 노트(최근 고친 순) */
  app.get<{ Params: { rid: string }; Querystring: { file?: string } }>('/api/researches/:rid/notes/links', replies(C.NoteLinks), async (req): Promise<C.NoteLinks> => {
    if (typeof req.query.file !== 'string' || !req.query.file) throw new WorkbenchError(400, t('file이 필요함', 'file is required'))
    const ix = ctx.conceptIndex()
    return noteLinks(wbOf(req.params.rid), req.query.file, ix && { resolve: (n) => ix.resolve(n), rows: (ids) => ix.rows(ids) })
  })
  /** 노트 파일을 Finder에서 보인다 (맥, 노트 도구 줄 ⋯ "Finder에서 보기"): { file } */
  app.post<{ Params: { rid: string } }>('/api/researches/:rid/notes/reveal', replies(C.NoteOk), async (req): Promise<C.NoteOk> => {
    const wb = wbOf(req.params.rid)
    const { file } = parseBody(C.NoteRevealBody, req.body)
    const row = listNotes(wb).find((n) => n.file === file)
    if (!row) throw new WorkbenchError(404, t(`노트가 아님: ${file}`, `Not a note: ${file}`))
    await revealInFinder(path.join(wb.repo, row.file))
    return { ok: true }
  })
}
