import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { agentEditsApi, api, conceptsApi, learnApi, type ConceptBrief, type ConceptRow, type ConceptCheck, type ConceptIssue, type IdCount, type LibraryInfo } from './api'
import { askText } from './askText'
import { conceptCounts, pushRecent, readOpened, useKnowledge } from './ConceptNotes'
import { Icon } from './icons'
import { dayOf, mergeRecent, shortSubject } from './knowledgeRecent'
import { LibraryStorage, StoreLine } from './LibraryStorage'
import { go } from './router'
import { showKnowledgeList } from './knowledgeListState'
import { t } from './i18n'

/**
 * 지식 첫 화면 (라이브러리 L1, requirements §8.1 "라이브러리 첫 화면" · "지식 점검 기준", 시안 planning/mockups/2026-10-06-library-landing/).
 * 머리줄 없이 ① 최근 노트(연 것 · 고친 것을 한 목록, 맨 위 줄 "＋ 개념노트 만들기") ② 왼쪽 점검(사용자 차례, 주황 수) · 오른쪽 통계(이상 종류).
 * 오른쪽 칸은 라이브러리 정보(저장 위치 · 라이브러리 관리). 숫자는 서버 색인(GET /api/concepts/brief)에서 온다.
 */
export function KnowledgeHome({ info, rightOpen = true, onChanged, onSaved }: { info: LibraryInfo; rightOpen?: boolean; onChanged(): void; onSaved(msg: string): void }) {
  const [brief, setBrief] = useState<ConceptBrief | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [opened, setOpened] = useState<ConceptRow[]>([])
  // 에이전트 고침 (10/8): 검토할 개념노트 · 확인된 개념노트 고치기 요청. 점검에 한 줄씩
  const [edits, setEdits] = useState({ reviews: 0, attempts: 0 })
  const load = useCallback(() => {
    conceptsApi.brief(RECENT).then((b) => { setBrief(b); setError(null) }).catch((e: Error) => setError(e.message))
    agentEditsApi.list('library').then((v) => setEdits({ reviews: v.reviews.length, attempts: v.attempts.length })).catch(() => undefined)
    const ids = readOpened().map((x) => x.id)
    if (ids.length) conceptsApi.rows(ids).then(setOpened).catch(() => setOpened([]))
  }, [])
  // 라이브러리가 바뀌면(info) 다시 센다 — 바깥(에이전트 · 다른 편집기)에서 고친 것도 보이게
  useEffect(() => { load() }, [load, info])

  const recent = brief ? mergeRecent(brief.recent, opened, readOpened()) : []
  const check = brief ? CHECK.filter((c) => c.of(brief).count > 0) : []
  const editRows = EDIT_ROWS.filter((r) => edits[r.key] > 0)

  return (
    <main className="kn-page kh-page" data-ui="지식 첫 화면">
      <div className={`kh-layout${rightOpen ? '' : ' no-right'}`}>
        <div className="scroll kh-main">
          {error && <div className="banner danger">{t(`첫 화면 숫자를 읽지 못했습니다: ${error}`, `Couldn't read the counts for this page: ${error}`)}</div>}
          <section className="kh-sec" data-ui="최근 노트">
            <h2 className="kh-h"><button className="a lh-h-link" onClick={() => showKnowledgeList({}, true)}>{t('최근 노트', 'Recent notes')}</button></h2>
            <div className="kh-rows">
              <MakeConcept onChanged={onChanged} onSaved={onSaved} onDrafted={load} />
              {recent.map((r) => (
                <button key={r.id} className="kh-row" data-ui="최근 노트 줄" data-ui-item={r.title} onClick={() => openConcept(r.id)}>
                  <span className="kh-title">{r.title}</span>
                  <span className="kh-subject" title={r.subject}>{shortSubject(r.subject)}</span>
                  <span className="kh-when">{t(`${r.at ? `${dayOf(r.at)} ` : ''}${r.kind === 'opened' ? '열었음' : '고침'}`, `${r.kind === 'opened' ? 'Opened' : 'Edited'}${r.at ? ` ${dayOf(r.at).toLowerCase()}` : ''}`)}</span>
                </button>
              ))}
              {brief && recent.length === 0 && <p className="kh-empty">{t('아직 개념노트가 없습니다. 위 "개념노트 만들기"로 더합니다.', 'No concept notes yet. Add one with "New concept note" above.')}</p>}
            </div>
          </section>
          <div className="kh-cols">
            <section className="kh-sec" data-ui="점검">
              <h2 className="kh-h" title={t('연구가 쓰는 노트(프로젝트 노트 · 원고가 링크한 개념노트와 그 노트가 링크한 전제 한 단계)와 에이전트가 쓴 초안 가운데 사용자가 볼 것', 'What you need to look at among notes used by research (concept notes linked from project notes or manuscripts, plus the prerequisites they link one step further) and agent drafts')}>{check.length + editRows.length > 0 && <span className="kh-dot" aria-hidden />}{t('점검', 'Check')}{brief && <span className="kh-h-n">{t(`연구가 쓰는 노트 ${brief.check.used}`, `Notes used by research ${brief.check.used}`)}</span>}</h2>
              {editRows.map((r) => (
                <button key={r.key} className="kh-stat" data-ui="점검 줄" data-ui-item={r.label} title={r.tip} onClick={() => go({ page: 'review', scope: 'library' })}>
                  <span className="kh-stat-name">{r.name}</span><span className="kh-count turn">{edits[r.key]}</span>
                </button>
              ))}
              {brief && check.length + editRows.length === 0 && <p className="kh-empty">{t('지금 확인할 것이 없습니다.', 'Nothing to review right now.')}</p>}
              {brief && check.map((c) => {
                const v = c.of(brief)
                return (
                  <button key={c.key} className="kh-stat" data-ui="점검 줄" data-ui-item={c.label} title={c.tip} onClick={() => showKnowledgeList({ check: c.key as ConceptCheck, showEmpty: true })}>
                    <span className="kh-stat-name">{c.name}</span><span className="kh-count turn">{v.count}</span>
                  </button>
                )
              })}
            </section>
            <section className="kh-sec" data-ui="통계">
              <h2 className="kh-h">{t('통계', 'Stats')}{brief && <span className="kh-h-n">{t(`노트 ${brief.total}`, `Notes ${brief.total}`)}</span>}</h2>
              {brief && STATS.map((c) => (
                <button key={c.key} className="kh-stat" data-ui="통계 줄" data-ui-item={c.label} title={c.tip} disabled={c.of(brief).count === 0}
                  onClick={() => showKnowledgeList({ issue: c.key as ConceptIssue, showEmpty: true })}>
                  <span className="kh-stat-name">{c.name}</span><span className="kh-count">{c.of(brief).count}</span>
                </button>
              ))}
            </section>
          </div>
        </div>
        {/* 오른쪽 사이드바: 제목줄 단추 · ⌥⌘\로 여닫는다 (시안 10/6) */}
        {rightOpen && <aside className="kh-side" data-ui="라이브러리 정보">
          <KnowledgeStorage info={info} total={brief?.total} />
        </aside>}
      </div>
    </main>
  )
}

const RECENT = 8
type BriefRow = { key: string; /** data-ui-item (한국어 그대로) */ label: string; name: string; tip: string; of(b: ConceptBrief): IdCount }

/** 점검 (사용자 차례). 0인 줄은 숨긴다 */
const CHECK: BriefRow[] = [
  { key: 'unchecked', label: '확인 전', name: t('확인 전', 'Not reviewed'), tip: t('연구가 쓰는 노트 가운데 아직 "확인함"을 누르지 않은 노트', 'Notes used by research that have not been marked "Reviewed" yet'), of: (b) => b.check.unchecked },
  { key: 'changedAfterCheck', label: '확인 뒤 바뀜', name: t('확인 뒤 바뀜', 'Changed after review'), tip: t('연구가 쓰는 노트 가운데 확인한 뒤 본문이 바뀐 노트. 다시 읽고 "확인함"', 'Notes used by research whose text changed after review. Read again and mark "Reviewed"'), of: (b) => b.check.changedAfterCheck },
  { key: 'draftsToReview', label: '초안 검토', name: t('초안 검토', 'Drafts to review'), tip: t('에이전트가 초안을 다 쓴 개념노트. 읽고 맞으면 "확인함"', 'Concept notes an agent finished drafting. Read and mark "Reviewed" if correct'), of: (b) => b.check.draftsToReview },
]
/** 점검의 에이전트 고침 줄 (10/8): 고침 검토 화면(#/review?scope=library)을 연다 */
const EDIT_ROWS: { key: 'reviews' | 'attempts'; label: string; name: string; tip: string }[] = [
  { key: 'reviews', label: '고침 검토', name: t('고침 검토', 'Edits to review'), tip: t('에이전트가 고친 개념노트. 바뀐 곳마다 승인 · 되돌리기 · 고치기', 'Concept notes an agent edited. Approve, revert or edit each change') },
  { key: 'attempts', label: '고치기 요청', name: t('고치기 요청', 'Edit requests'), tip: t('확인한 개념노트를 에이전트가 고치려 함. 그 대화에서 허락하면 에이전트가 고칩니다', 'An agent wants to edit a reviewed concept note. It edits once you agree in that conversation') },
]
/** 통계 (이상 종류, 에이전트가 research-library README 규칙대로 채운다) */
const STATS: BriefRow[] = [
  { key: 'empty', label: '비어 있음', name: t('비어 있음', 'Empty'), tip: t('머리말 · 제목 줄을 뺀 글이 40자 미만인 노트', 'Notes with under 40 characters besides the front matter and title'), of: (b) => b.stats.empty },
  { key: 'emptySection', label: '빈 절', name: t('빈 절', 'Empty section'), tip: t('제목 아래가 비어 있는 절이 있는 노트', 'Notes with a section that has nothing under its heading'), of: (b) => b.stats.emptySection },
  { key: 'todo', label: 'TODO', name: t('TODO', 'TODO'), tip: t('TODO · TBD · FIXME · 작성 중 표시나 체크하지 않은 할 일 상자(- [ ])가 본문에 남은 노트', 'Notes with TODO, TBD, FIXME, a work-in-progress mark or an unchecked box (- [ ]) left in the text'), of: (b) => b.stats.todo },
  { key: 'brokenLink', label: '끊긴 링크', name: t('끊긴 링크', 'Broken link'), tip: t('[[이름]]이 어느 노트의 이름 · 다른 이름과도 맞지 않는 노트', 'Notes with a [[name]] that matches no note\'s name or alias'), of: (b) => b.stats.brokenLink },
  { key: 'noSource', label: '출처 없음', name: t('출처 없음', 'No source'), tip: t('본문 인용 [@키]도 머리말 sources:도 없는 노트 (빈 노트는 빼고)', 'Notes with neither a [@key] citation nor sources: in the front matter (empty notes excluded)'), of: (b) => b.stats.noSource },
  { key: 'unknownCite', label: 'bib에 없는 키', name: t('bib에 없는 키', 'Key not in bib'), tip: t('머리말 sources: 또는 본문 [@키]의 키가 references.bib에 없는 노트', 'Notes whose sources: or [@key] cites a key that is not in references.bib'), of: (b) => b.stats.unknownCite },
]
function openConcept(id: string) {
  pushRecent(id)
  go({ page: 'library', topic: id })
}

/**
 * "＋ 개념노트 만들기" (최근 노트 맨 위 줄): 팝업 메뉴 직접 쓰기 / 에이전트에게 초안 맡기기.
 * 맡기기는 모르는 말 · 막힌 점 한 줄을 공부할 것(to-learn.yaml)에 남기고 맥의 Claude에게 초안을 부탁한다(기존 learn API).
 */
export function MakeConcept({ onChanged, onSaved, onDrafted }: { onChanged(): void; onSaved(msg: string): void; onDrafted(): void }) {
  const [open, setOpen] = useState<null | 'menu' | 'agent'>(null)
  const [term, setTerm] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const anchor = useRef<HTMLButtonElement>(null)
  const pop = useRef<HTMLDivElement>(null)
  const at = usePlace(anchor, pop, open !== null)
  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => { if (!pop.current?.contains(e.target as Node) && !anchor.current?.contains(e.target as Node)) setOpen(null) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null) }
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc) }
  }, [open])

  const write = async () => {
    setOpen(null)
    const title = await askText({ title: t('새 개념노트', 'New concept note'), label: t('제목', 'Title'), placeholder: t('예: Euler characteristic', 'e.g. Euler characteristic'), hint: t('교과서 수준으로, 어느 연구에서나 같은 내용만 적습니다.', 'Write at textbook level: only what is the same in every project.'), ok: t('만들기', 'Create') })
    if (!title?.trim()) return
    try {
      const { id } = await api.createConcept({ title: title.trim() })
      onChanged()
      openConcept(id)
    } catch (e) { onSaved((e as Error).message) }
  }
  const delegate = async () => {
    const word = term.trim()
    if (!word || busy) return
    setBusy(true)
    try {
      const { item } = await learnApi.add({ term: word, ...(note.trim() && { note: note.trim() }) })
      setOpen(null); setTerm(''); setNote('')
      onSaved(t(`맥의 Claude가 "${item.term}" 초안을 씁니다. 다 쓰면 점검 "초안 검토"에 올라옵니다`, `Claude on your Mac is drafting "${item.term}". When done, it appears under Check › Drafts to review`))
      // 초안은 몇 분 걸린다: 기다리는 동안 화면을 떠나도 된다
      learnApi.draft(item.id).then((r) => {
        onChanged(); onDrafted()
        onSaved(r.existed ? t(`"${item.term}"은 이미 있는 개념노트에 이었습니다`, `"${item.term}" was linked to an existing concept note`) : t(`"${item.term}" 초안을 썼습니다 — 점검 › 초안 검토`, `Drafted "${item.term}": Check › Drafts to review`))
      }).catch((e: Error) => onSaved(t(`초안을 쓰지 못했습니다: ${e.message}`, `Couldn't write the draft: ${e.message}`)))
    } catch (e) { onSaved((e as Error).message) } finally { setBusy(false) }
  }

  return (
    <>
      <button ref={anchor} className={`kh-row kh-make${open ? ' on' : ''}`} data-ui="개념노트 만들기" aria-haspopup="menu" aria-expanded={!!open} onClick={() => setOpen((v) => (v ? null : 'menu'))}>
        <span className="kh-plus" aria-hidden>{Icon.plus}</span><span className="kh-title">{t('개념노트 만들기', 'New concept note')}</span>
      </button>
      {open && createPortal(
        <div ref={pop} className={`menu kh-pop${open === 'agent' ? ' form' : ''}`} role={open === 'menu' ? 'menu' : 'dialog'} data-ui="개념노트 만들기 메뉴"
          style={at ? { top: at.top, left: at.left } : { visibility: 'hidden' }}>
          {open === 'menu' ? <>
            <button role="menuitem" data-ui="직접 쓰기" onClick={() => void write()}>{Icon.pencil}<span>{t('직접 쓰기', 'Write it yourself')}</span></button>
            <button role="menuitem" data-ui="에이전트에게 초안 맡기기" onClick={() => setOpen('agent')}>{Icon.concept}<span>{t('에이전트에게 초안 맡기기', 'Delegate a draft to an agent')}<span className="kh-hint">{t(' · 모르는 말 적기', ' · enter an unfamiliar term')}</span></span></button>
          </> : <>
            <b className="kh-pop-title">{t('에이전트에게 초안 맡기기', 'Delegate a draft to an agent')}</b>
            <input autoFocus className="kh-input" value={term} placeholder={t('모르는 말 (예: Euler characteristic)', 'Unfamiliar term (e.g. Euler characteristic)')} aria-label={t('모르는 말', 'Unfamiliar term')}
              onChange={(e) => setTerm(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void delegate() } }} />
            <input className="kh-input" value={note} placeholder={t('막힌 점 (적지 않아도 됩니다)', 'Where you got stuck (optional)')} aria-label={t('막힌 점', 'Where you got stuck')}
              onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void delegate() } }} />
            <div className="kh-pop-actions">
              <button className="btn" onClick={() => setOpen(null)}>{t('취소', 'Cancel')}</button>
              <button className="btn primary" disabled={busy || !term.trim()} onClick={() => void delegate()}>{busy ? t('맡기는 중…', 'Delegating…') : t('맡기기', 'Delegate')}</button>
            </div>
          </>}
        </div>, document.body)}
    </>
  )
}

/** 단추 아래 왼쪽에 맞춰 놓고, 창 끝에 닿으면 위로 · 왼쪽으로 (디자인 시스템 6절 "팝업") */
export function usePlace(anchor: React.RefObject<HTMLElement | null>, pop: React.RefObject<HTMLElement | null>, open: boolean) {
  const [at, setAt] = useState<{ top: number; left: number } | null>(null)
  useLayoutEffect(() => {
    if (!open) { setAt(null); return }
    const place = () => {
      const b = anchor.current?.getBoundingClientRect()
      const w = pop.current?.offsetWidth ?? 0
      const h = pop.current?.offsetHeight ?? 0
      if (!b) return
      const gap = 8
      const left = Math.max(gap, Math.min(b.left, window.innerWidth - w - gap))
      const below = b.bottom + 4
      setAt({ top: below + h > window.innerHeight - gap ? Math.max(gap, b.top - 4 - h) : below, left })
    }
    place()
    const ro = new ResizeObserver(place)
    if (pop.current) ro.observe(pop.current)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => { ro.disconnect(); window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true) }
  }, [open, anchor, pop])
  return at
}

/** 지식의 저장 위치: Git에 개념노트, iCloud에 아직 옮기지 않은 Obsidian Study 노트 */
export function KnowledgeStorage({ info, total }: { info: LibraryInfo; total?: number }) {
  const { data } = useKnowledge(info)
  const studyOnly = data ? conceptCounts(data.topics).studyOnly : undefined
  return (
    <LibraryStorage info={info} section="knowledge" git={total !== undefined ? t(`개념노트 ${total}`, `Concept notes ${total}`) : undefined}
      icloud={data?.study
        ? <><StoreLine>{t('Obsidian Study · 옮기기 전 노트', 'Obsidian Study · notes not yet moved')}</StoreLine>{studyOnly !== undefined && <StoreLine turn={studyOnly > 0}>{t(`옮기지 않은 노트 ${studyOnly}`, `Notes not moved ${studyOnly}`)}</StoreLine>}</>
        : <StoreLine idle>{t('쓰지 않음', 'Not used')}</StoreLine>}
      drive={<StoreLine idle>{t('쓰지 않음', 'Not used')}</StoreLine>} />
  )
}
