import { personId, type Author } from '@rw/core'
import { useEffect, useState } from 'react'
import { AffiliationFields } from '../AffiliationFields'
import { latexApi, networkApi, type PersonView, type S2Author } from '../api'
import { CardEditDialog } from '../CardEditDialog'
import { plural, t } from '../i18n'
import { qk, queryClient } from '../queries'
import { addedOf, announce, Avatar, useLatexSetup, withChange } from './people'

/**
 * 사람 고치기 창 (10/5 22:36 "주제 카드 고치기처럼", 10/18 시안 5절): 주제 · 프로젝트 고치기와 같은 창(CardEditDialog).
 * 왼쪽 위 이름 · 소속(줄마다 한 칸, 다른 사람 · 원고 저자의 소속을 제안), 아래 이메일 · 홈페이지 · 다른 이름 · 메모. 오른쪽은 사람 카드 미리보기와 교신 저자(노트 저자만).
 * 노트 저자면 이름·이메일·소속·교신 저자는 저자와 소속(내보내기의 \author 줄)에, 홈페이지·메모·다른 이름은 네트워킹에 저장한다.
 */
export function PersonEditDialog({ person, people, onDone, onSaved, location }: { person: PersonView; people: PersonView[]; onDone(nextId?: string): void; onSaved(m: string): void; /** 머리의 위치 (기본: 네트워킹 › 이름) */ location?: string }) {
  const [d, setD] = useState({
    name: person.name, email: [person.email, ...person.emails].filter(Boolean).join('\n'), affiliations: person.affiliations.length ? person.affiliations : [''], homepage: person.homepage ?? '',
    note: person.note ?? '', aliases: person.aliases.join(', '), corresponding: false, s2: person.s2 ?? '', dropPhoto: false,
  })
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  // 원고 저자는 창을 열 때 새로 받고(받는 동안 교신 저자 칸은 잠근다), 받으면 교신 저자를 한 번 채운다
  const latex = useLatexSetup()
  const authors: Author[] | null = latex.data?.authors ?? (latex.isError ? [] : null)
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    if (loaded) return
    if (latex.isError) { setLoaded(true); setMessage(latex.error.message); return }
    if (!latex.data || latex.isFetching) return
    setLoaded(true)
    const a = latex.data.authors.find((x) => personId(x.name) === person.id)
    if (a) setD((cur) => ({ ...cur, corresponding: !!a.corresponding }))
  }, [loaded, latex.data, latex.isFetching, latex.isError, latex.error, person.id])
  const authorsLoaded = !person.author || loaded
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
        // 저장 직전에 지금 저자 목록을 새로 읽어 그 위에 고친다
        const { authors: current } = await queryClient.fetchQuery({ queryKey: qk.latexSetup, queryFn: () => latexApi.get(), staleTime: 0 })
        const mine = { name, ...(email && { email }), ...(emails.length && { emails }), ...(d.corresponding && { corresponding: true }), affiliations }
        // 저자가 아직 없으면(처음 받은 사람의 시작 준비, id 빈 값) 첫 저자로 더한다
        await latexApi.saveAuthors(current.some((a) => personId(a.name) === person.id) ? current.map((a) => (personId(a.name) === person.id ? mine : a)) : [mine, ...current])
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
    <CardEditDialog title={t('사람 수정', 'Edit person')} location={location ?? `${t('네트워킹', 'Networking')} › ${person.name}`} pc="var(--text-3)" ui="사람 고치기 창" className="person-dialog"
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
            <label className="check"><input type="checkbox" checked={d.dropPhoto} onChange={(e) => set({ dropPhoto: e.target.checked })} />{t('사진 제거 (머리글자로)', 'Remove photo (show initials)')}</label></div>}
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
