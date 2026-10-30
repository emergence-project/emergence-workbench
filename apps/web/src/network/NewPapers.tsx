import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { networkApi, papersApi, type NewPaper, type NewPapers, type PersonView } from '../api'
import { cardTime } from '../cardParts'
import { t } from '../i18n'
import { qk, queryClient } from '../queries'
import { announce, FRESH } from './people'

/** 이번에 처음 본 새 논문: 본 것으로 적은 뒤에도(사람 목록이 다시 읽혀 페이지가 새로 그려져도) 앱을 다시 열기 전까지는 점을 둔다 */
const freshThisTime = new Map<string, Set<string>>()

/** 새 논문을 받고, 처음 보는 논문이 있으면 본 것으로 적는다 (점은 freshThisTime으로 이번에는 그대로) */
async function loadNewPapers(id: string, signal?: AbortSignal): Promise<NewPapers> {
  const v = await networkApi.newPapers(id)
  const kept = freshThisTime.get(id) ?? new Set<string>()
  for (const p of v.papers) if (p.fresh) kept.add(p.id)
  freshThisTime.set(id, kept)
  // 받는 동안 페이지를 떠났으면(signal 취소) 보지 않은 것이니 본 것으로 적지 않는다
  if (!signal?.aborted && v.papers.some((p) => p.fresh)) void networkApi.seenPapers(id).then(announce).catch(() => undefined)
  return { ...v, papers: v.papers.map((p) => ({ ...p, fresh: kept.has(p.id) })) }
}

/**
 * 새 논문 (10/19 사람 페이지): Semantic Scholar 저자 ID가 있으면 그 ID로, 없으면 arXiv 이름 검색으로 최근 90일 논문을 하루에 한 번 찾는다.
 * 처음 보는 논문엔 파란 점. 페이지를 열면 본 것으로 적는다(점은 이번에는 그대로 보인다). 같은 이름의 다른 사람 논문은 "이 사람 아님"으로 숨긴다.
 */
export function NewPapersSection({ person, onSaved }: { person: PersonView; onSaved(m: string): void }) {
  const key = qk.personNewPapers(person.id, person.s2 ?? '', person.name)
  const { data: d, error } = useQuery({ queryKey: key, queryFn: ({ signal }) => loadNewPapers(person.id, signal), ...FRESH })
  const [busy, setBusy] = useState<string | null>(null)
  const change = (f: (cur: NewPapers) => NewPapers) => queryClient.setQueryData<NewPapers>(key, (cur) => cur && f(cur))
  const add = async (p: NewPaper) => {
    setBusy(p.id)
    try {
      await papersApi.add(p.arxiv ?? p.doi ?? p.url)
      change((cur) => ({ ...cur, papers: cur.papers.map((x) => (x.id === p.id ? { ...x, inLibrary: true } : x)) }))
      onSaved(t('논문 라이브러리에 더했습니다', 'Added to the paper library'))
    } catch (e) { onSaved((e as Error).message) } finally { setBusy(null) }
  }
  const hide = async (p: NewPaper) => {
    setBusy(p.id)
    try {
      await networkApi.hidePaper(person.id, p.id); announce()
      change((cur) => ({ ...cur, papers: cur.papers.filter((x) => x.id !== p.id), hidden: cur.hidden + 1 }))
    } catch (e) { onSaved((e as Error).message) } finally { setBusy(null) }
  }
  const how = d?.source === 's2' ? t('Semantic Scholar 저자 ID로', 'By Semantic Scholar author ID') : t('arXiv 이름 검색으로', 'By arXiv name search')
  return (
    <section data-ui="새 논문">
      <div className="sec-head">
        <h2>{t('새 논문', 'New papers')}</h2>
        {d && <span className="count">{[how, t('최근 90일 · 하루 한 번', 'last 90 days · once a day'), d.checkedAt ? cardTime(d.checkedAt) : null].filter(Boolean).join(' · ')}</span>}
      </div>
      {error ? <p className="muted">{error.message}</p> : !d ? <p className="muted">{t('찾는 중…', 'Searching…')}</p> : <>
        {d.error && <p className="muted">{t(`이번에는 찾지 못했습니다 (${d.error}). 지난 결과입니다.`, `Couldn't search this time (${d.error}). Showing the last result.`)}</p>}
        {d.papers.length === 0
          ? <p className="muted">{!d.live && d.checkedAt === null ? t('개발용 예제 모드에서는 바깥에서 찾지 않습니다.', 'Sample mode does not search online.') : t('최근 90일 안에 새 논문이 없습니다.', 'No new papers in the last 90 days.')}</p>
          : <ul className="net-new-list">
            {d.papers.map((p) => (
              <li key={p.id} data-ui="새 논문 줄" data-ui-item={p.id}>
                <span className="net-title-row">{p.fresh && <span className="net-new-dot" title={t('처음 보는 논문', 'New since last time')} />}<a className="a net-title" href={p.url} target="_blank" rel="noreferrer">{p.title}</a></span>
                <div className="muted net-meta">{[p.arxiv && `arXiv:${p.arxiv}`, p.date, p.authors.slice(0, 4).join(', ') + (p.authors.length > 4 ? ' …' : '')].filter(Boolean).join(' · ')}</div>
                <div className="net-new-acts">
                  {p.inLibrary ? <span className="muted">{t('라이브러리에 있음', 'In the library')}</span>
                    : (p.arxiv || p.doi) && <button className="a" disabled={busy === p.id} onClick={() => void add(p)}>{t('논문 라이브러리에 추가', 'Add to paper library')}</button>}
                  <button className="a" disabled={busy === p.id} title={t('같은 이름의 다른 사람 논문이면 숨깁니다', 'Hide it if it is by someone else with the same name')} onClick={() => void hide(p)}>{t('이 사람 아님', 'Not this person')}</button>
                </div>
              </li>
            ))}
          </ul>}
        {!person.s2 && d.source === 'arxiv' && <p className="muted net-new-hint">{t('같은 이름의 다른 사람 논문이 섞이면 연필 › "Semantic Scholar 저자"를 고르세요.', 'If papers by namesakes show up, pick a Semantic Scholar author under the pencil.')}</p>}
      </>}
    </section>
  )
}
