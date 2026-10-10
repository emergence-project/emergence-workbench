import { describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import { AutosaveGroup } from './autosave'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Workspace, closeWorkspaceTab, applyWorkspaceOpenRequest, hasVisibleManuscriptEditor, manuscriptPdfTab, openRoute, pairRoutePdf, restoreLayout, routePdf, showBeside, tabKey, toggleSplit, workspaceVisibility, type Layout, type Tab } from './Workspace'
import type { ManuscriptInfo } from './api'

const layout = (): Layout => ({
  panes: [
    { tabs: [{ k: 'part', file: 'a.tex' }, { k: 'part', file: 'b.tex' }], active: 'part:a.tex' },
    { tabs: [{ k: 'mspdf' }, { k: 'mspdf', ms: 'b' }], active: 'mspdf' },
  ], focus: 0, split: true, ctx: false, frac: 0.5, ctxWidth: 300,
})
const msOfFile = (file: string) => ({ 'a.tex': '', 'b.tex': 'b' })[file]

describe('opening notes from an address, sidebar or topic', () => {
  const cases: [[Tab, Tab], [Tab, Tab], [Tab, Tab]] = [
    [{ k: 'block', bid: 'proof' }, { k: 'pdf', bid: 'proof' }],
    [{ k: 'part', file: 'workbench/notes/x/note.md' }, manuscriptPdfTab('workbench/notes/x/note.md')],
    [{ k: 'part', file: 'a.tex' }, manuscriptPdfTab('')],
  ]
  const key = (t: Tab) => t.k === 'block' ? `block:${t.bid}` : t.k === 'part' ? `part:${t.file}` : ''
  /** 패널 나누기를 켠 빈 화면 (두 칸이 보인다) */
  const empty = (focus: 0 | 1): Layout => ({ ...layout(), panes: [{ tabs: [], active: null }, { tabs: [], active: null }], focus, showBothPanes: true })

  it('does not split a single visible pane to show a PDF (10/10 14:03)', () => {
    for (const [note, pdf] of cases) {
      // split은 켜져 있지만 오른쪽 칸이 비어 한 칸만 보이는 처음 화면: 상단바의 패널 나누기는 꺼짐
      const one: Layout = { ...empty(0), showBothPanes: false }
      expect(workspaceVisibility(one, note.k).shown).toEqual([0])
      const opened = pairRoutePdf(openRoute(one, note), note, pdf)
      expect(opened.panes[1].tabs).toEqual([])
      expect(workspaceVisibility(opened, note.k).shown).toEqual([0])
    }
  })

  it.each([0, 1] as const)('does not add a missing PDF with focus %s', (focus) => {
    for (const [note] of cases) {
      const opened = openRoute({ ...empty(focus), showBothPanes: false }, note)
      expect(opened.focus).toBe(0)
      expect(opened.panes[0]).toEqual({ tabs: [note], active: key(note) })
      expect(opened.panes[1]).toEqual({ tabs: [], active: null })
      expect(workspaceVisibility(opened, note.k).shown).toEqual([0])
      expect(workspaceVisibility(opened, note.k).visibleTabs).toEqual([note])
    }
  })

  it.each([0, 1] as const)('opens the note left and its PDF right whatever the focus (%s)', (focus) => {
    for (const [note, pdf] of cases) {
      const opened = openRoute(empty(focus), note, pdf)
      expect(opened.focus).toBe(0)
      expect(opened.panes[0].active).toBe(key(note))
      expect(opened.panes[1].tabs).toEqual([pdf])
      expect(workspaceVisibility(opened, note.k).visibleTabs).toEqual([note, pdf])
      expect(openRoute(opened, note, pdf)).toEqual(opened)
    }
  })

  it('keeps note left and PDF right after the PDF pane was clicked (10/7 버그)', () => {
    const [a, pdfA] = cases[1]
    const b: Tab = { k: 'part', file: 'workbench/notes/y/note.md' }
    const pdfB = manuscriptPdfTab('workbench/notes/y/note.md')
    const clicked = { ...openRoute(empty(0), a, pdfA), focus: 1 as const }
    const opened = openRoute(clicked, b, pdfB, { newTab: true })
    expect(opened.focus).toBe(0)
    expect(opened.panes[0]).toEqual({ tabs: [a, b], active: 'part:workbench/notes/y/note.md' })
    expect(opened.panes[1]).toEqual({ tabs: [pdfA, pdfB], active: 'mspdf:workbench/notes/y/note.md' })
    // 왼쪽 칸이 PDF를 보고 있었어도 PDF가 왼쪽에 들어가지 않는다
    const pdfLeft: Layout = { ...empty(1), panes: [{ tabs: [pdfA], active: 'mspdf:workbench/notes/x/note.md' }, { tabs: [], active: null }] }
    const fixed = openRoute(pdfLeft, b, pdfB)
    expect(fixed.panes[0]).toEqual({ tabs: [b], active: 'part:workbench/notes/y/note.md' })
    expect(fixed.panes[1]).toEqual({ tabs: [pdfA, pdfB], active: 'mspdf:workbench/notes/y/note.md' })
  })

  it('opens in the current tab instead of adding tabs (10/8 버그 "탭이 자꾸 늘어나")', () => {
    const [a, pdfA] = cases[1]
    const b: Tab = { k: 'part', file: 'workbench/notes/y/note.md' }
    const pdfB = manuscriptPdfTab('workbench/notes/y/note.md')
    const topic: Tab = { k: 'topic', tid: 't' }
    // 주제 → 노트 → 다른 노트: 탭은 하나, 바꿔 낸 노트의 PDF도 닫는다
    const one = openRoute(empty(0), topic)
    const two = pairRoutePdf(openRoute(one, a), a, pdfA)
    expect(two.panes[0]).toEqual({ tabs: [a], active: key(a) })
    expect(two.panes[1].tabs).toEqual([pdfA])
    const three = pairRoutePdf(openRoute(two, b), b, pdfB)
    expect(three.panes[0]).toEqual({ tabs: [b], active: key(b) })
    expect(three.panes[1]).toEqual({ tabs: [pdfB], active: tabKey(pdfB) })
    // 다른 화면도 같은 자리에서 바뀐다
    const back = openRoute(three, topic)
    expect(back.panes[0]).toEqual({ tabs: [topic], active: 'topic:t' })
    // 이미 열린 탭이면 그 탭으로 간다
    const both: Layout = { ...empty(0), panes: [{ tabs: [topic, a], active: key(a) }, { tabs: [], active: null }] }
    expect(openRoute(both, topic).panes[0]).toEqual({ tabs: [topic, a], active: 'topic:t' })
  })

  it('adds a tab only for ⌘/Ctrl+click, unsaved edits, or no current tab', () => {
    const [a] = cases[0]
    const b: Tab = { k: 'block', bid: 'other' }
    const state: Layout = { ...empty(0), panes: [{ tabs: [a], active: key(a) }, { tabs: [], active: null }] }
    expect(openRoute(state, b, null, { newTab: true }).panes[0].tabs).toEqual([a, b])
    expect(openRoute(state, b, null, { keep: (k) => k === key(a) }).panes[0].tabs).toEqual([a, b])
    expect(openRoute(state, b).panes[0].tabs).toEqual([b])
    const none: Layout = { ...state, panes: [{ tabs: [a], active: null }, { tabs: [], active: null }] }
    expect(openRoute(none, b).panes[0].tabs).toEqual([a, b])
    // 논문은 노트를 가리지 않게 옆 칸에 열고, 옆 칸의 PDF 탭은 바꾸지 않는다
    const writing: Layout = { ...state, panes: [{ tabs: [a], active: key(a) }, { tabs: [{ k: 'pdf', bid: 'proof' }], active: 'pdf:proof' }] }
    const paper = openRoute(writing, { k: 'paper', id: 'p' })
    expect(paper.panes[1].tabs).toEqual([{ k: 'pdf', bid: 'proof' }, { k: 'paper', id: 'p' }])
    expect(openRoute(paper, { k: 'paper', id: 'q' }).panes[1].tabs).toEqual([{ k: 'pdf', bid: 'proof' }, { k: 'paper', id: 'q' }])
  })

  it('moves a note tab opened again from the right pane to the left', () => {
    const [note, pdf] = cases[0]
    const state = empty(1)
    state.panes = [{ tabs: [{ k: 'part', file: 'a.tex' }], active: 'part:a.tex' }, { tabs: [note, { k: 'paper', id: 'p' }], active: 'paper:p' }]
    const opened = openRoute(state, note, pdf, { newTab: true })
    expect(opened.panes[0]).toEqual({ tabs: [{ k: 'part', file: 'a.tex' }, note], active: 'block:proof' })
    // 오른쪽 칸의 논문은 가리지 않는다
    expect(opened.panes[1]).toEqual({ tabs: [{ k: 'paper', id: 'p' }], active: 'paper:p' })
  })

  it('leaves a note the user put in the right pane when its tab is clicked there', () => {
    const [note, pdf] = cases[1]
    const swapped: Layout = { ...empty(1), panes: [{ tabs: [pdf], active: tabKey(pdf) }, { tabs: [note], active: key(note) }] }
    expect(openRoute(swapped, note, pdf)).toBe(swapped)
    expect(openRoute({ ...swapped, focus: 0 }, note, pdf).focus).toBe(1)
  })

  it('keeps single-pane mode even when a PDF exists', () => {
    for (const [note, pdf] of cases) {
      const opened = openRoute({ ...empty(0), split: false }, note, pdf)
      expect(opened.split).toBe(false)
      expect(opened.panes[1].tabs).toEqual([])
    }
  })

  it('deselects a previous PDF while existence is unknown or missing, preserving tabs', () => {
    const state = layout()
    const opened = openRoute(state, cases[1][0])
    expect(opened.panes[1]).toEqual({ ...state.panes[1], active: null })
    const paired = pairRoutePdf(opened, ...cases[1])
    expect(paired.panes[1].tabs).toEqual([...state.panes[1].tabs, cases[1][1]])
    expect(workspaceVisibility(paired, 'part').visibleTabs).toContainEqual(cases[1][1])
  })

  it.each([0, 1] as const)('restores tabs but does not display an unrelated saved note with focus %s', (focus) => {
    const state = empty(focus)
    state.panes = [
      { tabs: [{ k: 'part', file: 'old.md' }], active: 'part:old.md' },
      { tabs: [{ k: 'paper', id: 'p' }], active: 'paper:p' },
    ]
    const restored = restoreLayout(state)
    expect(restored.panes.map((p) => p.tabs)).toEqual(state.panes.map((p) => p.tabs))
    const opened = openRoute(restored, cases[1][0])
    expect(opened.focus).toBe(0)
    expect(opened.panes[1].active).toBe('paper:p')
    expect(workspaceVisibility(opened, 'part').visibleTabs).toEqual([cases[1][0], { k: 'paper', id: 'p' }])
  })

  it('corrects a saved flipped layout: notes left, PDFs right (10/7 버그)', () => {
    const [note, pdf] = cases[1]
    const saved: Layout = {
      ...empty(1),
      panes: [{ tabs: [pdf, { k: 'paper', id: 'p' }], active: tabKey(pdf) }, { tabs: [{ k: 'block', bid: 'old' }, note], active: key(note) }],
    }
    const restored = restoreLayout(saved)
    expect(restored.focus).toBe(0)
    expect(restored.panes[0]).toEqual({ tabs: [{ k: 'paper', id: 'p' }, { k: 'block', bid: 'old' }, note], active: null })
    expect(restored.panes[1]).toEqual({ tabs: [pdf], active: null })
    const opened = openRoute(restored, note, pdf)
    expect(opened.panes[0].active).toBe(key(note))
    expect(opened.panes[1].active).toBe(tabKey(pdf))
  })

  it('keeps a comparison note on the right while no PDF exists, and moves it left when the PDF arrives', () => {
    const state = empty(0)
    state.panes[1] = { tabs: [{ k: 'part', file: 'compare.md' }], active: 'part:compare.md' }
    const opened = openRoute(state, cases[1][0])
    expect(opened.panes[1]).toEqual(state.panes[1])
    const paired = pairRoutePdf(opened, ...cases[1])
    expect(paired.panes[0].tabs).toEqual([cases[1][0], { k: 'part', file: 'compare.md' }])
    expect(paired.panes[0].active).toBe(key(cases[1][0]))
    expect(paired.panes[1]).toEqual({ tabs: [cases[1][1]], active: tabKey(cases[1][1]) })
  })

  it('ignores late PDF results after navigating, focusing a PDF or closing split', () => {
    const [note, pdf] = cases[1]
    const opened = openRoute(empty(0), note)
    const navigated = openRoute(opened, cases[0][0])
    expect(pairRoutePdf(navigated, note, pdf)).toBe(navigated)
    const single = toggleSplit({ ...opened, showBothPanes: true }, 'part')
    expect(pairRoutePdf(single, note, pdf)).toBe(single)
    const request = { route: { page: 'part', rid: 'sample', file: 'workbench/notes/x/note.md' } as const, tab: pdf }
    const pdfFocused = applyWorkspaceOpenRequest(opened, request.route, request)
    expect(pairRoutePdf(pdfFocused, note, pdf)).toBe(pdfFocused)
  })
})

describe('route PDF existence', () => {
  it.each([false, true])('uses block PDF state (hasPdf=%s)', async (hasPdf) => {
    const rapi = { pdfState: vi.fn().mockResolvedValue({ hasPdf, stale: false }), manuscripts: vi.fn() }
    expect(await routePdf({ k: 'block', bid: 'proof' }, rapi)).toEqual(hasPdf ? { k: 'pdf', bid: 'proof' } : null)
    expect(rapi.pdfState).toHaveBeenCalledWith('proof')
    expect(rapi.manuscripts).not.toHaveBeenCalled()
  })

  it('waits for manuscript metadata and matches main or part instead of defaulting to the first manuscript', async () => {
    let resolve!: (rows: ManuscriptInfo[]) => void
    const rapi = { pdfState: vi.fn(), manuscripts: vi.fn(() => new Promise<ManuscriptInfo[]>((r) => { resolve = r })) }
    const pending = routePdf({ k: 'part', file: 'note.md' }, rapi)
    const rows: ManuscriptInfo[] = [
      { key: '', main: 'main.tex', name: 'Paper', kind: 'paper', parts: [], hasPdf: true, pdfState: 'current' },
      { key: 'note.md', main: 'note.md', name: 'Note', kind: 'note', parts: [{ file: 'section.tex', id: 'section', title: 'Section', appendix: false }], hasPdf: true, pdfState: 'current' },
    ]
    resolve(rows)
    expect(await pending).toEqual(manuscriptPdfTab('note.md'))
    const loaded = { ...rapi, manuscripts: vi.fn().mockResolvedValue(rows) }
    expect(await routePdf({ k: 'part', file: 'section.tex' }, loaded)).toEqual(manuscriptPdfTab('note.md'))
    expect(await routePdf({ k: 'part', file: 'unknown.md' }, loaded)).toBeNull()
    expect(await routePdf({ k: 'part', file: 'main.tex' }, loaded)).toEqual(manuscriptPdfTab(''))
    rows[1]!.hasPdf = false
    expect(await routePdf({ k: 'part', file: 'note.md' }, loaded)).toBeNull()
  })
})

describe('opening a record at its PDF page', () => {
  it('waits until the section route is left, then focuses the existing result PDF without duplicating tabs', () => {
    const state = layout()
    const route = { page: 'part', rid: 'sample', file: 'b.tex' } as const
    const request = { route, tab: { k: 'mspdf', ms: 'b' } } as const
    expect(applyWorkspaceOpenRequest(state, { page: 'overview', rid: 'sample' }, request)).toBe(state)
    expect(applyWorkspaceOpenRequest(state, { ...route, file: 'a.tex' }, request)).toBe(state)
    const opened = applyWorkspaceOpenRequest(state, route, request)
    expect(opened.focus).toBe(1)
    expect(opened.panes[1].active).toBe('mspdf:b')
    expect(opened.panes[1].tabs).toEqual(state.panes[1].tabs)
    expect(workspaceVisibility(opened, route.page).visibleTabs).toContainEqual(request.tab)
  })

  it('opens a block result PDF in a single pane and keeps the source tab available', () => {
    const state = toggleSplit(layout(), 'part')
    const route = { page: 'block', rid: 'sample', bid: 'proof' } as const
    const request = { route, tab: { k: 'pdf', bid: 'proof' } } as const
    const opened = applyWorkspaceOpenRequest(state, route, request)
    expect(opened.split).toBe(false)
    expect(opened.panes[0].active).toBe('pdf:proof')
    expect(opened.panes[0].tabs).toEqual([...state.panes[0].tabs, request.tab])
    expect(workspaceVisibility(opened, route.page).visibleTabs).toEqual([request.tab])
    expect(applyWorkspaceOpenRequest(opened, route, request).panes[0].tabs).toEqual(opened.panes[0].tabs)
  })
})

describe('visible manuscript compile action', () => {
  it('pairs only the active editor of the same manuscript, ignoring hidden editors', () => {
    const { visibleTabs } = workspaceVisibility(layout(), 'part')
    expect(hasVisibleManuscriptEditor(visibleTabs, '', msOfFile)).toBe(true)
    expect(hasVisibleManuscriptEditor(visibleTabs, 'b', msOfFile)).toBe(false)
    expect(hasVisibleManuscriptEditor(visibleTabs, '', () => undefined)).toBe(false)
  })

  it('keeps a standalone PDF action when its editor is hidden in the merged pane', () => {
    const state = layout()
    state.focus = 1
    const { shown, visibleTabs } = workspaceVisibility(toggleSplit(state, 'part'), 'part')
    expect(shown).toEqual([0])
    expect(visibleTabs).toEqual([{ k: 'mspdf' }])
    expect(hasVisibleManuscriptEditor(visibleTabs, '', msOfFile)).toBe(false)
  })

  it('does not poll or pair tabs obscured by a section screen, including during drag', () => {
    const state = layout()
    expect(workspaceVisibility(state, 'overview').visibleTabs).toEqual([])
    expect(workspaceVisibility(state, 'overview', true).visibleTabs).toEqual([{ k: 'mspdf' }])
    state.focus = 1
    expect(workspaceVisibility(state, 'overview', true).visibleTabs).toEqual([{ k: 'part', file: 'a.tex' }])
  })
})

describe('split button follows rendered panes', () => {
  it.each([true, false])('opens an empty right pane in one click when split is %s', (split) => {
    const state = layout()
    state.split = split
    state.panes[1] = { tabs: [], active: null }
    expect(workspaceVisibility(state, 'part').shown).toEqual([0])

    const opened = toggleSplit(state, 'part')
    expect(workspaceVisibility(opened, 'part').shown).toEqual([0, 1])
    expect(opened.panes).toEqual(state.panes)
    const closed = toggleSplit(opened, 'part')
    expect(workspaceVisibility(closed, 'part').shown).toEqual([0])
    expect(closed.split).toBe(false)
    expect(closed.showBothPanes).toBe(false)
    expect(closed.panes[0]).toEqual(state.panes[0])
  })

  it('opens and closes two empty panes', () => {
    const state = layout()
    state.panes = [{ tabs: [], active: null }, { tabs: [], active: null }]
    expect(workspaceVisibility(state, 'overview').shown).toEqual([0])
    const opened = toggleSplit(state, 'overview')
    expect(workspaceVisibility(opened, 'overview').shown).toEqual([0, 1])
    expect(workspaceVisibility(toggleSplit(opened, 'overview'), 'overview').shown).toEqual([0])
  })

  it('keeps the active right tab when opening and then merging a right-only layout', () => {
    const state = layout()
    state.panes[0] = { tabs: [], active: null }
    state.focus = 1
    expect(workspaceVisibility(state, 'part').shown).toEqual([1])
    const opened = toggleSplit(state, 'part')
    expect(workspaceVisibility(opened, 'part').shown).toEqual([0, 1])
    expect(opened.focus).toBe(1)
    expect(opened.panes).toEqual(state.panes)
    const closed = toggleSplit(opened, 'part')
    expect(workspaceVisibility(closed, 'part').shown).toEqual([0])
    expect(closed.focus).toBe(0)
    expect(closed.panes[0]).toEqual(state.panes[1])
  })

  it.each([0, 1] as const)('opens the hidden pane on a section page with focus %s', (focus) => {
    const state = layout()
    state.focus = focus
    state.panes[focus].active = null
    expect(workspaceVisibility(state, 'notes').shown).toEqual([focus])
    const opened = toggleSplit(state, 'notes')
    expect(workspaceVisibility(opened, 'notes').shown).toEqual([0, 1])
    expect(opened.panes).toEqual(state.panes)
    expect(opened.focus).toBe(focus)
    expect(workspaceVisibility(opened, 'notes').visibleTabs).toEqual(workspaceVisibility(state, 'notes', true).visibleTabs)
    expect(workspaceVisibility(toggleSplit(opened, 'notes'), 'notes').shown).toEqual([0])
  })

  it('merges an existing split without duplicate tabs and preserves the focused selection', () => {
    const state = layout()
    state.focus = 1
    state.panes[1].tabs.push({ k: 'part', file: 'a.tex' })
    const closed = toggleSplit(state, 'part')
    expect(workspaceVisibility(state, 'part').shown).toEqual([0, 1])
    expect(workspaceVisibility(closed, 'part').shown).toEqual([0])
    expect(closed.panes[0].tabs).toEqual([...state.panes[0].tabs, { k: 'mspdf' }, { k: 'mspdf', ms: 'b' }])
    expect(closed.panes[0].active).toBe('mspdf')
    expect(closed.panes[1]).toEqual({ tabs: [], active: null })
    expect(closed.showBothPanes).toBe(false)
  })

  it('keeps automatic hiding unless two panes were explicitly opened', () => {
    const state = layout()
    expect(workspaceVisibility(state, 'overview').shown).toEqual([0])
    expect(workspaceVisibility(state, 'overview', true).shown).toEqual([0, 1])
    expect(workspaceVisibility({ ...state, split: false }, 'part', true).shown).toEqual([0])
    const opened = toggleSplit(state, 'overview')
    expect(workspaceVisibility(opened, 'notes').shown).toEqual([0, 1])
    expect(workspaceVisibility(toggleSplit(opened, 'notes'), 'part', true).shown).toEqual([0])
  })
})

describe('PDF beside a compiled note (10/5 피드백)', () => {
  const note = 'part:workbench/notes/x/note.md'
  const pdf = manuscriptPdfTab('workbench/notes/x/note.md')

  it('puts a note compiled in the right pane on the left and its PDF on the right', () => {
    const l: Layout = {
      panes: [
        { tabs: [{ k: 'part', file: 'a.tex' }], active: 'part:a.tex' },
        { tabs: [{ k: 'part', file: 'workbench/notes/x/note.md' }], active: note },
      ], focus: 1, split: true, ctx: false, frac: 0.5, ctxWidth: 300,
    }
    const next = showBeside(l, pdf, note)
    expect(next.panes[0]).toEqual({ tabs: [{ k: 'part', file: 'a.tex' }, { k: 'part', file: 'workbench/notes/x/note.md' }], active: note })
    expect(next.panes[1]).toEqual({ tabs: [pdf], active: 'mspdf:workbench/notes/x/note.md' })
    expect(next.focus).toBe(0)
    // 다시 컴파일해도 그대로
    expect(showBeside(next, pdf, note)).toBe(next)
  })

  it('turns two panes on and moves the PDF tab out of the note pane', () => {
    const l: Layout = {
      panes: [{ tabs: [{ k: 'part', file: 'workbench/notes/x/note.md' }, pdf], active: note }, { tabs: [], active: null }],
      focus: 0, split: false, ctx: false, frac: 0.5, ctxWidth: 300,
    }
    const next = showBeside(l, pdf, note)
    expect(next.split).toBe(true)
    expect(next.panes[0]).toEqual({ tabs: [{ k: 'part', file: 'workbench/notes/x/note.md' }], active: note })
    expect(next.panes[1]).toEqual({ tabs: [pdf], active: 'mspdf:workbench/notes/x/note.md' })
  })

  it('names the first main note PDF without a key', () => {
    expect(manuscriptPdfTab('')).toEqual({ k: 'mspdf' })
  })
})


describe('closing after the save completes', () => {
  it('removes only the closed tab autosave group after a successful close', () => {
    const a = new AutosaveGroup()
    const b = new AutosaveGroup()
    const groups = new Map([['part:a.tex', a], ['part:b.tex', b]])
    closeWorkspaceTab(layout(), 'part:a.tex', 'research', groups)
    expect([...groups]).toEqual([['part:b.tex', b]])
  })

  it('keeps a failed close group and releases it only after saving succeeds', async () => {
    let saved = false
    const group = new AutosaveGroup()
    group.register({ get pending() { return !saved }, async flush() { return saved } })
    const groups = new Map([['part:a.tex', group]])
    const current = layout()
    if (await group.prepareClose()) closeWorkspaceTab(current, 'part:a.tex', 'research', groups)
    expect(groups.get('part:a.tex')).toBe(group)
    saved = true
    if (await group.prepareClose()) closeWorkspaceTab(current, 'part:a.tex', 'research', groups)
    expect(groups.has('part:a.tex')).toBe(false)
  })

  it('registers the sandbox autosave-close regression command', () => {
    const pkg = JSON.parse(fs.readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'))
    expect(pkg.scripts['test:autosave-close']).toBe('node scripts/shots/autosave-close.mjs')
  })

  it('does not change selection when another tab was selected while saving', () => {
    const current = layout()
    current.panes[0].active = 'part:b.tex'
    const result = closeWorkspaceTab(current, 'part:a.tex', 'research')
    expect(result.layout.panes[0]).toEqual({ tabs: [{ k: 'part', file: 'b.tex' }], active: 'part:b.tex' })
    expect(result.route).toBeNull()
  })

  it('finds a tab moved to the other pane while saving without stealing focus', () => {
    const current = layout()
    current.panes[0].tabs = [{ k: 'part', file: 'b.tex' }]
    current.panes[0].active = 'part:b.tex'
    current.panes[1].tabs.push({ k: 'part', file: 'a.tex' })
    current.panes[1].active = 'part:a.tex'
    const result = closeWorkspaceTab(current, 'part:a.tex', 'research')
    expect(result.layout.panes[0]).toEqual(current.panes[0])
    expect(result.layout.panes[1].tabs).not.toContainEqual({ k: 'part', file: 'a.tex' })
    expect(result.layout.focus).toBe(0)
    expect(result.route).toBeNull()
  })

  it('selects the next tab only when closing the focused active tab', () => {
    const result = closeWorkspaceTab(layout(), 'part:a.tex', 'research')
    expect(result.layout.panes[0].active).toBe('part:b.tex')
    expect(result.route).toEqual({ page: 'part', rid: 'research', file: 'b.tex' })
  })

  it('leaves a newer layout untouched if the tab is already gone', () => {
    const current = layout()
    const result = closeWorkspaceTab(current, 'part:gone.tex', 'research')
    expect(result.layout).toBe(current)
    expect(result.route).toBeNull()
  })
})


describe('editor lifetime while closing', () => {
  it('does not merge panes while a tab save is still running', async () => {
    let pending = true
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const group = new AutosaveGroup()
    group.register({ get pending() { return pending }, async flush() { await gate; pending = false; return true } })
    const saving = group.prepareClose()
    const current = layout()
    try {
      expect(toggleSplit(current, 'part')).toBe(current)
      expect(openRoute(current, { k: 'part', file: 'b.tex' })).toBe(current)
      expect(applyWorkspaceOpenRequest(current, { page: 'part', rid: 'r', file: 'a.tex' }, { route: { page: 'part', rid: 'r', file: 'a.tex' }, tab: { k: 'mspdf' } })).toBe(current)
      expect(showBeside(current, { k: 'mspdf' }, 'part:b.tex')).toBe(current)
      expect(pairRoutePdf(current, { k: 'part', file: 'a.tex' }, { k: 'mspdf' })).toBe(current)
    }
    finally { release(); await saving }
    expect(toggleSplit(current, 'part')).not.toBe(current)
  })

  it('keeps editors mounted when their pane is hidden by a section page', () => {
    const current = layout()
    const rendered: string[] = []
    const html = renderToStaticMarkup(createElement(Workspace, {
      rid: 'research', route: { page: 'overview', rid: 'research' }, layout: current,
      setLayout: () => {}, dragging: false, titleOf: tabKey, kindOf: () => null,
      renderTab: (t) => { rendered.push(tabKey(t)); return tabKey(t) },
      home: 'home', context: null, onCloseFailed: () => {},
    }))
    expect(rendered).toContain('mspdf:b')
    expect(html).toContain('display:none')
  })
})
