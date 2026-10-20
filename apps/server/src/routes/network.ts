// 네트워킹: 사람 목록과 사람마다 노트 참고 문헌에 있는 그 사람의 논문 (10/4 피드백)
import fs from 'node:fs'
import path from 'node:path'
import { isAuthorOf, orgOf, personId, suggestPeople, type Person } from '@rw/core'
import type { FastifyInstance } from 'fastify'
import * as C from '@rw/core/contract/network'
import { parseBody, replies } from '../contract.js'
import { repeat } from '../scheduler.js'
import { listMaterials, parseBib, type BibEntry } from '../materials.js'
import { listRecords } from '../comments.js'
import { freshCount, markPapers, photoFile, photoStamp, readPeoplePapers, refreshPersonPapers, searchS2Authors } from '../peoplePapers.js'
import { WorkbenchError } from '../workbench.js'
import type { RouteContext } from './context.js'
import { t } from '../i18n.js'

type PersonView = C.PersonView
type PersonPaper = C.PersonPaper
type SuggestionView = C.PersonSuggestion

/**
 * 개념노트 분류 정리(10/4) 전의 분야 이름표를 새 분류 이름으로 읽는다. 다음에 사람 목록을 저장하면 새 이름으로 남는다.
 * 뜻이 분명한 것만 옮기고, 나머지(예: Anyons)는 "목록에 없음"으로 보여 사용자가 고른다.
 */
const TAG_RENAMES: Record<string, string> = {
  'quantum many-body theory': 'Quantum Many-Body',
  'condensed matter theory': 'Quantum Many-Body',
  'condensed matter': 'Quantum Many-Body',
  'quantum information': 'Quantum Information Theory',
  'topological phases': 'Topological Order',
}
export const renameTags = (tags: string[] = []): string[] => {
  const out: string[] = []
  for (const t of tags) { const n = TAG_RENAMES[t.trim().toLowerCase()] ?? t; if (!out.some((x) => x.toLowerCase() === n.toLowerCase())) out.push(n) }
  return out
}

const norm = (s = '') => s.toLowerCase().replace(/[^a-z0-9]+/g, '')

export function registerNetwork(app: FastifyInstance, ctx: RouteContext): void {
  const { registry, opts } = ctx
  const configDir = registry.configDir

  const people = (): PersonView[] => {
    const orgs = (affs: string[]) => [...new Set(affs.map(orgOf).filter(Boolean))]
    const out: PersonView[] = registry.authors.map((a) => ({
      id: personId(a.name), name: a.name, aliases: [], author: true, affiliations: a.affiliations, orgs: orgs(a.affiliations), tags: [],
      ...(a.email && { email: a.email }), emails: a.emails ?? [], added: false, star: false,
    }))
    for (const p of registry.people) {
      const same = out.find((x) => x.id === personId(p.name))
      if (same) {
        same.added = true; same.aliases = p.aliases ?? []; same.tags = renameTags(p.tags); same.star = !!p.star
        if (p.note) same.note = p.note
        if (p.homepage) same.homepage = p.homepage
        if (p.s2) same.s2 = p.s2
        continue
      }
      const affs = p.affiliations ?? []
      out.push({
        id: personId(p.name), name: p.name, aliases: p.aliases ?? [], ...(p.note && { note: p.note }), author: false, affiliations: affs, orgs: orgs(affs),
        tags: renameTags(p.tags), ...(p.email && { email: p.email }), emails: p.emails ?? [], ...(p.homepage && { homepage: p.homepage }), ...(p.s2 && { s2: p.s2 }), added: true, star: !!p.star,
      })
    }
    // 사진 · 보지 않은 새 논문 수 (10/19 사람 페이지)
    const found = readPeoplePapers(configDir)
    for (const p of out) {
      const photo = photoStamp(configDir, p.id)
      if (photo) p.photo = photo
      const n = freshCount(found[p.id])
      if (n) p.newPapers = n
    }
    return out
  }
  const viewOf = (id: string): PersonView => {
    const view = people().find((p) => p.id === id)
    if (!view) throw new WorkbenchError(404, t(`없는 사람: ${id}`, `No such person: ${id}`))
    return view
  }
  const searchOf = (v: PersonView): Person => ({ name: v.name, aliases: v.aliases, ...(v.s2 && { s2: v.s2 }) })

  /** 모든 참고 문헌: 라이브러리 references.bib, 등록한 프로젝트마다의 bib. 같은 논문(DOI·arXiv·제목)은 하나로 */
  const allBib = (): PersonPaper[] => {
    const lists: { entries: BibEntry[]; where: { rid?: string; title: string } }[] = []
    const lib = registry.libraryPath
    const libBib = lib ? path.join(lib, 'references.bib') : ''
    if (libBib && fs.existsSync(libBib)) lists.push({ entries: parseBib(fs.readFileSync(libBib, 'utf8'), 'references.bib'), where: { title: t('공유 라이브러리', 'Shared library') } })
    for (const r of registry.list()) {
      if (!r.available) continue
      try {
        const wb = registry.get(r.id)
        lists.push({ entries: listMaterials(wb.root, wb.readResearch().sources).bib, where: { rid: r.id, title: r.title } })
      } catch { /* 읽지 못한 프로젝트는 건너뛴다 */ }
    }
    const out: PersonPaper[] = []
    for (const { entries, where } of lists) {
      for (const e of entries) {
        const same = out.find((x) => (e.doi && norm(x.doi) === norm(e.doi)) || (e.eprint && norm(x.eprint) === norm(e.eprint)) || (e.title && norm(x.title) === norm(e.title)))
        if (same) { if (!same.where.some((w) => w.rid === where.rid)) same.where.push(where); continue }
        out.push({ key: e.key, title: e.title, author: e.author, year: e.year, journal: e.journal, eprint: e.eprint, doi: e.doi, where: [where] })
      }
    }
    return out
  }

  app.get('/api/network', replies(C.PeopleList), async (): Promise<C.PeopleList> => ({ people: people() }))

  /** 노트 참고 문헌에 자주 나오지만 아직 등록하지 않은 사람 (10/4 16:56 "자주 언급되는 사람은 등록을 추천") */
  app.get('/api/network/suggestions', replies(C.PersonSuggestions), async (): Promise<C.PersonSuggestions> => {
    const known: Person[] = people().map((p) => ({ name: p.name, aliases: p.aliases }))
    const bib = allBib()
    const suggestions: SuggestionView[] = suggestPeople(bib.map((e) => e.author), known).map((s) => {
      const papers = bib.filter((e) => isAuthorOf({ name: s.name, aliases: s.aliases }, e.author)).sort((a, b) => (b.year ?? '').localeCompare(a.year ?? ''))
      const where = [...new Set(papers.flatMap((e) => e.where.map((w) => w.title)))]
      return { ...s, ...(papers[0] && { latest: { title: papers[0].title, year: papers[0].year } }), where }
    })
    return { suggestions }
  })

  /** 네트워킹에서 더한 사람 목록 전체를 바꾼다 (저자와 소속은 그대로) */
  app.put('/api/network/people', replies(C.PeopleList), async (req): Promise<C.PeopleList> => {
    registry.setPeople(parseBody(C.SavePeopleBody, req.body).people)
    return { people: people() }
  })

  app.get<{ Params: { id: string } }>('/api/network/people/:id', replies(C.PersonPage), async (req): Promise<C.PersonPage> => {
    const view = viewOf(req.params.id)
    const person: Person = { name: view.name, aliases: view.aliases }
    const papers = allBib().filter((e) => isAuthorOf(person, e.author))
      .sort((a, b) => (b.year ?? '').localeCompare(a.year ?? '') || (a.title ?? '').localeCompare(b.title ?? ''))
    // 함께 쓴 사람: 네트워킹에 있는 다른 사람 중 이 사람의 논문에 함께 이름이 있는 사람 (많은 순)
    const coauthors = people().filter((p) => p.id !== view.id)
      .map((p) => ({ id: p.id, name: p.name, count: papers.filter((e) => isAuthorOf({ name: p.name, aliases: p.aliases }, e.author)).length }))
      .filter((c) => c.count > 0).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    return { person: view, papers, coauthors, appears: appearsOf(view, papers) }
  })

  /**
   * 이 사람이 나오는 곳 (10/19): 프로젝트마다 그 프로젝트 bib에 있는 이 사람 논문 수, 이름(다른 이름)이 들어간 기록(프로젝트마다 5개까지).
   * 이름이 세 글자보다 짧으면 기록은 찾지 않는다(엉뚱한 낱말이 걸린다)
   */
  const appearsOf = (view: PersonView, papers: PersonPaper[]): C.PersonAppearance[] => {
    const names = [view.name, ...view.aliases].map((n) => n.trim().toLowerCase()).filter((n) => n.length >= 3)
    const out: C.PersonAppearance[] = []
    for (const r of registry.list()) {
      if (!r.available) continue
      const count = papers.filter((e) => e.where.some((w) => w.rid === r.id)).length
      const records: C.PersonAppearance['records'] = []
      try {
        const wb = registry.get(r.id)
        for (const f of listRecords(wb.root, r.title)) {
          for (const c of f.comments) {
            const text = [c.body, ...c.answers.map((a) => a.body)].join('\n')
            if (records.length < 5 && names.some((n) => text.toLowerCase().includes(n))) records.push({ target: f.target, id: c.id, kind: c.kind, text: c.body.replace(/\s+/g, ' ').trim().slice(0, 140), ...(f.source && { source: f.source }) })
          }
        }
      } catch { /* 읽지 못한 프로젝트는 건너뛴다 */ }
      if (count || records.length) out.push({ rid: r.id, title: r.title, papers: count, records })
    }
    return out
  }

  /** 라이브러리나 프로젝트 bib에 이미 있는 논문인가 (arXiv 번호 · DOI · 제목) */
  const inBib = (bib: PersonPaper[]) => (p: { arxiv?: string; doi?: string; title: string }) => bib.some((e) =>
    (p.arxiv && norm(e.eprint) === norm(p.arxiv)) || (p.doi && norm(e.doi) === norm(p.doi)) || (!!e.title && norm(e.title) === norm(p.title)))

  /** 새 논문 (10/19): 하루에 한 번 찾는다. 찾지 않는 모드(개발용 예제 · 테스트)는 저장된 것만 */
  app.get<{ Params: { id: string } }>('/api/network/people/:id/new-papers', replies(C.NewPapers), async (req): Promise<C.NewPapers> => {
    const view = viewOf(req.params.id)
    const live = !!opts.peoplePapersMs
    const e = live ? await refreshPersonPapers(configDir, view.id, searchOf(view)) : readPeoplePapers(configDir)[view.id]
    const has = inBib(allBib())
    return {
      source: e?.source ?? (view.s2 ? 's2' : 'arxiv'), checkedAt: e?.at ?? null, live, hidden: e?.hidden.length ?? 0, ...(e?.error && { error: e.error }),
      papers: (e?.papers ?? []).filter((p) => !e!.hidden.includes(p.id)).map((p) => ({ ...p, fresh: !e!.seen.includes(p.id), inLibrary: has(p) })),
    }
  })
  app.post<{ Params: { id: string } }>('/api/network/people/:id/new-papers/seen', replies(C.PeopleList), async (req): Promise<C.PeopleList> => {
    markPapers(configDir, viewOf(req.params.id).id, { seen: true })
    return { people: people() }
  })
  app.post<{ Params: { id: string } }>('/api/network/people/:id/new-papers/hide', replies(C.PeopleList), async (req): Promise<C.PeopleList> => {
    markPapers(configDir, viewOf(req.params.id).id, { hide: parseBody(C.HidePaperBody, req.body).paper })
    return { people: people() }
  })
  /** Semantic Scholar 저자 찾기 (사람 고치기 창의 "Semantic Scholar 저자") */
  app.get<{ Querystring: { q?: string } }>('/api/network/s2', replies(C.S2Authors), async (req): Promise<C.S2Authors> => {
    const q = (req.query.q ?? '').trim()
    if (!q) return { authors: [] }
    try { return { authors: await searchS2Authors(q) } } catch (e) { throw new WorkbenchError(502, (e as Error).message) }
  })

  /** 사진 (10/19): 화면이 줄여 보낸 JPEG · PNG를 앱 설정 폴더에 둔다 */
  app.put<{ Params: { id: string } }>('/api/network/people/:id/photo', replies(C.PeopleList), async (req): Promise<C.PeopleList> => {
    const view = viewOf(req.params.id)
    const { data } = parseBody(C.PersonPhotoBody, req.body)
    const file = photoFile(configDir, view.id)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, Buffer.from(data.slice(data.indexOf(',') + 1), 'base64'))
    return { people: people() }
  })
  app.delete<{ Params: { id: string } }>('/api/network/people/:id/photo', replies(C.PeopleList), async (req): Promise<C.PeopleList> => {
    fs.rmSync(photoFile(configDir, viewOf(req.params.id).id), { force: true })
    return { people: people() }
  })
  app.get<{ Params: { id: string } }>('/api/network/people/:id/photo', async (req, reply) => {
    const file = photoFile(configDir, req.params.id)
    if (!fs.existsSync(file)) throw new WorkbenchError(404, t('사진이 없습니다', 'No photo'))
    return reply.type(fs.readFileSync(file).subarray(0, 4).toString('hex') === '89504e47' ? 'image/png' : 'image/jpeg').header('cache-control', 'no-cache').send(fs.readFileSync(file))
  })

  // 새 논문을 하루에 한 번: 실사용 앱만 (opts.peoplePapersMs마다 낡은 사람을 차례로, arXiv · Semantic Scholar에 몰아 보내지 않게 4초 간격)
  if (opts.peoplePapersMs) {
    let running = false
    const sweep = async () => {
      if (running) return
      running = true
      try {
        for (const p of people()) {
          const e = readPeoplePapers(configDir)[p.id]
          if (e && Date.now() - e.at < 24 * 60 * 60_000) continue
          await refreshPersonPapers(configDir, p.id, searchOf(p))
          await new Promise((r) => setTimeout(r, 4000))
        }
      } finally { running = false }
    }
    repeat(app, { first: 60_000, every: opts.peoplePapersMs, run: sweep })
  }
}
