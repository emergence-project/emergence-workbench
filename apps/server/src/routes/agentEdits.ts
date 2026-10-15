// 에이전트 고침 검토 (2026-10-08): 에이전트 쓰기(MCP edit_concept · edit_note)와 사용자 검토(문단 단위 승인 · 되돌리기 · 직접 고치기)
import type { FastifyInstance } from 'fastify'
import * as C from '@rw/core/contract/agentEdits'
import { parseBody, replies } from '../contract.js'
import path from 'node:path'
import { parseNoteFixes } from '@rw/core'
import { agentWrite, AgentEditStore, decide, listEdits, readTarget, reviewOf, targetKey, type EditTarget, type Hunk, type TargetIo, type WriteRequest } from '../agentEdits.js'
import { appendAnswer, askPrompt, claudeRunner } from '../ask.js'
import { addComment, commentSourceFile, readComments } from '../comments.js'
import { commonRules, projectRules } from '../agentRules.js'
import { readStatusEdits, writeStatus } from '../agentStatus.js'
import { t } from '../i18n.js'
import { WorkbenchError } from '../workbench.js'
import type { RouteContext } from './context.js'

function parseTarget(v: unknown): EditTarget {
  const o = (v ?? {}) as Record<string, unknown>
  if (o.kind === 'concept' && typeof o.id === 'string' && o.id) return { kind: 'concept', id: o.id }
  if (o.kind === 'note' && typeof o.rid === 'string' && o.rid && typeof o.file === 'string' && o.file) return { kind: 'note', rid: o.rid, file: o.file }
  throw new WorkbenchError(400, t('target은 {kind: "concept", id} 또는 {kind: "note", rid, file}', 'target must be {kind: "concept", id} or {kind: "note", rid, file}'))
}

export function registerAgentEdits(app: FastifyInstance, ctx: RouteContext): void {
  const { registry, wbOf, broadcast, repoPath, opts } = ctx
  /** 지금 에이전트가 답을 쓰는 바뀐 곳 묻기 (같은 기록을 두 번 넘기지 않게) */
  const discussing = new Set<string>()
  const io = (): TargetIo => ({ lib: registry.libraryPath, wbOf })
  const store = () => new AgentEditStore(AgentEditStore.fileFor(registry.configDir, registry.libraryPath))
  /** 화면이 다시 읽게: 노트 쪽은 그 프로젝트의 research 알림, 개념노트는 library 알림 */
  const notify = (tg: EditTarget) => {
    broadcast(tg.kind === 'note' ? { type: 'research', research: tg.rid } : { type: 'library', research: null, part: 'concepts', file: `concepts/${tg.id}.md` })
    if (tg.kind === 'note') {
      try {
        const wb = wbOf(tg.rid)
        if (wb.readResearch().agentStatus) writeStatus(wb, new Date(), readStatusEdits(wb, registry.configDir, tg.rid, registry.libraryPath), commonRules(registry.configDir))
      } catch (e) { app.log.error(e, '에이전트 고침 뒤 STATUS 갱신 실패') }
    }
  }

  /** 목록: 검토를 기다리는 노트(바뀐 곳 수)와 확인된 노트 쓰기 시도. scope = 프로젝트 id 또는 library */
  app.get<{ Querystring: { scope?: string } }>('/api/agent-edits', replies(C.EditList), async (req): Promise<C.EditList> => listEdits(io(), store(), req.query.scope || undefined, true))

  /** 검토 하나: 기준판과 지금 글의 바뀐 곳. 바뀐 곳이 없으면 review: null */
  app.get<{ Querystring: { key?: string } }>('/api/agent-edits/review', replies(C.EditReviewOne), async (req): Promise<C.EditReviewOne> => {
    if (!req.query.key) throw new WorkbenchError(400, t('key가 필요함', 'key is required'))
    return { review: reviewOf(io(), store(), req.query.key) }
  })

  /** 바뀐 곳 하나 정하기 (accept 승인 · revert 되돌리기 · edit 직접 고치기) */
  app.post('/api/agent-edits/review', replies(C.EditReviewOne), async (req): Promise<C.EditReviewOne> => {
    const b = parseBody(C.DecideBody, req.body)
    const s = store()
    const target = s.pending(b.key)?.target
    const review = decide(io(), s, b)
    if (target) notify(target)
    return { review }
  })

  /**
   * 바뀐 곳에서 묻기 (10/14 진행): 그 문단에 붙는 노트 기록(질문)을 남기고 바로 돌아온다. 그 뒤 맥의 Claude가 답을 쓰고,
   * 수정이면 답의 before/after 고침을 에이전트 고침으로 다시 쓴다(검토 대상으로 남는다). Claude를 부르지 못하면 기록은 대기로 남아
   * 에이전트 차례로 잡힌다(STATUS · MCP read_records). 끝나면 research 알림으로 화면이 다시 읽는다.
   */
  app.post('/api/agent-edits/discuss', replies(C.EditDiscussed), async (req): Promise<C.EditDiscussed> => {
    const b = parseBody(C.DiscussBody, req.body)
    const text = b.text.trim()
    if (!text) throw new WorkbenchError(400, t('물을 글이 필요함', 'Text is required'))
    const s = store()
    const rv = reviewOf(io(), s, b.key)
    if (!rv) throw new WorkbenchError(404, t('검토할 고침이 없음', 'Nothing to review'))
    if (rv.hash !== b.hash) throw new WorkbenchError(409, t('그사이 노트가 바뀌었습니다. 다시 열어 주세요', 'The note changed in the meantime. Open it again'))
    const h = rv.hunks.find((x) => x.id === b.hunk)
    if (!h) throw new WorkbenchError(409, t('그 바뀐 곳이 더는 없습니다. 다시 열어 주세요', 'That change is no longer there. Open it again'))
    if (rv.target.kind !== 'note' || !rv.record) throw new WorkbenchError(400, t('연구 저장소의 노트에서만 물을 수 있습니다', 'You can ask only about notes in a research repository'))
    const target = rv.target
    const rec = rv.record
    const root = wbOf(target.rid).root
    const { entry } = addComment(root, rec.target, {
      kind: '질문', title: rec.title, source: rec.source, text, edit: b.ask,
      ...(h.current && { quote: h.current }), ...(h.base && { editBase: h.base.slice(0, 200) }),
    })
    notify(target)
    const job = `${root}/${rec.target}/${entry.id}`
    discussing.add(job)
    void answerDiscussion(target, rec, entry.id, b.ask, h, text).catch((e) => app.log.warn(e, '고침 묻기의 답을 쓰지 못함 (기록은 에이전트 차례로 남음)')).finally(() => { discussing.delete(job); notify(target) })
    return { review: rv, file: readComments(root, rec.target) }
  })

  async function answerDiscussion(target: Extract<EditTarget, { kind: 'note' }>, rec: NonNullable<C.EditReview['record']>, id: string, ask: C.EditAsk, h: Hunk, text: string) {
    const repo = repoPath(target.rid)
    const root = wbOf(target.rid).root
    const f = readComments(root, rec.target)
    const source = commentSourceFile(root, f)
    const file = source ? path.relative(repo, source) : target.file
    const prompt = [
      askPrompt(f, id, { repo, file, rules: projectRules(repo) }),
      '',
      t('이 질문은 앱의 "고침 검토"에서 에이전트가 고친 문단 하나에 대해 남긴 것입니다.', 'This question was left in the app\'s edit review about one paragraph an agent changed.'),
      t(`고치기 전 글:\n${h.base || '(없음: 새 문단)'}`, `Text before the change:\n${h.base || '(none: new paragraph)'}`),
      t(`지금 글:\n${h.current || '(없음: 지운 문단)'}`, `Current text:\n${h.current || '(none: deleted paragraph)'}`),
      ask === '수정'
        ? t('연구자는 이 문단을 다시 고쳐 달라고 했습니다. 무엇을 왜 바꾸는지 한두 줄 적고, 지금 파일의 글을 ```before 블록에 그대로, 바꾼 글을 바로 뒤 ```after 블록에 적습니다(반드시). 앱이 그 고침을 에이전트 고침으로 써서 다시 검토받습니다.',
          'The researcher asked you to change this paragraph again. Write a line or two on what you change and why, then put the current file text verbatim in a ```before block and the new text right after in an ```after block (required). The app writes it as an agent edit for review again.')
        : t('연구자는 왜 이렇게 고쳤는지 묻습니다. 고친 이유와 근거를 답합니다. 고칠 글은 제안하지 않습니다.', 'The researcher asks why it was changed this way. Answer with the reason and grounds. Do not suggest changes.'),
    ].join('\n')
    const answer = await (opts.ask ?? claudeRunner)({ cwd: repo, prompt })
    appendAnswer(root, rec.target, id, 'claude', answer)
    if (ask !== '수정') return
    const fixes = parseNoteFixes(answer)
    if (!fixes.length) { appendAnswer(root, rec.target, id, '앱', '답에 고침(before/after)이 없어 노트를 고치지 않았습니다.'); return }
    try {
      const st = readTarget(io(), target)
      agentWrite(io(), store(), { target, baseHash: st.hash, edits: fixes.map((x) => ({ old: x.before, new: x.after, reason: text })), approved: true, agent: 'claude', summary: t(`수정 요청: ${text}`, `Revision request: ${text}`).slice(0, 200) })
    } catch (e) {
      appendAnswer(root, rec.target, id, '앱', `고침을 노트에 쓰지 못했습니다: ${(e as Error).message}`)
    }
  }

  /** 에이전트 쓰기: 작업 중인 노트는 바로 쓰고 기준판을 남긴다. 확인된 노트는 approved 없이 428과 사용자 차례 알림 */
  app.post<{ Body: WriteRequest }>('/api/agent-edits/write', replies(C.AgentWritten), async (req, reply): Promise<C.AgentWritten> => {
    const b = req.body ?? ({} as WriteRequest)
    if (typeof b.baseHash !== 'string') throw new WorkbenchError(400, t('baseHash가 필요함', 'baseHash is required'))
    const target = parseTarget(b.target)
    const r = agentWrite(io(), store(), { ...b, target, approved: b.approved === true })
    notify(target)
    if (!r.ok) return reply.status(r.status).send({ error: r.error, key: targetKey(target) })
    return { ...r, key: targetKey(target) }
  })

  /** 확인된 노트 쓰기 시도를 지운다 (사용자가 보았음) */
  app.delete<{ Querystring: { key?: string } }>('/api/agent-edits/attempts', replies(C.EditOk), async (req): Promise<C.EditOk> => {
    const key = req.query.key
    if (!key) throw new WorkbenchError(400, t('key가 필요함', 'key is required'))
    const s = store()
    const target = s.read().attempts.find((a) => a.key === key)?.target
    s.update((d) => { d.attempts = d.attempts.filter((a) => a.key !== key) })
    if (target) notify(target)
    return { ok: true }
  })
}
