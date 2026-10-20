import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { networkApi, type Coauthor, type PersonAppearance, type PersonView } from '../api'
import { askConfirm } from '../askText'
import { FieldTags as FieldPicker } from '../FieldTags'
import { Icon } from '../icons'
import { go } from '../router'
import { plural, t } from '../i18n'
import { qk } from '../queries'
import { NewPapersSection } from './NewPapers'
import { NoteAuthors } from './NoteAuthors'
import { PersonCard } from './PersonCard'
import { PersonEditDialog } from './PersonEditDialog'
import { addedOf, announce, Avatar, FRESH, useMe, usePeople, withChange } from './people'

/** 이름으로 찾는 바깥 주소 (프로필의 "찾아보기") */
const arxivSearch = (name: string) => `https://arxiv.org/search/?searchtype=author&query=${encodeURIComponent(name)}`
const scholarSearch = (name: string) => `https://scholar.google.com/scholar?q=${encodeURIComponent(`author:"${name}"`)}`

/** 사람 페이지. 사람이 바뀌면 새로 그린다(고치기 창이 닫힌다): NetworkPage가 key로 준다 */
export function PersonPage({ id, onSaved }: { id: string; onSaved(m: string): void }) {
  const { data: people } = usePeople()
  const me = useMe(people)
  const { data, error } = useQuery({ queryKey: qk.person(id), queryFn: () => networkApi.person(id), ...FRESH })
  /** 프로필은 읽기로 보이고, 오른쪽 위 연필을 눌렀을 때만 고치는 칸이 열린다 (10/4 18:55·18:56) */
  const [editing, setEditing] = useState(false)
  if (error) return <p className="muted">{error.message}</p>
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

/** 사람의 주 연구 분야: 다른 사람에게 자주 붙인 분야를 먼저 제안한다 */
function FieldTags({ tags, people, onChange }: { tags: string[]; people: PersonView[]; onChange(tags: string[], message: string): void }) {
  const used = new Map<string, number>()
  for (const p of people) for (const t of p.tags) used.set(t.toLowerCase(), (used.get(t.toLowerCase()) ?? 0) + 1)
  return <FieldPicker tags={tags} used={used} onChange={onChange} />
}
