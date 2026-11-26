import { SubjectPicker, useSubjects } from './SubjectPicker'
import { useEffect, useState, type ReactNode } from 'react'
import { api, conceptsApi, type ConceptMd, type ConceptRow, type ConceptSources, type ConceptUse, type LibraryInfo } from './api'
import { Icon } from './icons'
import { go } from './router'
import { setRightSlot } from './noteScreen'
import { plural, t } from './i18n'

/**
 * 문서 정보 (10/4 18:09 "미완성 태그와 문서 정보 등은 우측 사이드바로 모으자"):
 * 사용자 확인(확인 전·확인함), 상태(미완성·잠김), 미완성인 까닭, 분류, 다른 이름, 파일.
 */
export type ReviewChoice = 'none' | 'todo' | 'ok'
export interface DocState { onSubjects(ids: string[]): Promise<void>; note: ConceptMd; busy: boolean; onReview(c: ReviewChoice): void; onLock(on: boolean): void }
const REVIEW: { v: ReviewChoice; label: ReactNode; title: string }[] = [
  { v: 'none', label: <><i className="mark-ico" aria-hidden>{Icon.unchecked}</i> {t('확인 전', 'Not reviewed')}</>, title: t('확인 표시를 뺍니다', 'Removes the review mark') },
  { v: 'ok', label: <><i className="mark-ico" aria-hidden>{Icon.check}</i> {t('확인함', 'Reviewed')}</>, title: t('내용을 읽고 맞다고 확인했을 때. 본문이 바뀌면 "확인 뒤 고침"으로 바뀝니다', 'When you have read and confirmed the content. If the text changes, it becomes "Edited after review"') },
]
export function ConceptDocInfo({ id, doc, compact }: { id: string; doc: DocState; compact?: boolean }) {
  const { note, busy, onReview } = doc
  const { tree, error } = useSubjects(id, note.hash)
  const m = note.meta
  // Existing none/todo/changed values share one on-screen confirmation state.
  const cur: ReviewChoice = note.checked === 'ok' ? 'ok' : 'none'
  const states = [
    note.unfinished.length > 0 && <span key="un" className="cn-state" title={t('빈 절, TODO 표시, 제목·틀뿐인 노트를 앱이 찾아 붙입니다', 'The app adds this for empty sections, TODO marks, and notes with only a title or outline')}>{t('미완성', 'Unfinished')}</span>,
  ].filter(Boolean)
  return (
    <section className={`cn-info${compact ? ' compact' : ''}`} data-ui="문서 정보">
      {!compact && <h2 className="cn-links-h">{t('문서 정보', 'Document info')}</h2>}
      <div className="cn-review" data-ui="사용자 확인">
        <div className="segmented small" role="radiogroup" aria-label={t('사용자 확인', 'Your review')}>
          {REVIEW.map((r) => <button key={r.v} className={cur === r.v ? 'on' : ''} role="radio" aria-checked={cur === r.v} disabled={busy} title={r.title} onClick={() => { if (cur !== r.v) onReview(r.v) }}>{r.label}</button>)}
        </div>
        {note.checked === 'ok' && m.checked?.at && <span className="muted">{m.checked.at}</span>}
        {note.checked === 'changed' && <span className="muted" title={t(`${m.checked?.at ?? ''}에 확인했습니다`, `Reviewed at ${m.checked?.at ?? ''}`)}>{t('확인 뒤 고침 · 다시 확인하려면 ✓ 확인함', 'Edited after review · Click ✓ Reviewed to review again')}</span>}
      </div>
      <label className="check" data-ui="고치기 잠금" title={t('잠그면 앱과 에이전트가 이 노트를 고치지 않습니다. 잠긴 노트도 연필을 누르면 고치는 동안만 풀립니다', 'When locked, the app and agents do not edit this note. The pencil still unlocks it while you edit')}>
        <input type="checkbox" checked={!!m.locked} disabled={busy} onChange={(e) => doc.onLock(e.target.checked)} />{t('잠그기', 'Lock')}
      </label>
      {states.length > 0 && <div className="cn-facts">{states}</div>}
      {note.unfinished.length > 0 && <ul className="cn-why">{note.unfinished.map((u) => <li key={u}>{u}</li>)}</ul>}
      <dl className="cn-info-list">
        {tree?.enabled ? <><dt>{t('분류', 'Subject')}</dt><dd><SubjectPicker tree={tree} value={m.subjects ?? []} disabled={busy} onChange={doc.onSubjects} /></dd></> : m.subject && <><dt>{t('분류', 'Subject')}</dt><dd>{m.subject}</dd></>}
        {error && <><dt>{t('분류', 'Subject')}</dt><dd className="error">{error}</dd></>}
        {m.aliases.length > 0 && <><dt>{t('다른 이름', 'Aliases')}</dt><dd>{m.aliases.join(', ')}</dd></>}
        <dt>{t('파일', 'File')}</dt><dd className="mono cn-info-path" title={`shared-library/concepts/${id}.md`}>{id.split('/').pop()}.md</dd>
        {m.study && <><dt>Study</dt><dd title={m.study}>{t('Study에서 옮김', 'Moved from Study')}</dd></>}
      </dl>
    </section>
  )
}

/** 문헌을 여는 주소: arXiv가 있으면 arXiv, 아니면 DOI */
export function sourceUrl(e: { eprint?: string; doi?: string }): string | undefined {
  return e.eprint ? `https://arxiv.org/abs/${e.eprint}` : e.doi ? `https://doi.org/${e.doi}` : undefined
}

/** "Example et al. 2022" — bib의 author(성, 이름 and …)와 year로 */
export function citeLabel(e: { author?: string; year?: string; key: string }): string {
  const names = (e.author ?? '').split(/\s+and\s+/).map((a) => (a.includes(',') ? a.split(',')[0]! : a.trim().split(/\s+/).pop() ?? '').replace(/[{}]/g, '').trim()).filter(Boolean)
  if (!names.length) return e.key
  const who = names.length === 1 ? names[0] : names.length === 2 ? `${names[0]}, ${names[1]}` : `${names[0]} et al.`
  return `${who}${e.year ? ` ${e.year}` : ''}`
}

/** 노트 본문 아래 출처 목록: 머리말 sources + 본문 [@키] (references.bib에서). 노트에 글로 적지 않고 앱이 모은다 (2026-10-04 결정) */
export function ConceptSourcesList({ srcs }: { srcs: ConceptSources | null }) {
  const sources = srcs?.sources ?? []
  const unsorted = srcs?.unsorted ?? []
  return (
    <section className="cn-links" data-ui="출처와 쓰는 개념">
      <h2 className="cn-links-h">{t('출처', 'Sources')}</h2>
      {sources.length === 0 && unsorted.length === 0 && <p className="muted">{t('아직 없음 · 본문에 [@인용 키]를 적거나 머리말 sources:에 references.bib 키를 넣습니다', 'None yet · Write [@citation key] in the text or put references.bib keys in sources: in the front matter')}</p>}
      {sources.length > 0 && (
        <ol className="cn-src">
          {sources.map((e) => (
            <li key={e.key} id={`cn-src-${e.key}`}>
              {e.missing
                ? <><span className="mono">{e.key}</span> <span className="muted">{t('references.bib에 없는 키', 'Key not in references.bib')}</span></>
                : <>
                  <span>{citeLabel(e)}</span>{' · '}
                  {sourceUrl(e)
                    ? <a className="a cn-src-title" href={sourceUrl(e)} target="_blank" rel="noreferrer" title={t('논문 페이지 열기', 'Open paper page')}>{e.title ?? e.key}</a>
                    : <span className="cn-src-title">{e.title ?? e.key}</span>}
                  {e.journal && <span className="muted"> · {e.journal}</span>}
                  {e.eprint && <>{' · '}<a className="a" href={`https://arxiv.org/abs/${e.eprint}`} target="_blank" rel="noreferrer">arXiv:{e.eprint}</a></>}
                  {e.doi && <>{' · '}<a className="a" href={`https://doi.org/${e.doi}`} target="_blank" rel="noreferrer">doi</a></>}
                </>}
            </li>
          ))}
        </ol>
      )}
      {unsorted.length > 0 && (
        <div className="cn-unsorted">
          <p className="muted">{t('bib 키로 아직 바꾸지 못한 출처', 'Sources not yet turned into bib keys')} ({unsorted.length})</p>
          <ul>{unsorted.map((x, i) => <li key={i}>{x}</li>)}</ul>
        </div>
      )}
    </section>
  )
}

/**
 * 오른쪽 사이드바 (2026-10-04 15:18 피드백 "우측 사이드바에서 하기로"): 메모·할 일, 이 개념을 쓰는 개념, 이 노트가 가리키는 개념.
 * 연결은 색인에서 바로 받는다. 지식 화면에서는 노트 오른쪽 칸, 프로젝트에서는 앱의 맥락 칸에 놓인다.
 */
export function ConceptSidePanel({ id, info, rid, project, doc, slot, onChanged, onSaved }: {
  id: string; info: LibraryInfo | null; rid?: string; project?: string
  /** 읽고 있는 노트: 있으면 맨 위에 문서 정보 */
  doc?: DocState
  /** 프로젝트 탭: 맨 위에 노트 화면이 문서 정보를 그릴 자리 */
  slot?: boolean
  onChanged(): void; onSaved(msg: string): void
}) {
  const [links, setLinks] = useState<{ out: ConceptRow[]; back: ConceptRow[]; missing: string[] } | null>(null)
  useEffect(() => {
    let live = true
    conceptsApi.links(id).then((l) => { if (live) setLinks(l) }).catch(() => { if (live) setLinks(null) })
    return () => { live = false }
  }, [id, info])
  const chips = (rows: ConceptRow[]) => rows.length === 0
    ? <p className="muted">{t('아직 없음', 'None yet')}</p>
    : <div className="cn-facts">{rows.map((r) => <button key={r.id} className="dep-chip" onClick={(ev) => { ev.stopPropagation(); go(rid ? { page: 'concept', rid, id: r.id } : { page: 'library', topic: r.id }) }}>{r.title}</button>)}</div>
  return (
    <div className="cn-side-panel">
      {doc && <ConceptDocInfo id={id} doc={doc} />}
      {slot && <div ref={setRightSlot} className="rs-slot" />}
      <ConceptUses id={id} info={info} rid={rid} project={project} onChanged={onChanged} onSaved={onSaved} />
      <section>
        <h2 className="cn-links-h">{t('이 개념을 쓰는 개념', 'Concepts that use this')}</h2>
        {chips(links?.back ?? [])}
      </section>
      <section>
        <h2 className="cn-links-h">{t('이 노트가 가리키는 개념', 'Concepts this note links to')}</h2>
        {chips(links?.out ?? [])}
        {(links?.missing.length ?? 0) > 0 && <p className="muted" title={t('이 이름의 개념노트가 아직 없습니다', 'No concept note with this name yet')}>{t('노트 없는 링크', 'Links without a note')}: {links!.missing.join(', ')}</p>}
      </section>
    </div>
  )
}

/**
 * 쓰는 곳과 인용 (10/4 16:59 피드백 "쓰는 곳이랑 인용 문헌 관리 같이 생각해줘야해").
 * 이 개념을 쓰는 프로젝트마다: 기대는 연구노트, 그리고 개념노트의 출처([1], [2] …)를 그 프로젝트 bib도 갖고 있는지.
 * 원고에서 이 개념을 쓸 때 출처를 빠뜨리지 않게 한다. 같은 논문을 다른 키로 적어도 arXiv 번호·DOI·제목으로 알아본다.
 */
function ConceptUses({ id, info, rid, project, onChanged, onSaved }: {
  id: string; info: LibraryInfo | null; rid?: string; project?: string; onChanged(): void; onSaved(msg: string): void
}) {
  const [uses, setUses] = useState<ConceptUse[] | null>(null)
  const [srcs, setSrcs] = useState<ConceptSources | null>(null)
  useEffect(() => {
    let live = true
    conceptsApi.usage(id).then((u) => { if (live) setUses(u) }).catch(() => { if (live) setUses([]) })
    conceptsApi.sources(id).then((s) => { if (live) setSrcs(s) }).catch(() => { if (live) setSrcs(null) })
    return () => { live = false }
  }, [id, info])
  const link = (r: string, name: string, on: boolean) => {
    api.linkConcept(r, id, on).then(() => { onChanged(); onSaved(on ? t(`${name}에 이 개념노트를 연결했습니다`, `Linked this concept note to ${name}`) : t(`${name}와의 연결을 끊었습니다`, `Unlinked from ${name}`)) }).catch((e: Error) => onSaved(e.message))
  }
  const num = (key: string) => (srcs?.sources.findIndex((s) => s.key === key) ?? -1) + 1
  const label = (key: string) => { const e = srcs?.sources.find((s) => s.key === key); return e && !e.missing ? citeLabel(e) : key }
  const linkedHere = !!rid && !!uses?.some((u) => u.rid === rid && u.linked)
  return (
    <section data-ui="쓰는 곳">
      <h2 className="cn-links-h">{t('사용처와 인용', 'Used in and citations')}</h2>
      {uses?.length === 0 && <p className="muted">{t('아직 쓰는 프로젝트가 없습니다', 'No project uses this yet')}</p>}
      {uses?.map((u) => {
        const have = u.cites.filter((c) => c.projectKey)
        const lack = u.cites.filter((c) => !c.projectKey)
        return (
          <div key={u.rid} className="cn-use">
            <div className="cn-use-head">
              <button className="a cn-use-name" onClick={(ev) => { ev.stopPropagation(); go({ page: 'map', rid: u.rid }) }}>{u.project}</button>
              {u.linked && <span className="hover-actions"><button className="icon-btn" data-ui="개념 연결 끊기" title={t(`연결 끊기 — ${u.project}의 research.yaml concepts:에서 뺍니다`, `Unlink: removes it from concepts: in ${u.project}'s research.yaml`)} aria-label={t('연결 끊기', 'Unlink')} onClick={() => link(u.rid, u.project, false)}>×</button></span>}
            </div>
            {u.notes.length > 0 && <div className="cn-facts">{u.notes.map((n) => <button key={n.file} className="dep-chip" onClick={(ev) => { ev.stopPropagation(); go({ page: 'part', rid: u.rid, file: n.file }) }}>{n.title}</button>)}</div>}
            {u.cites.length > 0 && (
              <p className="cn-use-cites" title={t('이 개념노트의 출처가 프로젝트 bib에도 있는지 (같은 논문을 다른 키로 적어도 arXiv 번호·DOI·제목으로 찾습니다)', "Whether this concept note's sources are also in the project bib (matched by arXiv number, DOI, or title even under a different key)")}>
                {lack.length === 0 ? <>✓ {t(`출처 ${have.length}개 모두 이 프로젝트 bib에 있음`, `All ${plural(have.length, 'source')} are in this project's bib`)}</> : <>{t(`출처 ${u.cites.length}개 중 ${have.length}개가 이 프로젝트 bib에 있음`, `${have.length} of ${plural(u.cites.length, 'source')} are in this project's bib`)}</>}
              </p>
            )}
            {lack.length > 0 && <p className="muted">{t('bib에 없음', 'Not in bib')}: {lack.map((c) => `[${num(c.key)}] ${label(c.key)}`).join(', ')}</p>}
            {have.some((c) => c.projectKey !== c.key) && <p className="muted">{t('다른 키', 'Other keys')}: {have.filter((c) => c.projectKey !== c.key).map((c) => `[${num(c.key)}] ${c.projectKey}`).join(', ')}</p>}
          </div>
        )
      })}
      {rid && uses && !linkedHere && <button className="a cn-use-add" data-ui="개념 연결" title={t('프로젝트 전체가 이 개념에 기댄다고 적습니다 (workbench/research.yaml의 concepts:)', 'Records that the whole project relies on this concept (concepts: in workbench/research.yaml)')} onClick={() => link(rid, project ?? t('이 프로젝트', 'this project'), true)}>＋ {t(`${project ?? '이 프로젝트'}에 연결`, `Link to ${project ?? 'this project'}`)}</button>}
    </section>
  )
}
