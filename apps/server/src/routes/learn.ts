// 공부할 것: 읽다가 남긴 "모름"과 개념노트 초안 (research-library/to-learn.yaml)
import type { FastifyInstance } from 'fastify'
import { claudeRunner } from '../ask.js'
import { conceptMdExists, listConceptMd, readConceptMemo, writeConceptMemo } from '../conceptNotes.js'
import { addLearn, draftMemo, draftPrompt, learnItem, parseDraft, readLearn, removeLearn, setLearnConcept, type NewLearn } from '../learn.js'
import { createConcept } from '../libraryNotes.js'
import { readSubjects } from '../subjects.js'
import { WorkbenchError } from '../workbench.js'
import type { RouteContext } from './context.js'
import { t } from '../i18n.js'

export function registerLearn(app: FastifyInstance, ctx: RouteContext): void {
  const { registry, opts } = ctx
  /** 지금 Claude가 초안을 쓰고 있는 항목 (같은 것을 두 번 넘기지 않게, 화면을 다시 열어도 보이게) */
  const drafting = new Set<string>()
  const withDrafting = <T extends object>(list: T) => ({ ...list, drafting: [...drafting] })

  app.get('/api/learn', async () => withDrafting(readLearn(registry.libraryPath)))
  app.post<{ Body: NewLearn }>('/api/learn', async (req) => {
    const { item, list } = addLearn(registry.libraryPath, req.body ?? {})
    return { item, ...withDrafting(list) }
  })
  app.delete<{ Params: { id: string } }>('/api/learn/:id', async (req) => withDrafting(removeLearn(registry.libraryPath, req.params.id)))
  /** 이미 있는 개념노트에 잇거나(concept), 연결을 푼다(빈 값) */
  app.post<{ Params: { id: string }; Body: { concept?: unknown } }>('/api/learn/:id/concept', async (req) => {
    const c = typeof req.body?.concept === 'string' && req.body.concept.trim() ? req.body.concept.trim() : undefined
    if (c && !conceptMdExists(registry.libraryPath, c)) throw new WorkbenchError(404, t(`개념노트가 없음: ${c}`, `No such concept note: ${c}`))
    return withDrafting(setLearnConcept(registry.libraryPath, req.params.id, c))
  })
  /**
   * 맥의 Claude(claude -p, 읽기 도구만)가 개념노트 초안을 쓰고, 앱이 concepts/<id>.md와 옆 메모로 만든다.
   * 같은 개념이 이미 있다고 답하면 그 노트에 잇기만 한다. 답이 올 때까지(몇 분) 기다린다.
   */
  app.post<{ Params: { id: string } }>('/api/learn/:id/draft', async (req) => {
    const lib = registry.libraryPath
    const it = learnItem(lib, req.params.id)
    if (it.concept && conceptMdExists(lib, it.concept)) throw new WorkbenchError(409, t('이미 개념노트가 이어져 있습니다', 'A concept note is already linked'))
    if (drafting.has(it.id)) throw new WorkbenchError(409, t('Claude가 이미 이 초안을 쓰고 있습니다', 'Claude is already writing this draft'))
    drafting.add(it.id)
    try {
      const idsModel = readSubjects(lib).enabled
      const subjects = idsModel ? [] : [...new Set(listConceptMd(lib).map((n) => n.meta.subject).filter((s): s is string => !!s))].sort()
      const out = await (opts.ask ?? claudeRunner)({ cwd: lib!, prompt: draftPrompt(it, subjects) + (idsModel ? '\n분류는 앱의 분류 고르기에서 정합니다. SUBJECT: 없음으로 출력하세요.' : '') })
      const d = parseDraft(out)
      if ('exists' in d) {
        if (!conceptMdExists(lib, d.exists)) throw new WorkbenchError(502, t(`Claude가 이미 있다고 한 개념노트를 찾지 못했습니다: ${d.exists}`, `Could not find the concept note Claude said already exists: ${d.exists}`))
        const list = setLearnConcept(lib, it.id, d.exists)
        drafting.delete(it.id)
        return { concept: d.exists, existed: true, ...withDrafting(list) }
      }
      const { id } = createConcept(lib, { title: d.title || it.term, subject: idsModel ? undefined : d.subject, body: d.body, fm: { drafted_by: 'claude', drafted: it.at.slice(0, 10) } })
      writeConceptMemo(lib, id, draftMemo(it, d.memo), readConceptMemo(lib, id).hash)
      const list = setLearnConcept(lib, it.id, id)
      drafting.delete(it.id)
      return { concept: id, existed: false, ...withDrafting(list) }
    } finally {
      drafting.delete(it.id)
    }
  })
}
