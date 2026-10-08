import type { FastifyInstance } from 'fastify'
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
  app.get<{ Querystring: { note?: string } }>('/api/subjects', async (req) => {
    const tree = readSubjects(lib())
    if (!tree.enabled) return { ...tree, suggestions: [] }
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
  app.patch<{ Body: Parameters<typeof changeSubject>[1] }>('/api/subjects', async (req) => changeSubject(lib(), req.body ?? {}, false))
  app.post<{ Body: Parameters<typeof changeSubject>[1] }>('/api/subjects', async (req) => changeSubject(lib(), req.body ?? {}, true))
  app.put<{ Params: { id: string }; Body: { subjects?: unknown; baseHash?: unknown } }>('/api/concepts/:id/subjects', async (req) => {
    if (typeof req.body?.baseHash !== 'string') throw new WorkbenchError(400, t('baseHash가 필요합니다', 'baseHash is required'))
    return setConceptSubjects(lib(), req.params.id, req.body.subjects, req.body.baseHash)
  })
  app.get<{ Querystring: { id?: string } }>('/api/figures/subjects', async (req) => {
    const { folder } = figureFile(ctx.registry, req.query.id)
    return { hash: readYamlHash(path.join(folder.dir, 'figures.yaml')) }
  })
  app.put<{ Body: { id?: unknown; subjects?: unknown; baseHash?: unknown } }>('/api/figures/subjects', async (req) => {
    const { folder, file } = figureFile(ctx.registry, req.body?.id)
    return setEntrySubjects(lib(), path.join(folder.dir, 'figures.yaml'), file, req.body?.subjects, req.body?.baseHash)
  })
  const paperFile = (key: string) => {
    if (!lib() || !libraryBibEntries(lib()!).some((e) => e.key === key)) throw new WorkbenchError(404, t('없는 논문입니다', 'No such paper'))
    return path.join(lib()!, 'papers.yaml')
  }
  app.get<{ Params: { key: string } }>('/api/papers/:key/subjects', async (req) => ({ hash: readYamlHash(paperFile(req.params.key)) }))
  app.put<{ Params: { key: string }; Body: { subjects?: unknown; baseHash?: unknown } }>('/api/papers/:key/subjects', async (req) =>
    setEntrySubjects(lib(), paperFile(req.params.key), req.params.key, req.body?.subjects, req.body?.baseHash))
}
