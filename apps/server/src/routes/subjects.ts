import type { FastifyInstance } from 'fastify'
import * as C from '@rw/core/contract/subjects'
import * as CC from '@rw/core/contract/concepts'
import { parseBody, replies } from '../contract.js'
import path from 'node:path'
import { acceptedSubjects, changeSubject, matchesSubject, readSubjects, readYamlHash, setEntrySubjects } from '../subjects.js'
import { setConceptSubjects } from '../conceptNotes.js'
import { figureFile } from '../figures.js'
import { libraryBibEntries } from '../papers.js'
import { WorkbenchError } from '../workbench.js'
import type { RouteContext } from './context.js'
import { t } from '../i18n.js'

export function registerSubjects(app: FastifyInstance, ctx: RouteContext): void {
  const lib = () => ctx.registry.libraryPath
  app.get<{ Querystring: { note?: string } }>('/api/subjects', replies(C.SubjectTree), async (req): Promise<C.SubjectTree> => {
    const tree = readSubjects(lib())
    if (!tree.enabled) return { ...tree, items: [], suggestions: [] }
    const ix = ctx.conceptIndex()
    await ix?.ready()
    const counts = ix?.subjects({ showEmpty: true }) ?? []
    const figures = ctx.libraryReads.figures().figures
    const papers = ctx.libraryReads.papers().papers
    const items = tree.items.map((s) => ({ ...s, notes: counts.find((c) => c.subject === s.id)?.count ?? 0,
      figures: figures.filter((f) => matchesSubject(f.subjects, s.id)).length,
      papers: papers.filter((p) => matchesSubject(p.subjects, s.id)).length }))
    const linked = req.query.note && ix ? ix.links(req.query.note) : null
    const neighbors = new Map([...(linked?.out ?? []), ...(linked?.back ?? [])].map((n) => [n.id, n]))
    const frequencies = new Map<string, number>()
    for (const n of neighbors.values()) for (const id of acceptedSubjects(tree, n.subjects)) frequencies.set(id, (frequencies.get(id) ?? 0) + 1)
    const frequent = ix?.subjectFrequencies() ?? new Map<string, number>()
    const suggestions = frequencies.size ? [...frequencies].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 6).map(([id, count]) => ({ id, reason: t(`연결된 노트 ${count}개`, (count === 1 ? `${count} linked note` : `${count} linked notes`)) }))
      : [...items].sort((a, b) => (frequent.get(b.id) ?? 0) - (frequent.get(a.id) ?? 0) || a.id.localeCompare(b.id)).slice(0, 6).map((s) => ({ id: s.id, reason: frequent.get(s.id) ? t(`노트 ${frequent.get(s.id)}개에서 고름`, `Chosen in ${frequent.get(s.id)} note${frequent.get(s.id) === 1 ? '' : 's'}`) : '' }))
    return { ...tree, items, suggestions, unclassified: { notes: counts.find((s) => s.subject === '')?.count ?? 0, figures: figures.filter((f) => !f.subjects?.length).length, papers: papers.filter((p) => !p.subjects?.length).length } }
  })
  app.patch('/api/subjects', replies(C.SubjectTreeSaved), async (req): Promise<C.SubjectTreeSaved> => changeSubject(lib(), parseBody(C.RenameSubjectBody, req.body), false))
  app.post('/api/subjects', replies(C.SubjectTreeSaved), async (req): Promise<C.SubjectTreeSaved> => changeSubject(lib(), parseBody(C.AddSubjectBody, req.body), true))
  app.put<{ Params: { id: string } }>('/api/concepts/:id/subjects', replies(CC.ConceptMd), async (req): Promise<CC.ConceptMd> => {
    const { subjects, baseHash } = parseBody(C.SetSubjectsBody, req.body)
    return setConceptSubjects(lib(), req.params.id, subjects, baseHash)
  })
  app.get<{ Querystring: { id?: string } }>('/api/figures/subjects', replies(C.SubjectFileHash), async (req): Promise<C.SubjectFileHash> => {
    const { folder } = figureFile(ctx.registry, req.query.id)
    return { hash: readYamlHash(path.join(folder.dir, 'figures.yaml')) }
  })
  app.put('/api/figures/subjects', replies(C.EntrySubjects), async (req): Promise<C.EntrySubjects> => {
    const body = parseBody(C.SetFigureSubjectsBody, req.body)
    const { folder, file } = figureFile(ctx.registry, body.id)
    return setEntrySubjects(lib(), path.join(folder.dir, 'figures.yaml'), file, body.subjects, body.baseHash)
  })
  const paperFile = (key: string) => {
    if (!lib() || !libraryBibEntries(lib()!).some((e) => e.key === key)) throw new WorkbenchError(404, t('없는 논문입니다', 'No such paper'))
    return path.join(lib()!, 'papers.yaml')
  }
  app.get<{ Params: { key: string } }>('/api/papers/:key/subjects', replies(C.SubjectFileHash), async (req): Promise<C.SubjectFileHash> => ({ hash: readYamlHash(paperFile(req.params.key)) }))
  app.put<{ Params: { key: string } }>('/api/papers/:key/subjects', replies(C.EntrySubjects), async (req): Promise<C.EntrySubjects> => {
    const { subjects, baseHash } = parseBody(C.SetSubjectsBody, req.body)
    return setEntrySubjects(lib(), paperFile(req.params.key), req.params.key, subjects, baseHash)
  })
}
