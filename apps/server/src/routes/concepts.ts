// Markdown 개념노트 (research-library/concepts/*.md, 2026-10-04 개념노트 재설계)
import { conceptRules } from '../agentRules.js'
import type { FastifyInstance } from 'fastify'
import fs from 'node:fs'
import path from 'node:path'
import { ISSUE_SQL, type ConceptFilter, type ListQuery } from '../conceptIndex.js'
import { conceptBrief, conceptChecks, directConceptProjects } from '../conceptBrief.js'
import { conceptSources } from '../conceptSources.js'
import { conceptUsage } from '../conceptUsage.js'
import { conceptAsset, inlineCites, writeConceptBody, readConceptMd, readConceptMemo, readMacros, setConceptChecked, setConceptLocked, setConceptReview, writeConceptMemo } from '../conceptNotes.js'
import { contentTypeOf } from '../materials.js'
import { libraryBibEntries } from '../papers.js'
import { WorkbenchError } from '../workbench.js'
import type { RouteContext } from './context.js'
import { t } from '../i18n.js'

export function registerConcepts(app: FastifyInstance, ctx: RouteContext): void {
  const { registry } = ctx
  /** 색인 (노트가 수만 개여도 목록·찾기·링크를 바로): 설정 폴더 안 SQLite, 원본은 .md 그대로 */
  const index = () => {
    const ix = ctx.conceptIndex()
    if (!ix) throw new WorkbenchError(404, t('공유 라이브러리가 설정되지 않았음', 'No shared library is set'))
    return ix
  }
  type ListQs = { subjectPrefix?: string; issue?: string; check?: string; ids?: string; sort?: string; dir?: string; q?: string; subject?: string; filter?: string; showEmpty?: string; offset?: string; limit?: string }
  const listQuery = (qs: ListQs): ListQuery => ({
    subjectPrefix: qs.subjectPrefix,
    issue: Object.hasOwn(ISSUE_SQL, qs.issue ?? '') ? qs.issue as ListQuery['issue'] : undefined,
    check: ['unchecked', 'changedAfterCheck', 'draftsToReview'].includes(qs.check ?? '') ? qs.check as ListQuery['check'] : undefined,
    ids: qs.ids === undefined ? undefined : qs.ids.split(',').filter(Boolean),
    sort: ['title', 'subject', 'sources', 'links', 'issues', 'mtime', 'projects', 'aliases', 'checked'].includes(qs.sort ?? '') ? qs.sort as ListQuery['sort'] : undefined,
    dir: qs.dir === 'desc' ? 'desc' : 'asc',
    q: qs.q, subject: qs.subject,
    filter: (['all', 'unfinished', 'checked'].includes(qs.filter ?? '') ? qs.filter : 'all') as ConceptFilter,
    showEmpty: qs.showEmpty === '1', offset: Number(qs.offset) || 0, limit: Number(qs.limit) || 50,
  })
  /** 목록 한 쪽 (찾기·분류·거르기, offset부터 limit개). 화면은 전체 목록을 받지 않는다 */
  app.get<{ Querystring: ListQs }>('/api/concepts/list', async (req) => {
    const ix = index()
    const query = listQuery(req.query)
    query.projects = directConceptProjects(registry, ix)
    if (query.check) {
      const checks = conceptChecks(registry, ix, registry.libraryPath!, query.projects)
      const ids = query.check === 'draftsToReview' ? checks.draftsToReview.concepts : checks[query.check].ids
      query.ids = query.ids === undefined ? ids : ids.filter((id) => query.ids!.includes(id))
    }
    return ix.list(query)
  })
  /** 분류마다 노트 수 (분류 나무를 접어 둔 채) */
  app.get<{ Querystring: ListQs }>('/api/concepts/subjects', async (req) => ({ subjects: index().subjects(listQuery(req.query)) }))
  /** [[이름]]이 가리키는 노트 (없으면 null) */
  app.get<{ Querystring: { name?: string } }>('/api/concepts/resolve', async (req) => ({ note: index().resolve(String(req.query.name ?? '')) }))
  /** 개념노트 규칙: research-library README의 개념노트 절 (MCP rules 도구가 모아 준다). 라이브러리가 없으면 null */
  app.get('/api/concepts/rules', async () => ({ rules: conceptRules(registry.libraryPath) }))
  /** 본문 찾기 (에이전트 입구 search_library): 모든 낱말이 든 노트와, 낱말이 있는 줄·그 줄의 절 제목 */
  app.get<{ Querystring: { q?: string; limit?: string } }>('/api/concepts/search', async (req) => ({ items: index().searchBody(String(req.query.q ?? ''), { limit: Number(req.query.limit) || 20 }) }))
  /** id 몇 개의 목록 줄 (최근 연 노트) */
  app.get<{ Querystring: { ids?: string } }>('/api/concepts/rows', async (req) => ({ items: index().rows(String(req.query.ids ?? '').split(',').filter(Boolean).slice(0, 100)) }))
  /** 지식 첫 화면: 최근 고친 노트 · 점검(연구가 쓰는 노트 중 확인 전 · 확인 뒤 바뀜, 초안 검토) · 통계(이상 종류마다 수와 id). 색인 위에서 */
  app.get<{ Querystring: { recent?: string } }>('/api/concepts/brief', async (req) => conceptBrief(registry, index(), registry.libraryPath!, Number(req.query.recent) || 8))
  /** 기호 모음: concepts/macros.tex의 \newcommand들을 KaTeX macros로 */
  app.get('/api/concepts/macros', async () => readMacros(registry.libraryPath))
  /** 편집기의 [@ 찾기: references.bib에서 키·제목·저자·연도로. 띄어 쓴 낱말은 모두 들어 있어야 하고(순서 무관), 키가 그 말로 시작하는 것이 앞 (많아도 20개까지) */
  app.get<{ Querystring: { q?: string } }>('/api/concepts/bib', async (req) => {
    const words = String(req.query.q ?? '').toLowerCase().split(/\s+/).filter(Boolean)
    const text = (e: { key: string; title?: string; author?: string; year?: string }) => [e.key, e.title, e.author, e.year].join(' ').toLowerCase().replace(/[{}]/g, '')
    // 글자를 칠 때마다 불리므로, 파일이 그대로면 파싱한 것을 다시 쓴다
    const all = libraryBibEntries(registry.libraryPath).filter((e) => { const t = text(e); return words.every((w) => t.includes(w)) })
    const first = words[0]
    const ranked = first ? [...all.filter((e) => e.key.toLowerCase().startsWith(first)), ...all.filter((e) => !e.key.toLowerCase().startsWith(first))] : all
    const items = ranked.slice(0, 20).map(({ key, title, author, year }) => ({ key, title, author, year }))
    return { items }
  })
  /** 개념노트 그림 (concepts/attachments/) */
  app.get<{ Querystring: { name: string } }>('/api/concepts/asset', async (req, reply) => {
    const file = conceptAsset(registry.libraryPath, String(req.query.name ?? ''))
    if (!file) return reply.status(404).send({ error: t('그림을 찾지 못함', 'Figure not found') })
    return reply.type(contentTypeOf(file)).header('cache-control', 'max-age=600').send(fs.createReadStream(file))
  })
  app.get<{ Params: { id: string } }>('/api/concepts/:id', async (req) => readConceptMd(registry.libraryPath, req.params.id))
  /** 본문 고치기 (머리말은 그대로, 잠긴 노트는 423) */
  app.put<{ Params: { id: string }; Body: { body?: unknown; baseHash?: unknown } }>('/api/concepts/:id', async (req) => {
    const { body, baseHash } = req.body ?? {}
    if (typeof body !== 'string' || typeof baseHash !== 'string') throw new WorkbenchError(400, t('body와 baseHash가 필요함', 'body and baseHash are required'))
    return writeConceptBody(registry.libraryPath, req.params.id, body, baseHash)
  })
  /** 나가는 링크·들어오는 링크(이 개념을 쓰는 개념)·노트가 없는 링크 이름: 색인에서 바로 */
  app.get<{ Params: { id: string } }>('/api/concepts/:id/links', async (req) => index().links(req.params.id))
  /** 출처: 머리말 sources와 본문 [@키]를 references.bib에서 찾아서 (본문에 글로 적지 않는다) */
  const sourcesOf = (id: string) => {
    const lib = registry.libraryPath
    const n = readConceptMd(lib, id)
    const bibFile = lib ? path.join(lib, 'references.bib') : ''
    const bib = bibFile && fs.existsSync(bibFile) ? fs.readFileSync(bibFile, 'utf8') : null
    const cited = inlineCites(n.body)
    return { sources: conceptSources([...cited, ...n.meta.sources], bib), cited, unsorted: n.meta.sourcesUnsorted }
  }
  app.get<{ Params: { id: string } }>('/api/concepts/:id/sources', async (req) => sourcesOf(req.params.id))
  /** 쓰는 곳과 인용: 이 개념을 쓰는 프로젝트마다, 개념노트의 출처를 그 프로젝트 bib도 갖고 있는지 */
  app.get<{ Params: { id: string } }>('/api/concepts/:id/usage', async (req) => ({ uses: conceptUsage(registry, req.params.id, sourcesOf(req.params.id).sources) }))
  /** "확인함" 켜기·끄기, 고치기 잠금 켜기·끄기. 머리말만 고치고 본문은 그대로 */
  const flag = (set: typeof setConceptChecked) => async (req: { params: { id: string }; body?: { on?: unknown; baseHash?: unknown } }) => {
    const { on, baseHash } = req.body ?? {}
    if (typeof on !== 'boolean' || typeof baseHash !== 'string') throw new WorkbenchError(400, t('on과 baseHash가 필요함', 'on and baseHash are required'))
    return set(registry.libraryPath, req.params.id, on, baseHash)
  }
  app.post<{ Params: { id: string }; Body: { on?: unknown; baseHash?: unknown } }>('/api/concepts/:id/checked', flag(setConceptChecked))
  app.post<{ Params: { id: string }; Body: { on?: unknown; baseHash?: unknown } }>('/api/concepts/:id/locked', flag(setConceptLocked))
  /** 사용자 확인 고르기: 표시 없음 · 검토 예정 · 확인함 */
  app.post<{ Params: { id: string }; Body: { choice?: unknown; baseHash?: unknown } }>('/api/concepts/:id/review', async (req) => {
    const { choice, baseHash } = req.body ?? {}
    if ((choice !== 'none' && choice !== 'todo' && choice !== 'ok') || typeof baseHash !== 'string') throw new WorkbenchError(400, t('choice(none·todo·ok)와 baseHash가 필요함', 'choice (none·todo·ok) and baseHash are required'))
    return setConceptReview(registry.libraryPath, req.params.id, choice, baseHash)
  })
  /** 메모: 본문 밖의 할 일·코멘트·작업 지침 (concepts/<id>.memo.md). 노트가 잠겨도 고칠 수 있다 */
  app.get<{ Params: { id: string } }>('/api/concepts/:id/memo', async (req) => readConceptMemo(registry.libraryPath, req.params.id))
  app.put<{ Params: { id: string }; Body: { text?: unknown; baseHash?: unknown } }>('/api/concepts/:id/memo', async (req) => {
    const { text, baseHash } = req.body ?? {}
    if (typeof text !== 'string' || typeof baseHash !== 'string') throw new WorkbenchError(400, t('text와 baseHash가 필요함', 'text and baseHash are required'))
    return writeConceptMemo(registry.libraryPath, req.params.id, text, baseHash)
  })
}
