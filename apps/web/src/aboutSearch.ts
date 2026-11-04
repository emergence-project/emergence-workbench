import { isValidElement, type ReactNode } from 'react'
import { ABOUT_PARTS, sectionAnchor } from './aboutContent'
import type { Route } from './router'

/** 소개 글의 글자만 (굵게 · 코드 안의 글도) */
export function nodeText(n: ReactNode): string {
  if (n === null || n === undefined || typeof n === 'boolean') return ''
  if (typeof n === 'string' || typeof n === 'number') return String(n)
  if (Array.isArray(n)) return n.map(nodeText).join('')
  if (isValidElement<{ children?: ReactNode }>(n)) return nodeText(n.props.children)
  return ''
}

export interface AboutHit { key: string; text: string; where: string; to: Route; /** 용어 정의 줄(화면 요소 이름)의 이름들 */ names?: string[] }

let cache: AboutHit[] | null = null
/**
 * 전역 검색이 찾는 소개 글 (10/30 16:51 "앱 소개에서 레일 정의를 보려는데 나타나지 않네"): 절 제목과 항목마다 한 줄.
 * 누르면 그 절로 간다.
 */
export function aboutIndex(): AboutHit[] {
  if (cache) return cache
  cache = ABOUT_PARTS.flatMap((p) => (p.sections ?? []).flatMap((s, i) => {
    const to: Route = { page: 'about', part: p.id, anchor: sectionAnchor(s, i) }
    const where = `${p.title} › ${s.title}`
    return [
      { key: `about:${p.id}:${i}`, text: s.title, where: p.title, to },
      ...s.items.map((it, j) => {
        const text = nodeText(it.text).replace(/\s+/g, ' ').trim()
        const head = s.id === 'names' ? /^([^:]+):/.exec(text)?.[1] : undefined
        return { key: `about:${p.id}:${i}:${j}`, text, where, to, ...(head && { names: head.split(/\s*[·()]\s*/).filter(Boolean) }) }
      }),
    ]
  }))
  return cache
}

/** 찾는 말이 용어 이름과 같은 정의 줄을 맨 앞에 (나머지 차례는 그대로) */
export function definitionsFirst(hits: AboutHit[], term: string): AboutHit[] {
  const q = term.trim().toLowerCase()
  const isDef = (a: AboutHit) => !!a.names?.some((n) => n.toLowerCase() === q)
  return [...hits.filter(isDef), ...hits.filter((a) => !isDef(a))]
}
