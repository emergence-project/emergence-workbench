import { CompletionContext } from '@codemirror/autocomplete'
import { EditorState } from '@codemirror/state'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { conceptsApi } from './api'
import { citeKeys } from './citeKeys'
import { citeSource } from './conceptCommands'

afterEach(() => vi.restoreAllMocks())

describe('citeKeys', () => {
  it('LaTeX \\cite와 Markdown [@키]를 나온 순서대로', () => {
    expect(citeKeys('a \\cite{x,y} b [@ex2022; @lee] [see @x, p. 3] [link](u) \\citep[p.~2]{z}')).toEqual(['x', 'y', 'ex2022', 'lee', 'z'])
  })
})

describe('인용 찾기 안내', () => {
  const entry = { key: 'reference-key', author: 'Sample, Bea and Example, Ada', title: 'Kempe chains revisited', year: '2020' }
  const complete = (doc: string, pos = doc.length) => citeSource(new CompletionContext(EditorState.create({ doc }), pos, false))

  it('[@ 목록 머리에 키·저자·제목·연도로 찾을 수 있다고 알린다', async () => {
    vi.spyOn(conceptsApi, 'bib').mockResolvedValue([entry])
    const result = await complete('See [@')
    expect(conceptsApi.bib).toHaveBeenCalledWith('')
    expect(result?.options).toEqual([expect.objectContaining({
      section: '키·저자·제목·연도 낱말로 찾기', label: entry.key, apply: `${entry.key}]`,
      detail: 'Sample, Bea, 2020 · Kempe chains revisited',
    })])
  })

  it.each(['2020', 'sample kempe 2020', '2020 kempe sample'])('낱말 질의 %s를 그대로 보내고 고른 키만 넣는다', async (query) => {
    vi.spyOn(conceptsApi, 'bib').mockResolvedValue([entry])
    const doc = `See [@${query}`
    const result = await complete(doc)
    expect(conceptsApi.bib).toHaveBeenCalledWith(query)
    expect(result).toMatchObject({ from: 6, filter: false })
    const inserted = doc.slice(0, result!.from) + result!.options[0]!.apply
    expect(inserted).toBe('See [@reference-key]')
  })

  it.each([']', '; @other]'])('이미 있는 닫는 글자 %s를 겹쳐 넣지 않는다', async (suffix) => {
    vi.spyOn(conceptsApi, 'bib').mockResolvedValue([entry])
    const prefix = 'See [@first; @2020'
    const result = await complete(prefix + suffix, prefix.length)
    expect(conceptsApi.bib).toHaveBeenCalledWith('2020')
    expect(result!.options[0]!.apply).toBe(entry.key)
    expect((prefix + suffix).slice(0, result!.from) + result!.options[0]!.apply + suffix).toBe(`See [@first; @reference-key${suffix}`)
  })

  it('괄호 밖 @에는 인용 목록을 열지 않는다', async () => {
    const bib = vi.spyOn(conceptsApi, 'bib').mockResolvedValue([entry])
    expect(await complete('mail @2020')).toBeNull()
    expect(bib).not.toHaveBeenCalled()
  })
})
