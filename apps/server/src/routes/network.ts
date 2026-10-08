// 네트워킹: 사람 목록과 사람마다 노트 참고 문헌에 있는 그 사람의 논문 (10/4 피드백)
import fs from 'node:fs'
import path from 'node:path'
import { isAuthorOf, orgOf, personId, suggestPeople, type Person } from '@rw/core'
import type { FastifyInstance } from 'fastify'
import { listMaterials, parseBib, type BibEntry } from '../materials.js'
import { WorkbenchError } from '../workbench.js'
import type { RouteContext } from './context.js'
import { t } from '../i18n.js'

export interface PersonView {
  id: string
  name: string
  aliases: string[]
  note?: string
  /** 저자와 소속에 있는 사람 (그쪽에서 고친다) */
  author: boolean
  affiliations: string[]
  /** 소속 줄에서 뽑은 기관 이름 (첫 화면에서 기관별로 묶는다) */
  orgs: string[]
  /** 연구 분야 이름표 */
  tags: string[]
  /** 저자와 소속의 이메일 (앱 사용자 본인을 찾을 때 쓴다) */
  email?: string
  /** 그 밖의 이메일 */
  emails: string[]
  /** 네트워킹에서 더한 사람 */
  added: boolean
  /** 즐겨찾기 */
  star: boolean
  /** 홈페이지 (네트워킹에서 적는다) */
  homepage?: string
}

/** 등록 추천 한 사람: 참고 문헌(bib)에서 알 수 있는 것만. bib에는 보통 저자 이름만 있고 소속·이메일은 없다 */
export interface SuggestionView {
  name: string
  count: number
  /** 참고 문헌에 다르게 적힌 이름 */
  aliases?: string[]
  /** 가장 최근 논문 */
  latest?: { title?: string; year?: string }
  /** 그 논문들이 있는 곳 (공유 라이브러리, 프로젝트 이름) */
  where: string[]
}

export interface PersonPaper {
  key: string
  title?: string
  author?: string
  year?: string
  journal?: string
  eprint?: string
  doi?: string
  /** 이 논문이 있는 곳: 공유 라이브러리 references.bib, 프로젝트 bib */
  where: { rid?: string; title: string }[]
}

/**
 * 개념노트 분류 정리(research-library#6, 10/4) 전의 분야 이름표를 새 분류 이름으로 읽는다. 다음에 사람 목록을 저장하면 새 이름으로 남는다.
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
  const { registry } = ctx

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
        continue
      }
      const affs = p.affiliations ?? []
      out.push({
        id: personId(p.name), name: p.name, aliases: p.aliases ?? [], ...(p.note && { note: p.note }), author: false, affiliations: affs, orgs: orgs(affs),
        tags: renameTags(p.tags), ...(p.email && { email: p.email }), emails: p.emails ?? [], ...(p.homepage && { homepage: p.homepage }), added: true, star: !!p.star,
      })
    }
    return out
  }

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

  app.get('/api/network', async () => ({ people: people() }))

  /** 노트 참고 문헌에 자주 나오지만 아직 등록하지 않은 사람 (10/4 16:56 "자주 언급되는 사람은 등록을 추천") */
  app.get('/api/network/suggestions', async () => {
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
  app.put<{ Body: { people?: unknown } }>('/api/network/people', async (req) => {
    registry.setPeople(req.body?.people)
    return { people: people() }
  })

  app.get<{ Params: { id: string } }>('/api/network/people/:id', async (req) => {
    const view = people().find((p) => p.id === req.params.id)
    if (!view) throw new WorkbenchError(404, t(`없는 사람: ${req.params.id}`, `No such person: ${req.params.id}`))
    const person: Person = { name: view.name, aliases: view.aliases }
    const papers = allBib().filter((e) => isAuthorOf(person, e.author))
      .sort((a, b) => (b.year ?? '').localeCompare(a.year ?? '') || (a.title ?? '').localeCompare(b.title ?? ''))
    // 함께 쓴 사람: 네트워킹에 있는 다른 사람 중 이 사람의 논문에 함께 이름이 있는 사람 (많은 순)
    const coauthors = people().filter((p) => p.id !== view.id)
      .map((p) => ({ id: p.id, name: p.name, count: papers.filter((e) => isAuthorOf({ name: p.name, aliases: p.aliases }, e.author)).length }))
      .filter((c) => c.count > 0).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    return { person: view, papers, coauthors }
  })
}
