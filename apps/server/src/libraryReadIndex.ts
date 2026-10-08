import fs from 'node:fs'
import path from 'node:path'
import { type ConceptIndex } from './conceptIndex.js'
import { buildKnowledge } from './knowledge.js'
import { listLibraryNotes } from './libraryNotes.js'
import { listLibraryPreambles } from './library.js'
import { libraryUsage } from './libraryUsage.js'
import { listFigures, figureBrief, type FigureBrief } from './figures.js'
import { listPapers, paperBrief, readPapersYaml, type PaperBrief } from './papers.js'
import { DerivedCache, treeStamp } from './readCache.js'
import { invalidateProjects, registryStamp } from './projectReadCache.js'
import type { Registry } from './registry.js'

/** 서버마다 하나. 원본은 읽기만 하고 목록/첫 화면은 같은 스냅샷을 공유한다. */
export class LibraryReadIndex {
  private libraryCache = new DerivedCache<ReturnType<LibraryReadIndex['buildLibrary']>>()
  private detailSnapshot: Awaited<ReturnType<ConceptIndex['details']>> | undefined
  private detailIndex: ConceptIndex | null = null
  private detailPending: Promise<void> | undefined
  private indexedRevision = ''
  private libraryVersion = 0
  private previousLibrary: ReturnType<LibraryReadIndex['buildLibrary']> | undefined
  private knowledgeCache = new DerivedCache<ReturnType<typeof buildKnowledge>>()
  private figuresCache = new DerivedCache<ReturnType<typeof listFigures>>()
  private papersCache = new DerivedCache<ReturnType<typeof listPapers>>()
  private figureBriefs = new WeakMap<ReturnType<typeof listFigures>, Map<number, FigureBrief>>()
  private paperBriefs = new WeakMap<ReturnType<typeof listPapers>, Map<number, PaperBrief>>()
  constructor(private registry: Registry, private index: () => ConceptIndex | null) {}

  invalidateFigures(): void { this.figuresCache.invalidate() }
  invalidatePapers(): void { this.papersCache.invalidate() }

  invalidate(): void {
    this.libraryCache.invalidate(); this.knowledgeCache.invalidate()
    this.figuresCache.invalidate(); this.papersCache.invalidate()
    invalidateProjects(this.registry)
    this.index()?.invalidate()
  }

  private legacyStamp(): string {
    const lib = this.registry.libraryPath
    if (!lib) return ''
    const files = ['concepts', 'papers'].flatMap((dir) => {
      const abs = path.join(lib, dir)
      return fs.existsSync(abs) ? fs.readdirSync(abs).filter((f) => f.endsWith('.tex')).map((f) => path.join(abs, f)) : []
    })
    return treeStamp([...files, path.join(lib, 'preamble')])
  }

  private buildLibrary() {
    const r = this.registry
    const notes = listLibraryNotes(r.libraryPath, this.detailSnapshot?.notes ?? [])
    return { path: r.libraryPath ?? null, preambles: listLibraryPreambles(r.libraryPath), notes,
      usedBy: libraryUsage(r, notes), study: r.studyPath ?? null }
  }

  async library(): Promise<ReturnType<LibraryReadIndex['buildLibrary']>> {
    const ix = this.index()
    await ix?.ready()
    if (this.index() !== ix) return this.library()
    // 목록과 지도는 같은 세부 메타자료 스냅샷을 공유한다. 동시 요청도 한 번만 읽는다.
    if (this.detailIndex !== ix || this.detailSnapshot?.revision !== ix?.revision) {
      if (!this.detailPending) this.detailPending = (async () => {
        this.detailSnapshot = await ix?.details()
        this.detailIndex = ix
      })().finally(() => { this.detailPending = undefined })
      await this.detailPending
      if (this.index() !== ix || this.detailIndex !== ix || this.detailSnapshot?.revision !== ix?.revision) return this.library()
    }
    const revision = `${ix?.lib}:${ix?.revision}`
    if (this.indexedRevision !== revision) { this.indexedRevision = revision; this.libraryCache.invalidate() }
    return this.libraryCache.get(() => `${ix?.lib}:${ix?.revision}:${this.registry.studyPath}:${this.legacyStamp()}:${registryStamp(this.registry)}`, () => this.buildLibrary())
  }

  async knowledge() {
    const lib = await this.library()
    const r = this.registry
    if (this.previousLibrary !== lib) { this.previousLibrary = lib; this.libraryVersion++; this.knowledgeCache.invalidate() }
    return this.knowledgeCache.get(() => `${this.libraryVersion}:${treeStamp([r.studyPath, r.reviewsPath].filter((s): s is string => !!s))}`,
      () => buildKnowledge({ library: r.libraryPath, study: r.studyPath, reviews: r.reviewsPath, notes: lib.notes, usedBy: lib.usedBy, markdown: this.detailSnapshot?.markdown }))
  }

  figures() {
    const r = this.registry
    return this.figuresCache.get(() => `${r.libraryPath}:${registryStamp(r)}:${treeStamp([
      ...(r.libraryPath ? [path.join(r.libraryPath, 'subjects.yaml'), path.join(r.libraryPath, 'figures'), path.join(r.libraryPath, 'concepts')] : []), path.join(r.configDir, 'figure-cache'),
    ])}`, () => listFigures(r))
  }

  figuresBrief(recent: number) {
    const list = this.figures()
    let briefs = this.figureBriefs.get(list)
    if (!briefs) { briefs = new Map(); this.figureBriefs.set(list, briefs) }
    if (briefs.size >= 32) briefs.clear()
    if (!briefs.has(recent)) briefs.set(recent, figureBrief(list, recent))
    return briefs.get(recent)!
  }

  papers() {
    const r = this.registry
    return this.papersCache.get(() => `${r.libraryPath}:${registryStamp(r)}:${treeStamp([
      ...(r.libraryPath ? ['subjects.yaml', 'references.bib', 'papers.yaml', 'papers', 'comments'].map((f) => path.join(r.libraryPath!, f)) : []),
      ...(r.libraryPath ? Object.values(readPapersYaml(r.libraryPath)).flatMap((m) => m.pdf && path.isAbsolute(m.pdf) ? [m.pdf, path.join(path.dirname(m.pdf), `.${path.basename(m.pdf)}.icloud`)] : []) : []),
      ...r.pdfFolders, path.join(r.configDir, 'papers-opened.json'),
    ])}:${JSON.stringify(r.pdfFolders)}`, () => listPapers(r))
  }

  papersBrief(recent: number) {
    const list = this.papers()
    let briefs = this.paperBriefs.get(list)
    if (!briefs) { briefs = new Map(); this.paperBriefs.set(list, briefs) }
    if (briefs.size >= 32) briefs.clear()
    if (!briefs.has(recent)) briefs.set(recent, paperBrief(list, recent))
    return briefs.get(recent)!
  }
}
