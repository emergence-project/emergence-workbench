import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { MemoList, MemoText } from './memo'
import { Children, isValidElement, type ReactNode } from 'react'
import type { JournalEntry } from '@rw/core'

describe('MemoText list markers', () => {
  it('renders nested bullet depths with disc, circle, and square markers', () => {
    const html = renderToStaticMarkup(<MemoText text={'- 위\n  - 아래\n    - 더 아래'} />)
    expect(html).toContain('list-style-type:disc')
    expect(html).toContain('list-style-type:circle')
    expect(html).toContain('list-style-type:square')
    expect(html).toContain('margin-left:calc(var(--sp-4) * 1)')
  })

  it('keeps numbered lists ordered without replacing their markers', () => {
    const html = renderToStaticMarkup(<MemoText text={'1. 위\n  2. 아래'} />)
    expect(html).toContain('<ol>')
    expect(html).not.toContain('list-style-type:')
  })
})

// React가 실제로 사용하는 중첩 자식 key 경로로 편집 중인 항목의 정체성을 확인한다.
function rows(node: ReactNode, prefix = ''): { key: string; entry: JournalEntry }[] {
  return Children.toArray(node).flatMap((child) => {
    if (!isValidElement<{ e?: JournalEntry; children?: ReactNode }>(child)) return []
    const key = `${prefix}/${child.key}`
    return child.props.e ? [{ key, entry: child.props.e }] : rows(child.props.children, key)
  })
}

it('앞 할 일이 외부에서 삭제돼 번호와 날짜 머리줄이 밀려도 편집기는 같은 연결 항목에 남는다', () => {
  const entries: JournalEntry[] = ['a', 'b', 'c'].map((id, index) => ({ date: '2026-10-07', time: '12:34', kind: 'todo', target: '연구', text: '같은 글', done: false, index, link: `project/${id}` }))
  const render = (items: JournalEntry[]) => rows(MemoList({ entries: items, rid: 'sample', titleOf: (id) => id, onToggle: () => {}, empty: '비어 있음' }))
  const selected = render(entries).find((r) => r.entry.link === 'project/b')!
  const reloaded = render(entries.slice(1).map((e, index) => ({ ...e, index })))
  expect(reloaded.find((r) => r.key === selected.key)?.entry.link).toBe('project/b')
  expect(reloaded.find((r) => r.entry.link === 'project/b')?.key).toBe(selected.key)
})
