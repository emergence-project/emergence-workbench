import type { PaperPeek } from '@rw/core/contract/papers'
import { paperFetch, parsePaperId } from './paperAdd.js'
import { WorkbenchError } from './workbench.js'
import { t } from './i18n.js'

/**
 * 라이브러리에 넣기 전에 읽어 보기 (11/5 피드백 "곧바로 추가 말고 읽다가 추가"):
 * 추천 논문 · 찾기의 인터넷 결과를 넣지 않고 연다. arXiv면 PDF를 그대로 받아 넘기고(파일로 두지 않는다),
 * DOI면 Crossref의 초록을 준다(출판사 PDF는 받지 않는다). 넣으면 그때 보통 더하기(addPaper)가 PDF를 받는다.
 */

const tidy = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()

const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v)) : {})
const str = (v: unknown) => (typeof v === 'string' ? v : '')

function idOf(raw: unknown) {
  const id = typeof raw === 'string' ? parsePaperId(raw) : null
  if (!id) throw new WorkbenchError(400, t('arXiv 번호나 DOI가 아닙니다', 'Not an arXiv number or DOI'))
  return id
}

/** 넣기 전 논문 정보: 제목 · 저자 · 초록. 받지 못하면 offline */
export async function peekPaper(raw: unknown): Promise<PaperPeek> {
  const id = idOf(raw)
  try {
    if ('arxiv' in id) {
      const res = await paperFetch(`https://export.arxiv.org/api/query?id_list=${encodeURIComponent(id.arxiv)}`)
      if (!res.ok) return { arxiv: id.arxiv, authors: [], offline: true }
      const entry = /<entry>([\s\S]*?)<\/entry>/.exec(await res.text())?.[1] ?? ''
      const title = /<title[^>]*>([\s\S]*?)<\/title>/.exec(entry)?.[1]
      const summary = /<summary[^>]*>([\s\S]*?)<\/summary>/.exec(entry)?.[1]
      const doi = /<arxiv:doi[^>]*>([\s\S]*?)<\/arxiv:doi>/.exec(entry)?.[1]
      return {
        arxiv: id.arxiv, authors: [...entry.matchAll(/<author>\s*<name>([\s\S]*?)<\/name>/g)].map((m) => tidy(m[1]!)), offline: false,
        ...(title && { title: tidy(title) }), ...(summary && { abstract: tidy(summary) }), ...(doi && { doi: tidy(doi) }),
      }
    }
    const res = await paperFetch(`https://api.crossref.org/works/${encodeURIComponent(id.doi)}`)
    if (!res.ok) return { doi: id.doi, authors: [], offline: res.status !== 404 }
    const body: unknown = await res.json()
    const m: Record<string, unknown> = rec(rec(body).message)
    const title = Array.isArray(m.title) && typeof m.title[0] === 'string' ? tidy(m.title[0]) : undefined
    const people = (Array.isArray(m.author) ? m.author : []).map(rec)
    const abstract = typeof m.abstract === 'string' ? tidy(m.abstract.replace(/<jats:title>[\s\S]*?<\/jats:title>/g, '')) : undefined
    return {
      doi: id.doi, authors: people.map((a) => [str(a.given), str(a.family)].filter(Boolean).join(' ') || str(a.name)).filter(Boolean), offline: false,
      ...(title && { title }), ...(abstract && { abstract }),
    }
  } catch {
    return { ...('arxiv' in id ? { arxiv: id.arxiv } : { doi: id.doi }), authors: [], offline: true }
  }
}

/** 넣기 전 arXiv PDF (DOI는 받지 않는다) */
export async function peekPdf(raw: unknown): Promise<Buffer> {
  const id = idOf(raw)
  if (!('arxiv' in id)) throw new WorkbenchError(404, t('arXiv 논문만 넣기 전에 PDF를 엽니다', 'Only arXiv papers open as a PDF before adding'))
  let res: Response
  try { res = await paperFetch(`https://arxiv.org/pdf/${id.arxiv}`) } catch { throw new WorkbenchError(502, t('arXiv에 연결하지 못했습니다', 'Could not reach arXiv')) }
  const bytes = Buffer.from(await res.arrayBuffer())
  if (!res.ok || bytes.subarray(0, 5).toString('latin1') !== '%PDF-') throw new WorkbenchError(502, t(`arXiv PDF를 받지 못했습니다 (${res.status})`, `Could not download the arXiv PDF (${res.status})`))
  return bytes
}
