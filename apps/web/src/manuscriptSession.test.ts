import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ManuscriptCompileResult, ManuscriptPdfStatus } from './api'
import { researchApi } from './api/research'
import { ConflictError } from './api/http'
import { NOTE_STATE } from './NoteStatus'
import { applyManuscriptPdf, beginManuscriptRefresh, getSession, hasPendingParts, manuscriptPdfLabel, partStateWithoutTab, runManuscriptCompile, setPartSaveState } from './blockSession'

const first = '2026-10-05T01:00:00.001Z'
const second = '2026-10-05T01:00:00.002Z'
const status = (more: Partial<ManuscriptPdfStatus> = {}): ManuscriptPdfStatus => ({ hasPdf: true, pdfState: 'current', lastSuccessAt: first, lastCompile: { at: first, ok: true }, ...more })
const result = (more: Partial<ManuscriptCompileResult> = {}): ManuscriptCompileResult => ({ ...status(), ok: true, durationMs: 1, problems: [], logTail: '', ...more })
let id = 0
const key = () => `manuscript-test/${++id}`
afterEach(() => vi.unstubAllGlobals())

describe('manuscript compile safety', () => {
  it('releases a closed part tab unless an autosave is still running (10/5 review)', () => {
    const k = key()
    for (const state of ['editing', 'conflict', 'error'] as const) {
      setPartSaveState(k, 'closed.md', partStateWithoutTab(state))
      expect(hasPendingParts(k)).toBe(false)
    }
    for (const state of ['dirty', 'saving'] as const) {
      setPartSaveState(k, 'closed.tex', partStateWithoutTab(state))
      expect(hasPendingParts(k)).toBe(true)
      setPartSaveState(k, 'closed.tex', 'saved')
    }
  })

  it.each(['dirty', 'saving', 'editing', 'conflict', 'error'] as const)('blocks %s from another or hidden part before sending a request', async (state) => {
    const k = key()
    setPartSaveState(k, 'hidden-part.md', state)
    const request = vi.fn(async () => result())
    await expect(runManuscriptCompile(k, request)).rejects.toThrow('저장하지 않은 내용')
    expect(request).not.toHaveBeenCalled()
    expect(getSession(k).compiling).toBe(false)
    setPartSaveState(k, 'visible-part.tex', 'saved')
    expect(hasPendingParts(k)).toBe(true)
    setPartSaveState(k, 'hidden-part.md', 'saved')
    await runManuscriptCompile(k, request)
    expect(request).toHaveBeenCalledOnce()
  })

  it('keeps other manuscripts independent and does not clear newer edits on compile completion', async () => {
    const a = key(), b = key()
    setPartSaveState(a, 'a.tex', 'conflict')
    await runManuscriptCompile(b, async () => {
      setPartSaveState(b, 'b.tex', 'dirty')
      return result()
    })
    expect(hasPendingParts(a)).toBe(true)
    expect(hasPendingParts(b)).toBe(true)
    await expect(runManuscriptCompile(b, async () => result())).rejects.toThrow('저장하지 않은 내용')
  })
})

describe('research note toolbar status safety', () => {
  it.each([
    ['in-progress', 'active'], ['blocked', 'paused'], ['stopped', 'stopped'], ['solved', 'done'],
  ] as const)('writes %s as the existing note.yaml state %s', (status, state) => {
    expect(NOTE_STATE[status]).toBe(state)
  })

  it('sends the loaded note.yaml hash with a status change', async () => {
    const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response('{}'))
    vi.stubGlobal('fetch', fetch)
    await researchApi('project').setNoteMeta('notes/main', { state: NOTE_STATE.blocked }, 'loaded-note-yaml-hash')
    const [url, request] = fetch.mock.calls[0]!
    expect(String(url)).toBe('/api/researches/project/notes/meta?ms=notes%2Fmain')
    expect(request?.method).toBe('PATCH')
    expect(JSON.parse(String(request?.body))).toEqual({ state: 'paused', baseHash: 'loaded-note-yaml-hash' })
  })

  it('preserves a stale note.yaml conflict instead of accepting the status change', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ currentHash: 'external-note-yaml-hash' }), { status: 409 })))
    await expect(researchApi('project').setNoteMeta('notes/main', { state: 'done' }, 'loaded-note-yaml-hash'))
      .rejects.toEqual(new ConflictError('external-note-yaml-hash'))
  })
})

describe('manuscript PDF refresh', () => {
  it('rejects older polls and any poll started before a compile, even after it completes', async () => {
    const k = key()
    const old = beginManuscriptRefresh(k)
    const recent = beginManuscriptRefresh(k)
    expect(applyManuscriptPdf(k, status(), old)).toBe(false)
    expect(applyManuscriptPdf(k, status(), recent)).toBe(true)
    await runManuscriptCompile(k, async () => {
      expect(applyManuscriptPdf(k, status({ pdfState: 'stale' }), recent)).toBe(false)
      return result({ lastSuccessAt: second })
    })
    expect(applyManuscriptPdf(k, status({ pdfState: 'stale' }), recent)).toBe(false)
    expect(getSession(k).manuscriptPdf?.lastSuccessAt).toBe(second)
  })

  it('reloads only a new PDF, keeping the old PDF when a failed compile made none', async () => {
    const k = key()
    applyManuscriptPdf(k, status({ pdfAt: first }))
    const initial = getSession(k).pdfVersion
    applyManuscriptPdf(k, status({ pdfAt: first, pdfState: 'stale' }))
    expect(getSession(k).pdfVersion).toBe(initial)
    await runManuscriptCompile(k, async () => result({ ok: false, pdfAt: first, pdfState: 'stale', lastCompile: { at: second, ok: false } }))
    expect(getSession(k).pdfVersion).toBe(initial)
    expect(manuscriptPdfLabel(getSession(k).manuscriptPdf!)).toMatch(/^이번 컴파일은 PDF를 만들지 못했습니다 · 보이는 것은 .+의 결과$/)
    await runManuscriptCompile(k, async () => result({ lastSuccessAt: second, pdfAt: second }))
    expect(getSession(k).pdfVersion).toBeGreaterThan(initial!)
  })

  it('shows a new PDF from a compile with errors and labels it (10/5)', async () => {
    const k = key()
    applyManuscriptPdf(k, status({ pdfAt: first }))
    const initial = getSession(k).pdfVersion
    await runManuscriptCompile(k, async () => result({ ok: false, pdfAt: second, pdfErrors: true, lastCompile: { at: second, ok: false } }))
    expect(getSession(k).pdfVersion).toBeGreaterThan(initial!)
    expect(manuscriptPdfLabel(getSession(k).manuscriptPdf!)).toBe('컴파일 오류가 있는 PDF입니다 · 빠지거나 틀린 부분이 있을 수 있습니다')
    expect(manuscriptPdfLabel(status({ pdfErrors: true, pdfState: 'stale' }))).toMatch(/그 뒤 원고가 바뀌었습니다$/)
    expect(manuscriptPdfLabel(status({ hasPdf: false, pdfState: 'missing', lastCompile: { at: second, ok: false } }))).toBe('컴파일 오류로 PDF를 만들지 못했습니다')
  })

  it('preserves a legacy PDF until a successful compile and clears a missing PDF', () => {
    const k = key()
    applyManuscriptPdf(k, status({ pdfState: 'unknown', lastSuccessAt: undefined, lastCompile: undefined }))
    const initial = getSession(k).pdfVersion
    expect(initial).not.toBeNull()
    applyManuscriptPdf(k, status({ pdfState: 'unknown', lastSuccessAt: undefined, lastCompile: undefined }))
    expect(getSession(k).pdfVersion).toBe(initial)
    expect(manuscriptPdfLabel(getSession(k).manuscriptPdf!)).toBe('PDF 최신 여부를 확인하지 못했습니다')
    applyManuscriptPdf(k, status({ hasPdf: false, pdfState: 'missing' }))
    expect(getSession(k).pdfVersion).toBeNull()
    expect(manuscriptPdfLabel(getSession(k).manuscriptPdf!)).toBe('아직 PDF가 없습니다')
  })

  it('marks transport failure unknown, unlocks compilation, and rejects earlier polls', async () => {
    const k = key()
    applyManuscriptPdf(k, status())
    const request = beginManuscriptRefresh(k)
    await expect(runManuscriptCompile(k, async () => { throw new Error('offline') })).rejects.toThrow('offline')
    expect(getSession(k).compiling).toBe(false)
    expect(getSession(k).manuscriptPdf?.pdfState).toBe('unknown')
    expect(applyManuscriptPdf(k, status(), request)).toBe(false)
  })

  it('uses the agreed stale message', () => {
    expect(manuscriptPdfLabel(status({ pdfState: 'stale' }))).toBe('원고가 바뀌었습니다 · PDF는 이전 결과')
  })

  it('uses identical selected manuscript and template options for refresh and compile', async () => {
    const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify(result())))
    vi.stubGlobal('fetch', fetch)
    const api = researchApi('project')
    const options = { template: 'paper', authors: ['A B', 'C'], date: 'none' }
    await api.manuscript('notes/main', options)
    await api.compileManuscript('notes/main', options)
    const read = new URL(String(fetch.mock.calls[0]![0]), 'http://localhost')
    const compile = new URL(String(fetch.mock.calls[1]![0]), 'http://localhost')
    expect(read.search).toBe(compile.search)
    expect(read.searchParams.get('ms')).toBe('notes/main')
    expect(read.searchParams.getAll('au')).toEqual(['A B', 'C'])
    expect(read.searchParams.get('tpl')).toBe('paper')
    expect(read.searchParams.get('date')).toBe('none')
  })
})
