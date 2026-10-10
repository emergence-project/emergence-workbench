// 일지
import fs from 'node:fs'
import path from 'node:path'
import type { FastifyInstance } from 'fastify'
import * as C from '@rw/core/contract/research'
import { parseBody, replies } from '../contract.js'
import { RESEARCH_TARGET, type JournalKind } from '@rw/core'
import { localDate, localTime } from '../fsutil.js'
import { WorkbenchError } from '../workbench.js'
import { deleteComment, linkedTodoRecord, updateComment } from '../comments.js'
import type { RouteContext } from './context.js'
import { t as tx } from '../i18n.js'

/** 사람이 직접 남기는 일지 기록. 상태·완료 기록은 앱이 남긴다 */
const WRITABLE_KINDS: JournalKind[] = ['memo', 'todo']

export function registerJournal(app: FastifyInstance, ctx: RouteContext): void {
  const { wbOf } = ctx
  app.get<{ Params: { rid: string }; Querystring: { days?: string } }>('/api/researches/:rid/journal', replies(C.JournalList), async (req): Promise<C.JournalList> => {
    const days = Math.min(365, Math.max(1, Number(req.query.days ?? 30) || 30))
    return { entries: wbOf(req.params.rid).recentJournal(days) }
  })

  app.post<{ Params: { rid: string } }>('/api/researches/:rid/journal', replies(C.JournalEntryReply), async (req): Promise<C.JournalEntryReply> => {
    const { kind, target, text } = parseBody(C.JournalAddBody, req.body)
    if (!WRITABLE_KINDS.includes(kind)) throw new WorkbenchError(400, tx('메모나 할 일만 직접 남길 수 있음', 'Only memos and to-dos can be added directly'))
    if (typeof text !== 'string' || !text.trim()) throw new WorkbenchError(400, tx('내용이 필요함', 'Text is required'))
    const wb = wbOf(req.params.rid)
    const t = target && target !== RESEARCH_TARGET ? target : RESEARCH_TARGET
    // 붙일 곳: 연구 전체, 블록 노트 id, 또는 노트 파일(예전 .tex와 Markdown 노트).
    const isNote = (/\.tex$/.test(t) || /^workbench\/notes\/[^/]+\/note\.md$/.test(t)) && !t.split(/[\\/]/).includes('..') && !path.isAbsolute(t) && fs.existsSync(path.join(wb.repo, t))
    if (t !== RESEARCH_TARGET && !isNote && !wb.listBlocks().some((b) => b.id === t)) throw new WorkbenchError(400, tx(`없는 블록: ${t}`, `No such block: ${t}`))
    return { entry: wb.appendJournal({ date: localDate(), time: localTime(), kind, target: t, text }) }
  })

  app.patch<{ Params: { rid: string; date: string; index: string } }>('/api/researches/:rid/journal/:date/:index', replies(C.JournalEdited), async (req): Promise<C.JournalEdited> => {
    const wb = wbOf(req.params.rid)
    const index = Number(req.params.index)
    const journals = wb.readJournal(req.params.date)
    const before = journals[index]
    const body = parseBody(C.JournalPatchBody, req.body)
    if (!before || before.text !== body.was) throw new WorkbenchError(409, tx('그새 일지가 바뀌었습니다. 다시 열어 주세요.', 'The journal changed in the meantime. Open it again.'))
    if (before.link !== body.link) throw new WorkbenchError(409, tx('그새 일지의 연결이 달라졌습니다. 다시 열어 주세요.', 'The journal link changed in the meantime. Open it again.'))
    const linked = linkedTodoRecord(wb.root, before, journals)
    if (typeof body.text === 'string') {
      if (linked) {
        updateComment(wb.root, linked.file.target, linked.record.id, { text: body.text }, linked.file.hash)
        return { entry: wb.readJournal(req.params.date)[index] ?? null }
      }
      return { entry: wb.editJournal(req.params.date, index, body.was, body.text) }
    }
    if (typeof body.done !== 'boolean') throw new WorkbenchError(400, tx('done이 필요함', 'done is required'))
    if (linked) {
      updateComment(wb.root, linked.file.target, linked.record.id, { state: body.done ? '끝냄' : '대기' }, linked.file.hash)
      return { entry: wb.readJournal(req.params.date)[index] ?? null }
    }
    const entry = wb.setTodo(req.params.date, index, body.done, body.was)
    if (body.done && before.kind === 'todo' && !before.done) wb.appendJournal({ date: localDate(), time: localTime(), kind: 'done', target: entry.target, text: entry.text })
    return { entry }
  })

  app.delete<{ Params: { rid: string; date: string; index: string }; Querystring: { was?: string; link?: string } }>('/api/researches/:rid/journal/:date/:index', replies(C.Ok), async (req): Promise<C.Ok> => {
    if (typeof req.query.was !== 'string') throw new WorkbenchError(400, tx('was가 필요함', 'was is required'))
    const wb = wbOf(req.params.rid)
    const index = Number(req.params.index)
    const journals = wb.readJournal(req.params.date)
    const before = journals[index]
    if (!before || before.text !== req.query.was) throw new WorkbenchError(409, tx('그새 일지가 바뀌었습니다. 다시 열어 주세요.', 'The journal changed in the meantime. Open it again.'))
    if (before.link !== req.query.link) throw new WorkbenchError(409, tx('그새 일지의 연결이 달라졌습니다. 다시 열어 주세요.', 'The journal link changed in the meantime. Open it again.'))
    const linked = linkedTodoRecord(wb.root, before, journals)
    if (linked) deleteComment(wb.root, linked.file.target, linked.record.id, linked.file.hash)
    else wb.editJournal(req.params.date, index, req.query.was, null)
    return { ok: true as const }
  })
}
