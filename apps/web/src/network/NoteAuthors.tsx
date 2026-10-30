import { personId, type Author } from '@rw/core'
import { latexApi, type PersonView } from '../api'
import { askText } from '../askText'
import { t } from '../i18n'
import { qk, queryClient } from '../queries'
import { PersonCard } from './PersonCard'
import { announce, useLatexSetup } from './people'

/**
 * 함께하는 사람 (10/4 20:49): 내 페이지에는 노트 저자(노트를 내보낼 때 고를 수 있는 사람, 19:08 "내 페이지에서 관리"), 모든 사람 페이지에 함께 쓴 사람.
 * 첫 화면과 같은 사람 카드를 쓴다 (20:53). 노트 저자는 ×로 빼고 ＋로 더한다. 이름·소속·이메일은 그 사람 페이지의 연필에서 고친다.
 */
export function NoteAuthors({ person, people, onSaved }: { person: PersonView; people: PersonView[]; onSaved(m: string): void }) {
  const latex = useLatexSetup()
  const authors: Author[] | null = latex.data?.authors ?? (latex.isError ? [] : null)
  const byId = new Map(people.map((p) => [p.id, p]))
  const viewOf = (a: Author): PersonView => byId.get(personId(a.name)) ?? {
    id: personId(a.name), name: a.name, aliases: [], author: true, affiliations: a.affiliations, orgs: [], tags: [], emails: [], added: false, star: false,
  }
  const saveAuthors = async (next: Author[], message: string) => {
    try { const v = await latexApi.saveAuthors(next); queryClient.setQueryData(qk.latexSetup, v); announce(); onSaved(message) } catch (e) { onSaved(t(`저장하지 못했습니다 — ${(e as Error).message}`, `Couldn't save: ${(e as Error).message}`)) }
  }
  const add = async () => {
    const name = (await askText({ title: t('노트 저자 추가', 'Add note author'), label: t('이름', 'Name'), hint: t('네트워킹에 있는 사람이면 그 이름을 그대로 적습니다. 소속·이메일은 그 사람 페이지에서 적습니다.', 'For someone in Networking, type their name exactly. Add affiliation and email on their person page.'), ok: t('추가', 'Add') }))?.replace(/\s+/g, ' ').trim()
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
            <button className="btn" data-ui="저자 더하기" disabled={!authors} onClick={() => void add()}>{t('＋ 저자 추가', '＋ Add author')}</button>
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
