import { createElement, type ComponentType, type ReactNode } from 'react'
import { parseAboutMd, type AboutLine, type AboutMd } from '@rw/core'
import * as figures from '../aboutFigures'
import type { AboutItem, AboutSection } from './types'

// 소개 절 파일 about/<쪽>/<절>.md (11/27 "소개를 에이전트가 읽는 정본으로"): 형식은 packages/core/src/about-md.ts.
// .tsx 절과 같은 AboutSection으로 바꿔 쪽 파일이 그대로 늘어놓는다. 열쇠는 "<쪽>/<절>".

const RAW = import.meta.glob<string>('./*/*.md', { query: '?raw', import: 'default', eager: true })

/** "<쪽>/<절>" → 읽은 절 파일 */
export const ABOUT_MD: ReadonlyMap<string, AboutMd> = new Map(Object.entries(RAW).map(([f, raw]) => {
  const key = f.replace(/^\.\//, '').replace(/\.md$/, '')
  try { return [key, parseAboutMd(raw)] } catch (e) { throw new Error(`소개 절 ${key}.md: ${e instanceof Error ? e.message : String(e)}`) }
}))

const FIGS: Record<string, unknown> = figures
const isComponent = (f: unknown): f is ComponentType => typeof f === 'function'

/** 한 줄 → 화면 글 (굵게 · 코드 · 링크) */
export function inline(line: AboutLine): ReactNode {
  return line.map((x, i) => typeof x === 'string' ? x
    : 'b' in x ? <b key={i}>{inline(x.b)}</b>
    : 'code' in x ? <code key={i}>{x.code}</code>
    : <a key={i} className="a" href={x.href} {...(/^https?:/.test(x.href) && { target: '_blank', rel: 'noreferrer' })}>{inline(x.a)}</a>)
}

const items = (lines: AboutLine[]): AboutItem[] => lines.map((l) => ({ text: <>{inline(l)}</> }))

function figureOf(name: string | undefined): ReactNode {
  if (!name) return undefined
  const f = FIGS[name]
  if (!isComponent(f)) throw new Error(`소개 그림이 없습니다: ${name} (aboutFigures.tsx)`)
  return createElement(f)
}

/** 절 파일 하나 → 한국어 · 영어 절 */
export function mdSection(key: string): { ko: AboutSection; en: AboutSection } {
  const m = ABOUT_MD.get(key)
  if (!m) throw new Error(`소개 절 파일이 없습니다: about/${key}.md`)
  const one = (lang: 'ko' | 'en'): AboutSection => ({
    title: m.title[lang],
    file: key,
    ...(m.id && { id: m.id }),
    ...(m.ui && { ui: m.ui }),
    ...(m.port && { port: m.port }),
    ...(m.figure && { figure: figureOf(m.figure) }),
    ...(m.summary && { summary: m.summary[lang] }),
    ...(lang === 'ko' && m.ask && { ask: m.ask.ko }),
    ...(lang === 'ko' && m.prs.length && { prs: m.prs }),
    items: items(m[lang].items),
    ...(m[lang].keep.length && { keep: items(m[lang].keep) }),
    ...(m[lang].decisions.length && { decisions: items(m[lang].decisions) }),
    ...(m.code.length && { code: m.code }),
    ...(m.mcp.length && { mcp: m.mcp }),
  })
  return { ko: one('ko'), en: one('en') }
}
