import { useQuery } from '@tanstack/react-query'
import { googleApi, latexApi, networkApi, type PersonView } from '../api'
import { qk, queryClient } from '../queries'
import { t } from '../i18n'

/**
 * 네트워킹 화면이 함께 쓰는 자료와 작은 도우미.
 * 사람 목록은 설정 폴더(config.yaml people:)에 있어 파일 알림이 오지 않는다. 그래서 화면을 열 때마다 다시 받고(refetchOnMount),
 * 이 화면에서 저장하면 announce로 네트워킹 키 전체를 다시 받는다.
 */
export const FRESH = { refetchOnMount: 'always' } as const

/** 사람 목록을 바꾼 뒤: 사이드바 · 본문 · 추천 · 사람 페이지 · 노트 저자가 함께 다시 읽는다 */
export function announce() {
  void queryClient.invalidateQueries({ queryKey: qk.network })
  void queryClient.invalidateQueries({ queryKey: qk.latexSetup })
}

export function usePeople() {
  return useQuery({ queryKey: qk.people, queryFn: () => networkApi.list().then((v) => v.people), ...FRESH })
}

/** 원고 저자 (노트 저자 · 사람 고치기 창). 받지 못하면 빈 목록으로 */
export function useLatexSetup() {
  return useQuery({ queryKey: qk.latexSetup, queryFn: () => latexApi.get(), ...FRESH })
}

/** 이 사람 목록에서 "더한 사람"만 저장할 모양으로. 저자의 소속·이메일은 저자와 소속에 있으므로 여기 넣지 않는다 */
export const addedOf = (people: PersonView[]) => people.filter((p) => p.added)
  .map((p) => ({
    name: p.name, ...(p.aliases.length && { aliases: p.aliases }), ...(p.note && { note: p.note }), ...(p.tags.length && { tags: p.tags }), ...(p.star && { star: true }),
    ...(!p.author && p.affiliations.length && { affiliations: p.affiliations }), ...(!p.author && p.email && { email: p.email }), ...(!p.author && p.emails.length && { emails: p.emails }), ...(p.homepage && { homepage: p.homepage }), ...(p.s2 && { s2: p.s2 }),
  }))

/** 이 사람 줄을 더한 사람 목록에 넣어 고친다 (저자도 이름표·다른 이름은 여기에 저장한다) */
export const withChange = (people: PersonView[], person: PersonView, change: Partial<PersonView>) =>
  people.some((p) => p.id === person.id && p.added)
    ? people.map((p) => (p.id === person.id ? { ...p, ...change } : p))
    : [...people, { ...person, ...change, added: true }]

/**
 * 앱 사용자 본인 (10/4 14:46 피드백 "사용자니깐 상단에 둬 주고"): 구글 계정 이메일과 같은 저자, 없으면 저자와 소속의 첫 사람.
 */
export function useMe(people: PersonView[] | undefined): PersonView | undefined {
  const { data: email } = useQuery({ queryKey: qk.googleStatus, queryFn: () => googleApi.status().then((s) => s.email ?? null), ...FRESH })
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

/** 사람 줄 순서 (10/4 16:19): 즐겨찾기 먼저, 그다음 이름 가나다순 */
export const byStarThenName = (a: { star: boolean; name: string }, b: { star: boolean; name: string }) =>
  Number(b.star) - Number(a.star) || a.name.localeCompare(b.name, 'ko')

/** 카드 둘째 줄: 소속(기관)과 주 연구 분야 (10/4 16:20 "저자 대신 소속이랑 주 연구 분야") */
export const subOf = (p: PersonView) => p.orgs[0] || p.note || (p.tags.length ? '' : t('소속·분야를 사람 페이지에서 적습니다', 'Add affiliation and field on the person page'))
