// 보조 노트(블록) 편집과 컴파일·위치 이동
import type { FastifyInstance } from 'fastify'
import fs from 'node:fs'
import * as C from '@rw/core/contract/research'
import { parseBody, replies } from '../contract.js'
import { buildTree, isBlockStatus, isValidBlockId, parseBlock, STATUS_LABEL_KO, type BlockStatus, type MetaKey, type MetaPatch } from '@rw/core'
import { localDate, localTime } from '../fsutil.js'
import { compileBlock, pdfPath, synctexEdit, synctexView } from '../latex.js'
import { figureEmbedResolver } from '../figureEmbeds.js'
import { requireHash, Workbench, WorkbenchError } from '../workbench.js'
import { isBodyOnly } from '../manuscript.js'
import type { RouteContext } from './context.js'
import { latexChoices, type LatexChoiceQuery } from './latexChoice.js'
import { t } from '../i18n.js'

/** 화면에서 고칠 수 있는 머리말 키. id와 created는 만든 뒤 바꾸지 않는다. */
const EDITABLE: MetaKey[] = ['title', 'status', 'parent', 'alternatives', 'next', 'blocked-reason', 'resume-condition', 'stopped-reason', 'concepts']

type Params = { rid: string; bid: string }

export function registerBlocks(app: FastifyInstance, ctx: RouteContext): void {
  const { registry, wbOf } = ctx
  const { latexPick } = latexChoices(registry)
  app.post<{ Params: { rid: string } }>(
    '/api/researches/:rid/blocks', replies(C.BlockDoc), async (req): Promise<C.BlockDoc> => {
      const wb = wbOf(req.params.rid)
      const { title, id, parent, alternativeOf } = parseBody(C.BlockCreateBody, req.body)
      const newId = wb.createBlock({ title, id, parent, alternativeOf })
      // 다른 시도로 만들었으면 상대 블록에도 적는다 (양쪽 기록)
      if (alternativeOf) linkAlternatives(wb, newId, [alternativeOf], [])
      const { content, hash } = wb.readBlock(newId)
      return { id: newId, format: wb.blockFormat(newId), content, hash, meta: parseBlock(content).meta }
    })

  app.get<{ Params: Params }>('/api/researches/:rid/blocks/:bid', replies(C.BlockDoc), async (req): Promise<C.BlockDoc> => {
    const wb = wbOf(req.params.rid)
    const { content, hash } = wb.readBlock(req.params.bid)
    const format = wb.blockFormat(req.params.bid)
    return { id: req.params.bid, format, content, hash, meta: parseBlock(content).meta, ...(format === 'tex' && !isBodyOnly(content) && { ownHeader: true }) }
  })

  app.put<{ Params: Params }>('/api/researches/:rid/blocks/:bid', replies(C.Saved), async (req, reply) => {
    const { content, baseHash } = parseBody(C.ContentBody, req.body)
    const r = wbOf(req.params.rid).writeBlock(req.params.bid, content, baseHash)
    if (!r.ok) return reply.status(409).send({ error: t('다른 곳에서 파일이 바뀌어 저장하지 않았음', 'Not saved: the file was changed elsewhere'), currentHash: r.currentHash })
    return { hash: r.hash }
  })

  app.delete<{ Params: Params }>('/api/researches/:rid/blocks/:bid', replies(C.Ok), async (req, reply) => {
    const { baseHash } = parseBody(C.BaseHashBody, req.body)
    const result = wbOf(req.params.rid).deleteBlock(req.params.bid, baseHash)
    if (!result.ok) return reply.status(409).send({ error: t('다른 곳에서 파일이 바뀌어 지우지 않았습니다. 파일을 다시 읽어 주세요.', 'Not deleted: the file was changed elsewhere. Read the file again.'), currentHash: result.currentHash })
    return { ok: true as const }
  })

  /**
   * 머리말 고치기. 상태가 바뀌면 일지에 기록하고, 다른 시도는 양쪽 블록에 함께 적는다.
   * 막힘에는 막힌 이유와 재개 조건이, 중지에는 중지 이유가 있어야 한다.
   */
  app.patch<{ Params: Params }>('/api/researches/:rid/blocks/:bid/meta', replies(C.BlockMetaSaved), async (req, reply) => {
    const wb = wbOf(req.params.rid)
    const { bid } = req.params
    const body = parseBody(C.MetaPatchBody, req.body)
    const patch: MetaPatch = body.patch
    for (const k of Object.keys(patch)) if (!EDITABLE.includes(k as MetaKey)) throw new WorkbenchError(400, t(`고칠 수 없는 키: ${k}`, `Key cannot be edited: ${k}`))

    const current = parseBlock(wb.readBlock(bid).content).meta
    const merged = { ...current, ...camel(patch) }
    if (patch.status !== undefined && patch.status !== null && !isBlockStatus(patch.status)) throw new WorkbenchError(400, t(`잘못된 상태: ${String(patch.status)}`, `Invalid status: ${String(patch.status)}`))
    if (merged.status === 'blocked' && (!merged.blockedReason || !merged.resumeCondition)) throw new WorkbenchError(400, t('멈춤에는 멈춘 이유와 다시 시작할 조건이 필요함', 'Blocked needs a reason and a condition to resume'))
    if (merged.status === 'stopped' && !merged.stoppedReason) throw new WorkbenchError(400, t('정지에는 정지 이유가 필요함', 'Dropped needs a reason'))

    const blocks = wb.listBlocks()
    const ids = new Set(blocks.map((b) => b.id))
    if (typeof patch.parent === 'string') {
      if (!ids.has(patch.parent)) throw new WorkbenchError(400, t(`없는 블록: ${patch.parent}`, `No such block: ${patch.parent}`))
      const trial = buildTree(blocks.map((b) => (b.id === bid ? { ...b, meta: { ...b.meta, parent: patch.parent as string } } : b)))
      if (trial.issues.some((i) => i.kind === 'cycle')) throw new WorkbenchError(400, t('고리가 생기는 부모는 정할 수 없음', 'This parent would make a cycle'))
    }
    let alternatives: string[] | undefined
    if (patch.alternatives !== undefined) {
      alternatives = patch.alternatives === null ? [] : Array.isArray(patch.alternatives) ? patch.alternatives : [patch.alternatives]
      for (const a of alternatives) if (!isValidBlockId(a) || !ids.has(a) || a === bid) throw new WorkbenchError(400, t(`다른 시도로 정할 수 없는 블록: ${a}`, `Block cannot be set as an alternative: ${a}`))
    }

    const r = wb.patchMeta(bid, patch, requireHash(body.baseHash))
    if (!r.ok) return reply.status(409).send({ error: t('다른 곳에서 파일이 바뀌어 고치지 않았음', 'Not changed: the file was changed elsewhere'), currentHash: r.currentHash })

    if (alternatives) {
      const before = current.alternatives
      linkAlternatives(wb, bid, alternatives.filter((a) => !before.includes(a)), before.filter((a) => !alternatives!.includes(a)))
    }
    const from = (isBlockStatus(current.status) ? current.status : 'in-progress') as BlockStatus
    if (isBlockStatus(patch.status) && patch.status !== from) {
      const reason = patch.status === 'blocked' ? ` — ${merged.blockedReason} / 다시 시작할 조건: ${merged.resumeCondition}`
        : patch.status === 'stopped' ? ` — ${merged.stoppedReason}` : ''
      wb.appendJournal({ date: localDate(), time: localTime(), kind: 'status', target: bid, text: `${STATUS_LABEL_KO[from]} → ${STATUS_LABEL_KO[patch.status]}${reason}` })
    }
    return { content: r.content, hash: r.hash, meta: parseBlock(r.content).meta }
  })


  app.post<{ Params: Params; Querystring: LatexChoiceQuery }>('/api/researches/:rid/blocks/:bid/compile', replies(C.CompileResult), async (req): Promise<C.CompileResult> => {
    const wb = wbOf(req.params.rid)
    // 선택 없이 쓰던 블록 컴파일은 기존 프로젝트 preamble 서식을 유지한다.
    const picked = req.query.tpl !== undefined || req.query.au !== undefined || req.query.date !== undefined
    return compileBlock(wb, req.params.bid, registry.engine, registry.libraryPath, picked ? latexPick(wb, req.query, true, 'note') : undefined, figureEmbedResolver(registry, req.params.rid))
  })

  app.get<{ Params: Params }>('/api/researches/:rid/blocks/:bid/pdf', async (req, reply) => {
    const file = pdfPath(wbOf(req.params.rid), req.params.bid)
    if (!fs.existsSync(file)) return reply.status(404).send({ error: t('아직 컴파일하지 않음', 'Not compiled yet') })
    return reply.type('application/pdf').header('cache-control', 'no-store').send(fs.createReadStream(file))
  })

  /**
   * 결과 PDF가 지금 노트의 것인지 (C3 "PDF 이전 결과 표시"를 보조 노트에도, 10/5): PDF가 노트 파일보다 먼저 만들어졌으면 stale.
   * 원고처럼 입력 파일 전체를 재지 않고 노트 파일 하나만 본다 (보조 노트는 그 파일이 본문의 전부다)
   */
  app.get<{ Params: Params }>('/api/researches/:rid/blocks/:bid/pdf/state', replies(C.BlockPdfState), async (req): Promise<C.BlockPdfState> => {
    const wb = wbOf(req.params.rid)
    const file = pdfPath(wb, req.params.bid)
    let pdf: fs.Stats
    try { pdf = fs.statSync(file) } catch { return { hasPdf: false, stale: false } }
    const note = fs.statSync(wb.blockPath(req.params.bid))
    return { hasPdf: true, pdfAt: pdf.mtime.toISOString(), stale: note.mtimeMs > pdf.mtimeMs + 1 }
  })

  app.get<{ Params: Params; Querystring: { line: string } }>('/api/researches/:rid/blocks/:bid/synctex/view', replies(C.PdfBoxes), async (req): Promise<C.PdfBoxes> => {
    const line = Number(req.query.line)
    if (!Number.isInteger(line) || line < 1) throw new WorkbenchError(400, t('line은 1 이상의 정수', 'line must be an integer of 1 or more'))
    return { boxes: await synctexView(wbOf(req.params.rid), req.params.bid, line) }
  })

  app.get<{ Params: Params; Querystring: { page: string; x: string; y: string } }>('/api/researches/:rid/blocks/:bid/synctex/edit', replies(C.BlockSpot), async (req): Promise<C.BlockSpot> => {
    const [page, x, y] = [Number(req.query.page), Number(req.query.x), Number(req.query.y)]
    if (![page, x, y].every(Number.isFinite) || page < 1) throw new WorkbenchError(400, t('page, x, y가 필요함', 'page, x, and y are required'))
    return { spot: await synctexEdit(wbOf(req.params.rid), req.params.bid, page, x, y) }
  })
}

/** 다른 시도는 양쪽 블록에 함께 적는다 */
function linkAlternatives(wb: Workbench, id: string, added: string[], removed: string[]): void {
  for (const other of added) {
    const alts = parseBlock(wb.readBlock(other).content).meta.alternatives
    if (!alts.includes(id)) wb.patchMeta(other, { alternatives: [...alts, id] })
  }
  for (const other of removed) {
    const alts = parseBlock(wb.readBlock(other).content).meta.alternatives
    if (alts.includes(id)) wb.patchMeta(other, { alternatives: alts.filter((a) => a !== id) })
  }
}

function camel(patch: MetaPatch): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(patch)) {
    const key = k.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())
    out[key] = v === null ? undefined : v
  }
  return out
}
