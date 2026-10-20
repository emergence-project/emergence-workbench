import { networkApi, type PersonView } from '../api'
import { askText } from '../askText'
import { go } from '../router'
import { plural, t } from '../i18n'
import { StarIcon } from '../marks'
import { addedOf, announce, Avatar, byStarThenName, subOf, useMe, usePeople } from './people'

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

/** 네트워킹 사이드바: 나, 모든 사람, 사람 줄(즐겨찾기 → 가나다순), 사람 더하기 */
export function NetworkSide({ person, onSaved }: { person?: string; onSaved(m: string): void }) {
  const { data: people } = usePeople()
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
