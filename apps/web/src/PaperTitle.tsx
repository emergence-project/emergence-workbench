import katex from 'katex'
import 'katex/dist/katex.min.css'
import { Fragment } from 'react'

/**
 * 논문 제목의 TeX (11/20 피드백 00:08 「제목에서 latex이 지원이 안 됨」): bib · arXiv 제목의 $…$는 수식으로 그리고,
 * 대소문자를 지키는 괄호 {}와 \& 같은 이스케이프는 글자로 푼다. 수식이 아닌 글은 그대로.
 */
export function titleParts(title: string): { math: boolean; text: string }[] {
  const out: { math: boolean; text: string }[] = []
  const re = /\$([^$]+)\$/g
  let at = 0
  for (let m = re.exec(title); m; m = re.exec(title)) {
    if (m.index > at) out.push({ math: false, text: plain(title.slice(at, m.index)) })
    out.push({ math: true, text: m[1]! })
    at = m.index + m[0].length
  }
  if (at < title.length) out.push({ math: false, text: plain(title.slice(at)) })
  return out.filter((p) => p.text)
}

/** 수식 밖의 글: {Na} → Na, \& → & */
const plain = (s: string) => s.replace(/\\([&%#_$])/g, '$1').replace(/[{}]/g, '')

/** 툴팁 · 정렬처럼 글만 쓰는 곳의 제목 (수식은 TeX 그대로, 괄호만 뺀다) */
export const titleText = (title: string) => titleParts(title).map((p) => p.text).join('')

export function PaperTitle({ title }: { title: string }) {
  if (!title.includes('$') && !/[{}\\]/.test(title)) return <>{title}</>
  return <>{titleParts(title).map((p, i) => p.math
    ? <span key={i} dangerouslySetInnerHTML={{ __html: katex.renderToString(p.text, { throwOnError: false }) }} />
    : <Fragment key={i}>{p.text}</Fragment>)}</>
}
