import { afterEach, describe, expect, it, vi } from 'vitest'
import { blockExportUrl, noteExportUrl, researchApi } from './api'

afterEach(() => vi.unstubAllGlobals())

describe('보조 노트 컴파일·내보내기 선택', () => {
  it('컴파일과 zip이 같은 서식·저자 순서·날짜를 보내고 노트 대상만 구분한다', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true })))
    vi.stubGlobal('fetch', fetch)
    const choice = { template: '서식 & 1', authors: ['나', 'Ada'], date: '2026-10-06' }
    await researchApi('연구 A').compile('aux-note', choice)
    const [compileUrl, init] = fetch.mock.calls[0]!
    const compile = new URL(compileUrl, 'http://localhost')
    const exported = new URL(blockExportUrl('연구 A', 'aux-note', choice), 'http://localhost')
    expect(init.method).toBe('POST')
    expect(decodeURIComponent(compile.pathname)).toBe('/api/researches/연구 A/blocks/aux-note/compile')
    expect(exported.searchParams.get('block')).toBe('aux-note')
    expect(exported.searchParams.has('ms')).toBe(false)
    exported.searchParams.delete('block')
    expect([...exported.searchParams]).toEqual([...compile.searchParams])
    expect(exported.searchParams.getAll('au')).toEqual(choice.authors)
    expect(exported.searchParams.get('date')).toBe(choice.date)
    expect(exported.searchParams.get('tpl')).toBe(choice.template)
  })

  it('저자·날짜 없음과 기존 연구노트 내보내기 주소를 유지한다', () => {
    const choice = { authors: [], date: 'none' }
    const block = new URL(blockExportUrl('r', 'b', choice), 'http://localhost')
    expect(block.searchParams.get('au')).toBe('')
    expect(block.searchParams.get('date')).toBe('none')
    expect(noteExportUrl('r', ['note/a'], choice)).toBe('/api/researches/r/export?ms=note%2Fa&au=&date=none')
  })
})
