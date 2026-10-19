import { personId, type Author } from '@rw/core'
import { useEffect, useRef, useState } from 'react'
import { fieldIndex } from './fields'
import { FieldTags as FieldPicker, useFields } from './FieldTags'
import { AffiliationFields } from './AffiliationFields'
import { askConfirm, askText } from './askText'
import { CardEditDialog } from './CardEditDialog'
import { conceptsApi, googleApi, latexApi, networkApi, papersApi, type Coauthor, type NewPaper, type NewPapers, type PersonAppearance, type PersonPaper, type PersonSuggestion, type PersonView, type S2Author } from './api'
import { Icon } from './icons'
import { go } from './router'
import { plural, t } from './i18n'
import { StarIcon } from './marks'

/**
 * 네트워킹: 함께 연구하는 사람들 (10/4 피드백).
 * - 사이드바에 사람 목록: 저자와 소속에 있는 사람 + 따로 더한 관심 연구자 (앱 설정 config.yaml의 people:)
 * - 사람마다 페이지: 우선 노트 참고 문헌(공유 라이브러리 references.bib와 프로젝트 bib)에 있는 그 사람의 논문. arXiv 새 논문은 나중에 (10/4 사용자 결정)
 */

/** 사람 목록이 바뀌면 사이드바와 본문이 함께 다시 읽는다 */
const CHANGED = 'rw-network-changed'
const announce = () => window.dispatchEvent(new Event(CHANGED))

function usePeople(): [PersonView[] | null, string] {
  const [people, setPeople] = useState<PersonView[] | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    const load = () => networkApi.list().then((v) => setPeople(v.people)).catch((e: Error) => setError(e.message))
    void load()
    window.addEventListener(CHANGED, load)
    return () => window.removeEventListener(CHANGED, load)
  }, [])
  return [people, error]
}


/** 이 사람 목록에서 "더한 사람"만 저장할 모양으로. 저자의 소속·이메일은 저자와 소속에 있으므로 여기 넣지 않는다 */
const addedOf = (people: PersonView[]) => people.filter((p) => p.added)
  .map((p) => ({
    name: p.name, ...(p.aliases.length && { aliases: p.aliases }), ...(p.note && { note: p.note }), ...(p.tags.length && { tags: p.tags }), ...(p.star && { star: true }),
    ...(!p.author && p.affiliations.length && { affiliations: p.affiliations }), ...(!p.author && p.email && { email: p.email }), ...(!p.author && p.emails.length && { emails: p.emails }), ...(p.homepage && { homepage: p.homepage }), ...(p.s2 && { s2: p.s2 }),
  }))

/** 이 사람 줄을 더한 사람 목록에 넣어 고친다 (저자도 이름표·다른 이름은 여기에 저장한다) */
const withChange = (people: PersonView[], person: PersonView, change: Partial<PersonView>) =>
  people.some((p) => p.id === person.id && p.added)
    ? people.map((p) => (p.id === person.id ? { ...p, ...change } : p))
    : [...people, { ...person, ...change, added: true }]

/**
 * 앱 사용자 본인 (10/4 14:46 피드백 "사용자니깐 상단에 둬 주고"): 구글 계정 이메일과 같은 저자, 없으면 저자와 소속의 첫 사람.
 */
function useMe(people: PersonView[] | null): PersonView | undefined {
  const [email, setEmail] = useState<string | undefined>()
  useEffect(() => { googleApi.status().then((s) => setEmail(s.email)).catch(() => undefined) }, [])
  if (!people) return undefined
  const mail = email?.toLowerCase()
  return (mail && people.find((p) => p.author && [p.email, ...p.emails].some((m) => m?.toLowerCase() === mail))) || people.find((p) => p.author)
}

/** 얼굴 대신 이름 머리글자 (남녀 아이콘은 쓰지 않는다: 10/4 14:46 피드백에 대한 결정) */
const initials = (name: string) => {
  const parts = name.replace(/[^\p{L}\s-]/gu, ' ').split(/[\s-]+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1]![0] : '')).toUpperCase() || '?'
}
/** 머리글자, 사진이 있으면 사진 (10/19 사람 페이지) */
export function Avatar({ name, big, xl, person }: { name: string; big?: boolean; xl?: boolean; person?: Pick<PersonView, 'id' | 'photo'> }) {
  return <span className={`net-avatar${big ? ' big' : ''}${xl ? ' xl' : ''}${person?.photo ? ' photo' : ''}`} aria-hidden>
    {person?.photo ? <img src={networkApi.photoUrl(person.id, person.photo)} alt="" /> : initials(name)}
  </span>
}

async function addPerson(people: PersonView[], onSaved: (m: string) => void) {
  const name = (await askText({ title: t('사람 더하기', 'Add person'), label: t('이름', 'Name'), placeholder: t('예: Bea Sample', 'e.g. Bea Sample'), hint: t('참고 문헌에서 이 성과 이름 첫 글자로 논문을 찾습니다.', 'Papers in your references are found by this last name and first initial.'), ok: t('더하기', 'Add') }))?.replace(/\s+/g, ' ').trim()
  if (!name) return
  try {
    const v = await networkApi.savePeople([...addedOf(people), { name }])
    announce()
    const p = v.people.find((x) => x.name === name)
    if (p) go({ page: 'network', person: p.id })
    onSaved(t(`"${name}"을 네트워킹에 더했습니다`, `Added "${name}" to Networking`))
  } catch (e) { onSaved((e as Error).message) }
}

export function NetworkSide({ person, onSaved }: { person?: string; onSaved(m: string): void }) {
  const [people] = usePeople()
  const me = useMe(people)
  return (
    <div className="set-side" data-ui="사람 목록">
      {me && (
        <button className={`nav net-me${person === me.id ? ' on' : ''}`} data-ui="나" title={t('내 페이지 (프로필·노트 저자)', 'My page (profile and note authors)')} onClick={() => go({ page: 'network', person: me.id })}>
          <Avatar name={me.name} person={me} /><span className="label">{me.name}</span><span className="meta">{t('나', 'Me')}</span>
        </button>
      )}
      <button className={`nav${!person ? ' on' : ''}`} data-ui="사람 줄" data-ui-item="저자와 소속" onClick={() => go({ page: 'network' })}>
        <span className="label">{t('모든 사람', 'All people')}</span>
      </button>
      <div className="net-side-h">{t('사람', 'People')}</div>
      {(people ?? []).filter((p) => p.id !== me?.id).sort(byStarThenName).map((p) => (
        <button key={p.id} className={`nav${person === p.id ? ' on' : ''}`} data-ui="사람 줄" data-ui-item={p.name} title={subOf(p)} onClick={() => go({ page: 'network', person: p.id })}>
          <span className="label">{p.name}</span>{p.star && <span className="meta" aria-label={t('즐겨찾기', 'Favorite')}><StarIcon on /></span>}
          {!!p.newPapers && <span className="meta net-new-n" data-ui="새 논문 수" title={t(`새 논문 ${p.newPapers}편`, plural(p.newPapers, 'new paper'))}>{p.newPapers}</span>}
        </button>
      ))}
      {people && <button className="nav net-add" data-ui="사람 더하기" onClick={() => void addPerson(people, onSaved)}><span className="label">{t('＋ 사람 더하기', '＋ Add person')}</span></button>}
    </div>
  )
}

export function NetworkPage({ person, onSaved }: { person?: string; onSaved(m: string): void }) {
  return (
    <main className="stage full" data-ui="네트워킹">
      <section className="pane">
        <div className="scroll">
          <div className="page-body">
            {person ? <PersonPage id={person} onSaved={onSaved} /> : <Authors onSaved={onSaved} />}
          </div>
        </div>
      </section>
    </main>
  )
}

type GroupBy = '모두' | '기관별' | '분야별'
const GROUP_KEY = 'rw-network-group'
const GROUPS: GroupBy[] = ['모두', '기관별', '분야별']
/** 묶기 버튼의 화면 이름 (GroupBy는 저장 값) */
const GROUP_LABEL: Record<GroupBy, string> = { 모두: t('모두', 'All'), 기관별: t('기관별', 'By institution'), 분야별: t('분야별', 'By field') }

/** 사람 줄 순서 (10/4 16:19): 즐겨찾기 먼저, 그다음 이름 가나다순 */
export const byStarThenName = (a: { star: boolean; name: string }, b: { star: boolean; name: string }) =>
  Number(b.star) - Number(a.star) || a.name.localeCompare(b.name, 'ko')

/** 카드 둘째 줄: 소속(기관)과 주 연구 분야 (10/4 16:20 "저자 대신 소속이랑 주 연구 분야") */
const subOf = (p: PersonView) => p.orgs[0] || p.note || (p.tags.length ? '' : t('소속·분야를 사람 페이지에서 적습니다', 'Add affiliation and field on the person page'))

/**
 * 사람 카드 하나 (첫 화면의 사람들, 내 페이지의 노트 저자·함께 쓴 사람이 같은 카드를 쓴다: 10/4 20:53 "디자인 또 만들지 말고 카드 디자인 다시 써").
 * 오른쪽 위는 즐겨찾기 ☆, 노트 저자 목록에서는 빼기 × (가리킬 때).
 */
function PersonCard({ p, people, isMe, sub, badge, onRemove }: { p: PersonView; people: PersonView[]; isMe?: boolean; sub?: string; badge?: string; onRemove?(): void }) {
  const toggleStar = async () => {
    try { await networkApi.savePeople(addedOf(withChange(people, p, { star: !p.star }))); announce() } catch { /* 다음에 다시 */ }
  }
  const line = sub ?? subOf(p)
  return (
    <div className="net-card-wrap">
      <button className="net-card" data-ui="사람 카드" data-ui-item={p.name} onClick={() => go({ page: 'network', person: p.id })}>
        <Avatar name={p.name} person={p} />
        <span className="net-card-body">
          <span className="net-card-name"><span className="net-card-n">{p.name}</span>{isMe && <span className="tag">{t('나', 'Me')}</span>}{badge && <span className="tag">{badge}</span>}</span>
          {line && <span className="muted net-card-sub">{line}</span>}
          {/* 10/4 19:07 "주 분야를 먼저 띄우고, 나머지 분야는 +2": 첫 이름표만, 나머지는 수로 (가리키면 이름이 뜬다) */}
          {p.tags.length > 0 && (
            <span className="net-card-tags">
              <span className="tag">{p.tags[0]}</span>
              {p.tags.length > 1 && <span className="net-more" title={p.tags.slice(1).join(' · ')} aria-label={t(`다른 분야 ${p.tags.slice(1).join(', ')}`, `Other fields: ${p.tags.slice(1).join(', ')}`)}>+{p.tags.length - 1}</span>}
            </span>
          )}
        </span>
      </button>
      {onRemove
        ? <span className="hover-actions net-card-actions"><button className="icon-btn sm" data-ui="저자에서 빼기" title={t('빼기 — 노트 저자에서만 빠지고, 네트워킹의 사람은 그대로 남습니다', 'Remove from note authors only. The person stays in Networking')} aria-label={t('노트 저자에서 빼기', 'Remove from note authors')} onClick={onRemove}>{Icon.x}</button></span>
        : !isMe && (
          <button className={`net-star${p.star ? ' on' : ''}`} data-ui="즐겨찾기" aria-pressed={p.star} title={p.star ? t('즐겨찾기 빼기', 'Remove from favorites') : t('즐겨찾기 (맨 앞에 둡니다)', 'Favorite (keeps it first)')} onClick={() => void toggleStar()}>
            <StarIcon on={p.star} />
          </button>
        )}
    </div>
  )
}

/**
 * 네트워킹 첫 화면 (10/4 14:46, 16:19 피드백): "사람들" 한 칸.
 * 맨 위에 나(노트 저자는 내 페이지에서, 10/4 20:49), 그 아래 사람 카드(즐겨찾기 → 가나다순, 기관별·분야별로 묶어 볼 수 있다), 등록 추천.
 */
function Authors({ onSaved }: { onSaved(m: string): void }) {
  const [people] = usePeople()
  const me = useMe(people)
  const fields = useFields()
  const [by, setBy] = useState<GroupBy>(() => { try { const v = localStorage.getItem(GROUP_KEY) as GroupBy | null; return v && GROUPS.includes(v) ? v : '모두' } catch { return '모두' } })
  /** 분야별에서 고른 분야 하나 (없으면 모든 분야) */
  const [field, setField] = useState<string | null>(null)
  const pick = (g: GroupBy) => { setBy(g); setField(null); try { localStorage.setItem(GROUP_KEY, g) } catch { /* 기억 못 해도 된다 */ } }

  const others = (people ?? []).filter((p) => p.id !== me?.id).sort(byStarThenName)
  const groups = new Map<string, PersonView[]>()
  for (const p of others) {
    const keys = by === '모두' ? ['모두'] : by === '기관별' ? p.orgs : p.tags
    for (const k of keys.length ? keys : ['']) groups.set(k, [...(groups.get(k) ?? []), p])
  }
  const restTitle = by === '기관별' ? t('소속을 모름', 'Unknown affiliation') : t('분야 태그 없음', 'No field tag')
  // 분야별은 분야 차례(분류 순서)를 따라 늘어놓는다. 기관별은 사람이 많은 순
  const index = by === '분야별' ? fieldIndex(new Map([...groups.entries()].filter(([k]) => k).map(([k, v]) => [k, v.length])), fields ?? []) : []
  const named = by === '분야별'
    ? index.flatMap((r) => r.fields.map((f) => [f.name, groups.get(f.name)!, r.root ? [r.root, f.rest].filter(Boolean).join(' › ') : ''] as const))
    : [...groups.entries()].filter(([k]) => k).sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0])).map(([k, v]) => [k, v, ''] as const)
  const rest = groups.get('')
  const shown = [...named, ...(rest ? [[restTitle, rest, ''] as const] : [])].filter(([k]) => !field || k === field)

  const card = (p: PersonView, isMe = false) => <PersonCard key={p.id} p={p} people={people!} isMe={isMe} />

  return (
    <>
      <header>
        <p className="h-sub" data-ui="부제">{t('함께 연구하는 사람들입니다. 사람을 고르면 소속·연구 분야·저자 정보와 노트 참고 문헌에 있는 그 사람의 논문이 보입니다.', 'People you work with. Pick someone to see their affiliation, field, author info and their papers in your note references.')}</p>
      </header>
      {/* 나는 사람들 칸 위에 따로 (10/4 16:52). 노트 저자는 내 페이지 안에서만 (10/4 20:49 "내 프로필 내부로 옮기자") */}
      {me && (
        <section className="net-me" data-ui="나">
          <div className="net-cards">{card(me, true)}</div>
        </section>
      )}
      <section data-ui="사람 카드">
        <div className="sec-head">
          <h2>{t('사람들', 'People')}</h2><span className="count">{people ? others.length : ''}</span><span className="sp" />
          <div className="segmented small" role="radiogroup" aria-label={t('그룹', 'Group by')} data-ui="묶기">
            {GROUPS.map((g) => <button key={g} role="radio" aria-checked={by === g} className={by === g ? 'on' : ''} onClick={() => pick(g)}>{GROUP_LABEL[g]}</button>)}
          </div>
        </div>
        {!people ? <p className="muted">{t('불러오는 중…', 'Loading…')}</p> : (
          <>
            {/* 10/4 19:20 "분야별로 볼 때 분야 탐색은?": 개념노트 분류의 맨 위 단계별로 분야 차례를 두고, 하나를 고르면 그 분야 사람만 */}
            {by === '분야별' && index.length > 0 && (
              <nav className="net-field-index" data-ui="분야 차례" aria-label={t('분야 차례', 'Fields')}>
                <button className={`net-field${!field ? ' on' : ''}`} onClick={() => setField(null)}>{t('모든 분야', 'All fields')} <span className="muted">{others.length}</span></button>
                {index.map((r) => (
                  <div key={r.root || '-'} className="net-field-row">
                    <span className="net-field-root muted">{r.root || t('목록에 없음', 'Not in list')}</span>
                    {r.fields.map((f) => (
                      <button key={f.name} className={`net-field${field === f.name ? ' on' : ''}`} title={r.root ? [r.root, f.rest].join(' › ') : t('개념노트 분류 목록에 없는 태그', 'Tag not in the concept note subject list')} onClick={() => setField(field === f.name ? null : f.name)}>
                        {/* 10/4 20:51 반려 "경로 전체가 있어 난잡해": 마지막 단계 이름만, 전체 경로는 가리키면 */}{f.name} <span className="muted">{f.count}</span>
                      </button>
                    ))}
                  </div>
                ))}
              </nav>
            )}
            {shown.map(([k, list, path]) => (
              <div key={k} className="net-group">
                {by !== '모두' && <h3 className="net-group-h" title={path || undefined}>{k} <span className="muted">{list.length}</span></h3>}
                <div className="net-cards">{list.map((p) => card(p))}</div>
              </div>
            ))}
            {by === '분야별' && !named.length && <p className="muted">{t('사람 페이지에서 "주 연구 분야"를 적으면 여기서 분야별로 묶입니다.', 'Add "Main research field" on a person page to group them by field here.')}</p>}
          </>
        )}
        {people && <Suggestions people={people} onSaved={onSaved} />}
      </section>
    </>
  )
}

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

/** 왼쪽 띠의 네트워킹 버튼에 붙는 수: 아직 보지 않은 등록 추천 (뺀 추천은 세지 않는다, 10/4 18:16 피드백) */
export function NetworkRailCount() {
  const [names, setNames] = useState<string[] | null>(null)
  const [, rerender] = useState(0)
  useEffect(() => {
    const load = () => networkApi.suggestions().then((v) => setNames(v.suggestions.map((x) => x.name))).catch(() => setNames(null))
    const onSeen = () => rerender((t) => t + 1)
    void load()
    window.addEventListener(CHANGED, load)
    window.addEventListener(SEEN_EVENT, onSeen)
    return () => { window.removeEventListener(CHANGED, load); window.removeEventListener(SEEN_EVENT, onSeen) }
  }, [])
  if (!names) return null
  const hidden = readHidden()
  const seen = readList(SEEN_KEY)
  const n = names.filter((x) => !hidden.includes(x) && !seen.includes(x)).length
  if (!n) return null
  return <span className="rail-count" data-ui="새 추천 수" title={t(`새로 추천된 사람 ${n}명 — 노트 참고 문헌에 자주 나오는 사람`, `${n} newly suggested: people who appear often in your note references`)}>{n}</span>
}

/**
 * 등록 추천 (10/4 16:56 "논문들 중에서 자주 언급되는 사람은 등록을 추천"): 노트 참고 문헌에 두 편 넘게 나오는데 아직 없는 사람.
 * 10/4 19:08 "추가를 위한 선택 카드도 깔끔하게": 사람 카드보다 작은 카드에 이름·편 수·최근 논문·있는 곳.
 * 참고 문헌(bib)에는 저자 이름만 있어 소속·이메일은 알 수 없다. 더할 때는 bib에 다르게 적힌 이름만 "다른 이름"으로 넣는다.
 * ＋로 네트워킹에 더하고, ×로 이 추천에서만 뺀다 (이 컴퓨터에 기억).
 */
function Suggestions({ people, onSaved }: { people: PersonView[]; onSaved(m: string): void }) {
  const [list, setList] = useState<PersonSuggestion[] | null>(null)
  const [hidden, setHidden] = useState(readHidden)
  useEffect(() => { networkApi.suggestions().then((v) => setList(v.suggestions)).catch(() => setList([])) }, [people])
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

/** 이름으로 찾는 바깥 주소 (프로필의 "찾아보기") */
const arxivSearch = (name: string) => `https://arxiv.org/search/?searchtype=author&query=${encodeURIComponent(name)}`
const scholarSearch = (name: string) => `https://scholar.google.com/scholar?q=${encodeURIComponent(`author:"${name}"`)}`

function PersonPage({ id, onSaved }: { id: string; onSaved(m: string): void }) {
  const [people] = usePeople()
  const me = useMe(people)
  const [data, setData] = useState<{ person: PersonView; papers: PersonPaper[]; coauthors: Coauthor[]; appears: PersonAppearance[] } | null>(null)
  const [error, setError] = useState('')
  /** 프로필은 읽기로 보이고, 오른쪽 위 연필을 눌렀을 때만 고치는 칸이 열린다 (10/4 18:55·18:56) */
  const [editing, setEditing] = useState(false)
  useEffect(() => {
    setData(null); setError(''); setEditing(false)
    networkApi.person(id).then(setData).catch((e: Error) => setError(e.message))
  }, [id, people])
  if (error) return <p className="muted">{error}</p>
  if (!data || !people) return <p className="muted">{t('불러오는 중…', 'Loading…')}</p>
  const { person, papers, coauthors, appears } = data
  const isMe = me?.id === person.id

  const save = async (next: PersonView[], message: string) => {
    try { await networkApi.savePeople(addedOf(next)); announce(); onSaved(message); return true } catch (e) { onSaved((e as Error).message); return false }
  }
  const setTags = (tags: string[], message: string) => void save(withChange(people, person, { tags }), message)
  const remove = async () => {
    if (!await askConfirm({ title: t(`"${person.name}"을 네트워킹에서 뺄까요?`, `Remove "${person.name}" from Networking?`), hint: t('적어 둔 소속·분야·메모가 사라지고, 참고 문헌은 그대로입니다.', 'The affiliation, fields and memo you wrote are lost. References stay.'), ok: t('빼기', 'Remove') })) return
    void save(people.filter((p) => p.id !== person.id), t(`"${person.name}"을 뺐습니다`, `Removed "${person.name}"`)).then(() => go({ page: 'network' }))
  }
  const [main, ...more] = person.affiliations
  const emails = [person.email, ...person.emails].filter((m): m is string => !!m)

  return (
    <div data-ui="사람 페이지">
      {/* 10/4 18:55 "사람 프로필 다시": 큰 머리글자, 주소속·보조 소속, 이메일, 그 밖에 홈페이지·찾아보기·함께 쓴 사람 */}
      <section className="net-profile" data-ui="프로필">
        <div className="hover-actions net-profile-actions">
          <button className="icon-btn" data-ui="저자 정보 고치기" title={t('고치기 — 이름·소속·이메일·홈페이지·메모', 'Edit name, affiliation, email, homepage and memo')} aria-label={t('프로필 고치기', 'Edit profile')} onClick={() => setEditing(true)}>{Icon.pencil}</button>
          {person.added && !person.author && <button className="icon-btn" data-ui="사람 빼기" title={t('빼기 — 네트워킹에서 뺍니다', 'Remove from Networking')} aria-label={t('네트워킹에서 빼기', 'Remove from Networking')} onClick={() => void remove()}>{Icon.x}</button>}
        </div>
        <div className="net-profile-top">
          <PhotoPicker person={person} onSaved={onSaved} />
          <div className="net-profile-id">
            <h1 className="h-title">{person.name}{isMe && <span className="tag">{t('나', 'Me')}</span>}{person.author && <span className="tag" title={t('노트를 내보낼 때 저자로 고를 수 있습니다', 'Can be chosen as an author when exporting notes')}>{t('노트 저자', 'Note author')}</span>}</h1>
          </div>
        </div>
        {editing && <PersonEditDialog person={person} people={people} onDone={(nextId) => { setEditing(false); if (nextId && nextId !== person.id) go({ page: 'network', person: nextId }) }} onSaved={onSaved} />}
        <dl className="net-facts">
          {/* 10/4 20:52 "소속도 아래로 내리고 이메일 위에": 이름 아래는 비우고 소속·이메일을 같은 줄 모양으로 */}
          <dt>{t('소속', 'Affiliation')}</dt>
          <dd>
            {main ? <span className="net-aff">{main}</span> : <span className="muted">{t('모릅니다. 연필을 눌러 적습니다.', 'Unknown. Click the pencil to add it.')}</span>}
            {more.map((a) => <span key={a} className="muted net-aff2">{a}</span>)}
          </dd>
          {/* 10/4 20:53 "이메일 여러 개": 첫 이메일이 노트를 내보낼 때 \email 줄에 들어간다 */}
          <dt>{t('이메일', 'Email')}</dt>
          <dd className="net-inline">
            {emails.length
              ? emails.map((m, i) => <a key={m} className="a" href={`mailto:${m}`} title={i === 0 && person.author ? t('노트를 내보낼 때 쓰는 이메일', 'Email used when exporting notes') : undefined}>{m}</a>)
              : <span className="muted">{t('없음', 'None')}</span>}
          </dd>
          {person.homepage && <><dt>{t('홈페이지', 'Homepage')}</dt><dd><a className="a" href={person.homepage} target="_blank" rel="noreferrer">{person.homepage.replace(/^https?:\/\//, '').replace(/\/$/, '')}</a></dd></>}
          <dt>{t('주 연구 분야', 'Main research field')}</dt><dd><FieldTags tags={person.tags} people={people} onChange={setTags} /></dd>
          {person.note && <><dt>{t('메모', 'Memo')}</dt><dd>{person.note}</dd></>}
          {person.aliases.length > 0 && <><dt>{t('다른 이름', 'Other names')}</dt><dd>{person.aliases.join(', ')}</dd></>}
          <dt>{t('찾아보기', 'Look up')}</dt>
          <dd className="net-inline">
            <a className="a" href={arxivSearch(person.name)} target="_blank" rel="noreferrer">arXiv</a>
            <a className="a" href={scholarSearch(person.name)} target="_blank" rel="noreferrer">Google Scholar</a>
          </dd>
        </dl>
        {isMe && <NoteAuthors person={person} people={people} onSaved={onSaved} />}
      </section>
      <NewPapersSection person={person} onSaved={onSaved} />
      {/* 10/4 20:49 "다른 저자와 관계를 나타내는 섹션": 함께 쓴 사람을 같은 사람 카드로 (노트 저자는 내 프로필 카드 안) */}
      <Relations people={people} coauthors={coauthors} />
      <section data-ui="그 사람의 논문">
        <div className="sec-head"><h2>{t('노트 참고 문헌에 있는 논문', 'Papers in note references')}</h2><span className="count">{papers.length}</span></div>
        {papers.length === 0
          ? <p className="muted">{t('아직 없습니다. 노트가 인용하는 references.bib나 프로젝트 bib에 이 사람이 저자인 논문이 들어오면 여기에 보입니다.', 'None yet. Papers by this person show here once they are in references.bib or a project bib that your notes cite.')}</p>
          : (
            <ol className="net-papers">
              {papers.map((e) => {
                const url = e.eprint ? `https://arxiv.org/abs/${e.eprint}` : e.doi ? `https://doi.org/${e.doi}` : undefined
                return (
                  <li key={e.key} data-ui="논문 줄" data-ui-item={e.key}>
                    {url ? <a className="a net-title" href={url} target="_blank" rel="noreferrer" title={t('논문 페이지 열기', 'Open paper page')}>{e.title ?? e.key}</a> : <span className="net-title">{e.title ?? e.key}</span>}
                    <div className="muted net-meta">
                      {[e.author?.replace(/\s+and\s+/g, ', '), [e.journal, e.year].filter(Boolean).join(' '), e.eprint && `arXiv:${e.eprint}`].filter(Boolean).join(' · ')}
                    </div>
                    <div className="net-where">
                      {e.where.map((w, i) => w.rid
                        ? <button key={i} className="a" onClick={() => go({ page: 'overview', rid: w.rid! })}>{w.title}</button>
                        : <span key={i} className="muted">{w.title}</span>)}
                    </div>
                  </li>
                )
              })}
            </ol>
          )}
      </section>
      <Appears appears={appears} />
    </div>
  )
}

/** 사진 (10/19 사람 페이지): 큰 동그라미를 누르면 사진을 고른다. 화면에서 256px 정사각형 JPEG로 줄여 보낸다 */
function PhotoPicker({ person, onSaved }: { person: PersonView; onSaved(m: string): void }) {
  const pick = async (file: File | undefined) => {
    if (!file) return
    try {
      const bitmap = await createImageBitmap(file)
      const side = Math.min(bitmap.width, bitmap.height)
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = 256
      canvas.getContext('2d')!.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 256, 256)
      await networkApi.savePhoto(person.id, canvas.toDataURL('image/jpeg', 0.85))
      announce()
      onSaved(t('사진을 바꿨습니다', 'Photo changed'))
    } catch (e) { onSaved(t(`사진을 넣지 못했습니다 — ${(e as Error).message}`, `Couldn't set the photo: ${(e as Error).message}`)) }
  }
  return (
    <label className="net-photo" data-ui="사진 바꾸기" title={t('사진 바꾸기 — 이 맥의 사진 파일을 고릅니다', 'Change photo: pick an image file on this Mac')}>
      <Avatar name={person.name} xl person={person} />
      <span className="net-photo-cam">{t('사진 바꾸기', 'Change photo')}</span>
      <input type="file" accept="image/*" hidden onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = '' }} />
    </label>
  )
}

const shortWhen = (ms: number) => { const d = new Date(ms); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }

/**
 * 새 논문 (10/19 사람 페이지): Semantic Scholar 저자 ID가 있으면 그 ID로, 없으면 arXiv 이름 검색으로 최근 90일 논문을 하루에 한 번 찾는다.
 * 처음 보는 논문엔 파란 점. 페이지를 열면 본 것으로 적는다(점은 이번에는 그대로 보인다). 같은 이름의 다른 사람 논문은 "이 사람 아님"으로 숨긴다.
 */
/** 이번에 처음 본 새 논문: 본 것으로 적은 뒤에도(사람 목록이 다시 읽혀 페이지가 새로 그려져도) 앱을 다시 열기 전까지는 점을 둔다 */
const freshThisTime = new Map<string, Set<string>>()

function NewPapersSection({ person, onSaved }: { person: PersonView; onSaved(m: string): void }) {
  const [d, setD] = useState<NewPapers | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    setD(null); setError('')
    networkApi.newPapers(person.id).then((v) => {
      if (!alive) return
      const kept = freshThisTime.get(person.id) ?? new Set<string>()
      for (const p of v.papers) if (p.fresh) kept.add(p.id)
      freshThisTime.set(person.id, kept)
      setD({ ...v, papers: v.papers.map((p) => ({ ...p, fresh: kept.has(p.id) })) })
      if (v.papers.some((p) => p.fresh)) void networkApi.seenPapers(person.id).then(announce).catch(() => undefined)
    }).catch((e: Error) => { if (alive) setError(e.message) })
    return () => { alive = false }
  }, [person.id, person.s2, person.name])
  const add = async (p: NewPaper) => {
    setBusy(p.id)
    try {
      await papersApi.add(p.arxiv ?? p.doi ?? p.url)
      setD((cur) => cur && { ...cur, papers: cur.papers.map((x) => (x.id === p.id ? { ...x, inLibrary: true } : x)) })
      onSaved(t('논문 라이브러리에 더했습니다', 'Added to the paper library'))
    } catch (e) { onSaved((e as Error).message) } finally { setBusy(null) }
  }
  const hide = async (p: NewPaper) => {
    setBusy(p.id)
    try {
      await networkApi.hidePaper(person.id, p.id); announce()
      setD((cur) => cur && { ...cur, papers: cur.papers.filter((x) => x.id !== p.id), hidden: cur.hidden + 1 })
    } catch (e) { onSaved((e as Error).message) } finally { setBusy(null) }
  }
  const how = d?.source === 's2' ? t('Semantic Scholar 저자 ID로', 'By Semantic Scholar author ID') : t('arXiv 이름 검색으로', 'By arXiv name search')
  return (
    <section data-ui="새 논문">
      <div className="sec-head">
        <h2>{t('새 논문', 'New papers')}</h2>
        {d && <span className="count">{[how, t('최근 90일 · 하루 한 번', 'last 90 days · once a day'), d.checkedAt ? shortWhen(d.checkedAt) : null].filter(Boolean).join(' · ')}</span>}
      </div>
      {error ? <p className="muted">{error}</p> : !d ? <p className="muted">{t('찾는 중…', 'Searching…')}</p> : <>
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
                    : (p.arxiv || p.doi) && <button className="a" disabled={busy === p.id} onClick={() => void add(p)}>{t('논문 라이브러리에 더하기', 'Add to paper library')}</button>}
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

/** 나오는 곳 (10/19 사람 페이지): 프로젝트마다 그 프로젝트 bib의 이 사람 논문 수와 이름이 들어간 기록 */
function Appears({ appears }: { appears: PersonAppearance[] }) {
  if (!appears.length) return null
  return (
    <section className="net-appears" data-ui="나오는 곳">
      <div className="sec-head"><h2>{t('나오는 곳', 'Appears in')}</h2></div>
      {appears.map((a) => (
        <div key={a.rid} className="net-appear">
          <button className="a net-title" onClick={() => go({ page: 'overview', rid: a.rid })}>{a.title}</button>
          {a.papers > 0 && <span className="muted net-meta">{t(`프로젝트 참고 문헌에 이 사람 논문 ${a.papers}편`, `${plural(a.papers, 'paper')} by this person in project references`)}</span>}
          {a.records.map((r) => <button key={`${r.target}/${r.id}`} className="a net-appear-rec" data-ui="이름이 나온 기록" title={t('기록 탭에서 보기', 'See it in the Records tab')} onClick={() => go({ page: 'records', rid: a.rid })}>{`${r.kind} · ${r.text}`}</button>)}
        </div>
      ))}
    </section>
  )
}

/**
 * 함께하는 사람 (10/4 20:49): 내 페이지에는 노트 저자(노트를 내보낼 때 고를 수 있는 사람, 19:08 "내 페이지에서 관리"), 모든 사람 페이지에 함께 쓴 사람.
 * 첫 화면과 같은 사람 카드를 쓴다 (20:53). 노트 저자는 ×로 빼고 ＋로 더한다. 이름·소속·이메일은 그 사람 페이지의 연필에서 고친다.
 */
function NoteAuthors({ person, people, onSaved }: { person: PersonView; people: PersonView[]; onSaved(m: string): void }) {
  const [authors, setAuthors] = useState<Author[] | null>(null)
  useEffect(() => { latexApi.get().then((v) => setAuthors(v.authors)).catch(() => setAuthors([])) }, [people])
  const byId = new Map(people.map((p) => [p.id, p]))
  const viewOf = (a: Author): PersonView => byId.get(personId(a.name)) ?? {
    id: personId(a.name), name: a.name, aliases: [], author: true, affiliations: a.affiliations, orgs: [], tags: [], emails: [], added: false, star: false,
  }
  const saveAuthors = async (next: Author[], message: string) => {
    try { const v = await latexApi.saveAuthors(next); setAuthors(v.authors); announce(); onSaved(message) } catch (e) { onSaved(t(`저장하지 못했습니다 — ${(e as Error).message}`, `Couldn't save: ${(e as Error).message}`)) }
  }
  const add = async () => {
    const name = (await askText({ title: t('노트 저자 더하기', 'Add note author'), label: t('이름', 'Name'), hint: t('네트워킹에 있는 사람이면 그 이름을 그대로 적습니다. 소속·이메일은 그 사람 페이지에서 적습니다.', 'For someone in Networking, type their name exactly. Add affiliation and email on their person page.'), ok: t('더하기', 'Add') }))?.replace(/\s+/g, ' ').trim()
    if (!name || !authors) return
    if (authors.some((a) => personId(a.name) === personId(name))) { onSaved(t(`"${name}"은 이미 노트 저자입니다`, `"${name}" is already a note author`)); return }
    const known = byId.get(personId(name))
    await saveAuthors([...authors, { name: known?.name ?? name, ...(known?.email && { email: known.email }), affiliations: known?.affiliations ?? [] }], t(`"${name}"을 노트 저자에 더했습니다`, `Added "${name}" to note authors`))
  }
  // 10/4 20:51 반려 "내 카드 아래가 아니라 내 프로필 카드 안에": 프로필 카드 맨 아래 칸
  return (
        <div className="net-profile-authors" data-ui="저자와 소속">
          <div className="net-sub-head">
            <b>{t('노트 저자', 'Note authors')}</b><span className="muted">{t('노트를 내보낼 때 고를 수 있는 사람', 'People you can choose when exporting notes')}</span><span className="sp" />
            <button className="btn" data-ui="저자 더하기" disabled={!authors} onClick={() => void add()}>{t('＋ 저자 더하기', '＋ Add author')}</button>
          </div>
          {!authors ? <p className="muted">{t('불러오는 중…', 'Loading…')}</p> : (
            <div className="net-cards">
              {authors.map((a) => {
                const p = viewOf(a)
                return <PersonCard key={p.id} p={p} people={people} isMe={p.id === person.id} badge={a.corresponding ? t('교신', 'Corresponding') : undefined}
                  onRemove={p.id === person.id ? undefined : () => void saveAuthors(authors.filter((x) => x !== a), t(`"${a.name}"을 노트 저자에서 뺐습니다`, `Removed "${a.name}" from note authors`))} />
              })}
            </div>
          )}
        </div>
  )
}

/** 함께 쓴 사람 (10/4 20:49): 노트 참고 문헌에서 함께 저자인 사람을 사람 카드로 */
function Relations({ people, coauthors }: { people: PersonView[]; coauthors: Coauthor[] }) {
  const byId = new Map(people.map((p) => [p.id, p]))
  const others = coauthors.map((c) => byId.get(c.id)).filter((p): p is PersonView => !!p)
  if (!others.length) return null
  return (
    <section className="net-author-sec" data-ui="함께하는 사람">
      {others.length > 0 && (
        <div className="net-group" data-ui="함께 쓴 사람">
          <div className="sec-head"><h2>{t('함께 쓴 사람', 'Coauthors')}</h2><span className="count">{t('노트 참고 문헌에서 함께 저자인 논문 수', 'Shared papers in note references')}</span></div>
          <div className="net-cards">
            {coauthors.map((c) => { const p = byId.get(c.id); return p && <PersonCard key={c.id} p={p} people={people} sub={t(`함께 쓴 논문 ${c.count}편`, plural(c.count, 'shared paper'))} /> })}
          </div>
        </div>
      )}
    </section>
  )
}

/**
 * 사람 고치기 창 (10/5 22:36 "주제 카드 고치기처럼", 10/18 시안 5절): 주제 · 프로젝트 고치기와 같은 창(CardEditDialog).
 * 왼쪽 위 이름 · 소속(줄마다 한 칸, 다른 사람 · 원고 저자의 소속을 제안), 아래 이메일 · 홈페이지 · 다른 이름 · 메모. 오른쪽은 사람 카드 미리보기와 교신 저자(노트 저자만).
 * 노트 저자면 이름·이메일·소속·교신 저자는 저자와 소속(내보내기의 \author 줄)에, 홈페이지·메모·다른 이름은 네트워킹에 저장한다.
 */
function PersonEditDialog({ person, people, onDone, onSaved }: { person: PersonView; people: PersonView[]; onDone(nextId?: string): void; onSaved(m: string): void }) {
  const [d, setD] = useState({
    name: person.name, email: [person.email, ...person.emails].filter(Boolean).join('\n'), affiliations: person.affiliations.length ? person.affiliations : [''], homepage: person.homepage ?? '',
    note: person.note ?? '', aliases: person.aliases.join(', '), corresponding: false, s2: person.s2 ?? '', dropPhoto: false,
  })
  const [authors, setAuthors] = useState<Author[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  useEffect(() => {
    latexApi.get().then((v) => {
      setAuthors(v.authors)
      const a = v.authors.find((x) => personId(x.name) === person.id)
      if (a) setD((cur) => ({ ...cur, corresponding: !!a.corresponding }))
    }).catch((e: Error) => { setAuthors([]); setMessage(e.message) })
  }, [person.id])
  const authorsLoaded = !person.author || authors !== null
  const set = (patch: Partial<typeof d>) => setD((cur) => ({ ...cur, ...patch }))
  // 제안할 소속: 다른 사람과 원고 저자에게 적은 것
  const known = [...people.filter((p) => p.id !== person.id).flatMap((p) => p.affiliations), ...(authors ?? []).filter((a) => personId(a.name) !== person.id).flatMap((a) => a.affiliations ?? [])]
  const name = d.name.replace(/\s+/g, ' ').trim()
  const affiliations = d.affiliations.map((s) => s.trim()).filter(Boolean)

  const submit = async () => {
    if (!name) { setMessage(t('이름을 적어 주세요', 'Enter a name')); return }
    const homepage = d.homepage.trim()
    if (homepage && !/^https?:\/\//i.test(homepage)) { setMessage(t('홈페이지는 https://로 시작하는 주소로 적습니다', 'The homepage must start with https://')); return }
    const [email = '', ...emails] = [...new Set(d.email.split(/[\n,]/).map((m) => m.trim()).filter(Boolean))]
    setBusy(true)
    try {
      if (person.author) {
        const { authors: current } = await latexApi.get()
        await latexApi.saveAuthors(current.map((a) => (personId(a.name) === person.id
          ? { name, ...(email && { email }), ...(emails.length && { emails }), ...(d.corresponding && { corresponding: true }), affiliations }
          : a)))
      }
      const change: Partial<PersonView> = {
        name, homepage: homepage || undefined, note: d.note.trim() || undefined,
        aliases: d.aliases.split(',').map((s) => s.trim()).filter(Boolean), s2: d.s2 || undefined,
        ...(!person.author && { affiliations, email: email || undefined, emails }),
      }
      // 저자이면서 네트워킹에 따로 적을 것이 없으면 사람 목록은 그대로 둔다
      const needsEntry = person.added || !!change.homepage || !!change.note || !!change.aliases?.length || !!change.s2
      if (needsEntry) await networkApi.savePeople(addedOf(withChange(people, person, change)))
      if (d.dropPhoto && person.photo) await networkApi.removePhoto(person.id)
      announce()
      onSaved(t('프로필을 저장했습니다', 'Profile saved'))
      onDone(personId(name))
    } catch (e) { setMessage(t(`저장하지 못했습니다 — ${(e as Error).message}`, `Couldn't save: ${(e as Error).message}`)); setBusy(false) }
  }

  const sub = affiliations[0] || d.note.trim()
  return (
    <CardEditDialog title={t('사람 고치기', 'Edit person')} location={`${t('네트워킹', 'Networking')} › ${person.name}`} pc="var(--text-3)" ui="사람 고치기 창" className="person-dialog"
      canSave={!busy && authorsLoaded && !!name} onClose={() => { if (!busy) onDone() }} onSave={() => void submit()}
      preview={
        <span className="net-card pe-card" data-ui="사람 카드 미리보기">
          <Avatar name={name || '?'} person={d.dropPhoto ? undefined : person} />
          <span className="net-card-body">
            <span className="net-card-name"><span className="net-card-n">{name || t('이름 없음', 'No name')}</span></span>
            {sub && <span className="muted net-card-sub">{sub}</span>}
            {person.tags.length > 0 && <span className="net-card-tags"><span className="tag">{person.tags[0]}</span></span>}
          </span>
        </span>
      }
      look={person.author ? (
        <label className="check pe-corr" title={t('노트를 내보낼 때 이름 뒤에 \\thanks{corresponding author}가 붙습니다', 'Adds \\thanks{corresponding author} after the name when exporting notes')}>
          <input type="checkbox" checked={d.corresponding} disabled={busy || !authorsLoaded} onChange={(e) => set({ corresponding: e.target.checked })} />{t('교신 저자', 'Corresponding author')}
        </label>
      ) : undefined}
      lower={
        <fieldset className="td-fields" disabled={busy}>
          {/* 10/4 20:53 "이메일 여러 개" */}
          <label className="td-f">
            <span className="td-lab"><span>{t('이메일', 'Email')}</span><span className="td-n">{t('한 줄에 하나', 'One per line')}</span></span>
            <textarea className="td-in td-ta pe-ta" rows={Math.max(1, d.email.split('\n').length)} value={d.email} onChange={(e) => set({ email: e.target.value })} />
            {person.author && <span className="td-help">{t('첫 줄이 노트 내보내기의 \\email로 들어갑니다', 'The first line becomes \\email in note exports')}</span>}
          </label>
          <label className="td-f"><span className="td-lab"><span>{t('홈페이지', 'Homepage')}</span></span><input className="td-in" value={d.homepage} placeholder="https://" onChange={(e) => set({ homepage: e.target.value })} /></label>
          <label className="td-f">
            <span className="td-lab"><span>{t('참고 문헌에 다르게 적힌 이름', 'Other spellings in references')}</span><span className="td-n">{t('쉼표로 나눔', 'Comma separated')}</span></span>
            <input className="td-in" value={d.aliases} placeholder={t('예: A. E. Example, Ada Example', 'e.g. A. E. Example, Ada Example')} onChange={(e) => set({ aliases: e.target.value })} />
          </label>
          <label className="td-f"><span className="td-lab"><span>{t('한 줄 메모', 'One-line memo')}</span></span><input className="td-in" value={d.note} onChange={(e) => set({ note: e.target.value })} /></label>
          <S2Pick name={name} value={d.s2} onChange={(s2) => set({ s2 })} />
          {person.photo && <div className="td-f"><span className="td-lab"><span>{t('사진', 'Photo')}</span></span>
            <label className="check"><input type="checkbox" checked={d.dropPhoto} onChange={(e) => set({ dropPhoto: e.target.checked })} />{t('사진 빼기 (머리글자로)', 'Remove photo (show initials)')}</label></div>}
          {person.author && <p className="td-help">{t('노트를 내보낼 때 이름·이메일·소속이 \\author·\\email·\\affiliation 줄로 들어갑니다.', 'When exporting notes, name, email and affiliation become \\author, \\email and \\affiliation lines.')}</p>}
          {message && <p className="td-err">{message}</p>}
        </fieldset>
      }>
      <fieldset className="td-fields" disabled={busy}>
        <label className="td-f"><span className="td-lab"><span>{t('이름', 'Name')}</span></span><input className="td-in" value={d.name} data-ui="사람 이름" onChange={(e) => set({ name: e.target.value })} /></label>
        <AffiliationFields value={d.affiliations} known={known} disabled={busy} onChange={(affiliations) => set({ affiliations })} />
      </fieldset>
    </CardEditDialog>
  )
}

/**
 * Semantic Scholar 저자 (10/19 사람 페이지): 이름으로 찾아 하나를 고르면 새 논문을 그 저자 ID로 찾는다(동명이인이 섞이지 않음).
 * 비워 두면 arXiv 이름 검색. 고른 ID는 사람 목록(config.yaml people:)의 s2에 둔다
 */
function S2Pick({ name, value, onChange }: { name: string; value: string; onChange(s2: string): void }) {
  const [q, setQ] = useState(name)
  const [found, setFound] = useState<S2Author[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const search = async () => {
    if (!q.trim()) return
    setBusy(true); setError('')
    try { setFound((await networkApi.s2Search(q.trim())).authors) } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  return (
    <div className="td-f" data-ui="Semantic Scholar 저자">
      <span className="td-lab"><span>{t('Semantic Scholar 저자', 'Semantic Scholar author')}</span><span className="td-n">{value ? `ID ${value}` : t('비우면 arXiv 이름 검색', 'Empty: arXiv name search')}</span></span>
      <div className="s2-row">
        <input className="td-in" value={q} aria-label={t('찾을 이름', 'Name to search')} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void search() } }} />
        <button type="button" className="btn" disabled={busy || !q.trim()} onClick={() => void search()}>{busy ? t('찾는 중…', 'Searching…') : t('찾기', 'Search')}</button>
        {value && <button type="button" className="btn" onClick={() => onChange('')}>{t('비우기', 'Clear')}</button>}
      </div>
      {error && <span className="td-err">{error}</span>}
      {found && (found.length === 0 ? <span className="td-help">{t('찾은 저자가 없습니다', 'No author found')}</span> : (
        <div className="s2-list" role="radiogroup" aria-label={t('Semantic Scholar 저자', 'Semantic Scholar author')}>
          {found.map((a) => (
            <label key={a.id} className={`s2-cand${value === a.id ? ' on' : ''}`}>
              <input type="radio" name="s2" checked={value === a.id} onChange={() => onChange(a.id)} />
              <span><b>{a.name}</b>{[a.affiliations[0], t(`논문 ${a.paperCount}`, plural(a.paperCount, 'paper')), a.sample && `"${a.sample}"`].filter(Boolean).map((x) => <span key={x} className="muted"> · {x}</span>)}</span>
            </label>
          ))}
        </div>
      ))}
    </div>
  )
}

/** 사람의 주 연구 분야: 다른 사람에게 자주 붙인 분야를 먼저 제안한다 */
function FieldTags({ tags, people, onChange }: { tags: string[]; people: PersonView[]; onChange(tags: string[], message: string): void }) {
  const used = new Map<string, number>()
  for (const p of people) for (const t of p.tags) used.set(t.toLowerCase(), (used.get(t.toLowerCase()) ?? 0) + 1)
  return <FieldPicker tags={tags} used={used} onChange={onChange} />
}
