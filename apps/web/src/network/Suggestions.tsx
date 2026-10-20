import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { networkApi, type PersonSuggestion, type PersonView } from '../api'
import { Icon } from '../icons'
import { plural, t } from '../i18n'
import { qk } from '../queries'
import { addedOf, announce, Avatar, FRESH } from './people'

const HIDE_KEY = 'rw-network-hidden-suggestions'
const readList = (key: string): string[] => { try { return JSON.parse(localStorage.getItem(key) ?? '[]') as string[] } catch { return [] } }
const readHidden = () => readList(HIDE_KEY)

/** 네트워킹 화면에서 이미 본 추천 (이 컴퓨터에 기억). 왼쪽 띠의 수는 보지 않은 추천만 센다 */
const SEEN_KEY = 'rw-network-seen-suggestions'
const SEEN_EVENT = 'rw-network-seen'
function markSeen(names: string[]) {
  const seen = readList(SEEN_KEY)
  const next = [...seen, ...names.filter((n) => !seen.includes(n))]
  if (next.length === seen.length) return
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(next)) } catch { /* 기억 못 해도 된다 */ }
  window.dispatchEvent(new Event(SEEN_EVENT))
}

/** 등록 추천: 왼쪽 띠의 수와 첫 화면의 추천이 같은 자료를 쓴다 */
const useSuggestions = () => useQuery({ queryKey: qk.peopleSuggestions, queryFn: () => networkApi.suggestions().then((v) => v.suggestions), ...FRESH })

/** 왼쪽 띠의 네트워킹 버튼에 붙는 수: 아직 보지 않은 등록 추천 (뺀 추천은 세지 않는다, 10/4 18:16 피드백) */
export function NetworkRailCount() {
  const { data } = useSuggestions()
  const [, rerender] = useState(0)
  useEffect(() => {
    // 본 것 · 뺀 것은 이 컴퓨터에만 기억하므로 서버 자료가 아니라 창 이벤트로 다시 센다
    const onSeen = () => rerender((t) => t + 1)
    window.addEventListener(SEEN_EVENT, onSeen)
    return () => window.removeEventListener(SEEN_EVENT, onSeen)
  }, [])
  if (!data) return null
  const hidden = readHidden()
  const seen = readList(SEEN_KEY)
  const n = data.filter((x) => !hidden.includes(x.name) && !seen.includes(x.name)).length
  if (!n) return null
  return <span className="rail-count" data-ui="새 추천 수" title={t(`새로 추천된 사람 ${n}명 — 노트 참고 문헌에 자주 나오는 사람`, `${n} newly suggested: people who appear often in your note references`)}>{n}</span>
}

/**
 * 등록 추천 (10/4 16:56 "논문들 중에서 자주 언급되는 사람은 등록을 추천"): 노트 참고 문헌에 두 편 넘게 나오는데 아직 없는 사람.
 * 10/4 19:08 "추가를 위한 선택 카드도 깔끔하게": 사람 카드보다 작은 카드에 이름·편 수·최근 논문·있는 곳.
 * 참고 문헌(bib)에는 저자 이름만 있어 소속·이메일은 알 수 없다. 더할 때는 bib에 다르게 적힌 이름만 "다른 이름"으로 넣는다.
 * ＋로 네트워킹에 더하고, ×로 이 추천에서만 뺀다 (이 컴퓨터에 기억).
 */
export function Suggestions({ people, onSaved }: { people: PersonView[]; onSaved(m: string): void }) {
  const { data: list } = useSuggestions()
  const [hidden, setHidden] = useState(readHidden)
  // 이 화면에 나온 추천은 본 것으로 (왼쪽 띠의 수에서 빠진다)
  useEffect(() => { if (list) markSeen(list.map((x) => x.name)) }, [list])
  const shown = (list ?? []).filter((s) => !hidden.includes(s.name))
  if (!shown.length) return null
  const hide = (name: string) => {
    const next = [...hidden, name]
    setHidden(next)
    try { localStorage.setItem(HIDE_KEY, JSON.stringify(next)) } catch { /* 기억 못 해도 된다 */ }
    window.dispatchEvent(new Event(SEEN_EVENT))
  }
  const add = async (s: PersonSuggestion) => {
    try {
      await networkApi.savePeople([...addedOf(people), { name: s.name, ...(s.aliases?.length && { aliases: s.aliases }) }])
      announce()
      onSaved(t(`"${s.name}"을 더했습니다. 소속·이메일은 사람 페이지에서 적습니다`, `Added "${s.name}". Add affiliation and email on the person page`))
    } catch (e) { onSaved((e as Error).message) }
  }
  return (
    <div className="net-suggest" data-ui="등록 추천">
      <h3 className="net-group-h">{t('등록 추천', 'Suggested')} <span className="muted">{t('노트 참고 문헌에 자주 나오는 사람', 'People who appear often in your note references')}</span></h3>
      <div className="net-sug-cards">
        {shown.map((s) => (
          <div key={s.name} className="net-sug" data-ui="추천 카드" data-ui-item={s.name}>
            <Avatar name={s.name} />
            <div className="net-sug-body">
              <span className="net-sug-name">{s.name}</span>
              <span className="muted net-sug-sub">{t(`참고 문헌 ${s.count}편`, plural(s.count, 'reference'))}{s.latest?.year && t(` · 최근 ${s.latest.year}`, ` · latest ${s.latest.year}`)}{s.where.length > 0 && ` · ${s.where[0]}${s.where.length > 1 ? t(` 외 ${s.where.length - 1}곳`, ` and ${s.where.length - 1} more`) : ''}`}</span>
              {s.latest?.title && <span className="muted net-sug-sub" title={s.latest.title}>{s.latest.title}</span>}
            </div>
            <div className="net-sug-actions">
              <button className="icon-btn sm" title={t(`더하기 — 네트워킹에 더합니다${s.aliases?.length ? ` (다른 이름: ${s.aliases.join(', ')})` : ''}`, `Add to Networking${s.aliases?.length ? ` (also called: ${s.aliases.join(', ')})` : ''}`)} aria-label={t(`${s.name} 더하기`, `Add ${s.name}`)} onClick={() => void add(s)}>{Icon.plus}</button>
              <button className="icon-btn sm" title={t('빼기 — 이 추천에서만 뺍니다', 'Remove from these suggestions only')} aria-label={t(`${s.name} 추천 빼기`, `Remove suggestion ${s.name}`)} onClick={() => hide(s.name)}>{Icon.x}</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
