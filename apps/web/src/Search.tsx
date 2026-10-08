import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { conceptsApi, searchApi, type ConceptRow, type SearchItem } from './api'
import { GLOBAL_PAGES } from './globalPages'
import { Icon } from './icons'
import { NOTE_KIND_LABEL } from './NewNote'
import { AUX_NOTE } from './notes'
import { go, type Route } from './router'
import { rank } from './searchMatch'
import { resultsForQuery, type QueryResults } from './queryResults'
import { t } from './i18n'

/** 결과 한 줄 */
interface Hit { key: string; title: string; kind: string; where?: string; icon: ReactNode; to: Route }

const KIND_LABEL: Record<SearchItem['kind'], string> = {
  project: t('프로젝트', 'Project'), card: t('주제', 'Topic'), note: t('노트', 'Note'), part: t('장', 'Chapter'), block: AUX_NOTE, statement: t('진술', 'Statement'), paper: t('문헌노트', 'Literature note'), concept: t('개념노트', 'Concept note'), person: t('사람', 'Person'),
}
const KIND_ICON: Record<SearchItem['kind'], ReactNode> = {
  project: Icon.research, card: Icon.card, note: Icon.block, part: Icon.block, block: Icon.block, statement: Icon.statement, paper: Icon.paper, concept: Icon.concept, person: Icon.network,
}
/** 묶음 순서 */
const GROUPS = ['화면', '프로젝트', '주제', '노트', '개념노트', '문헌노트', '사람'] as const
type Group = (typeof GROUPS)[number]
/** 묶음의 화면 이름 (Group은 내부 키) */
const GROUP_NAME: Record<Group, string> = {
  화면: t('화면', 'Screens'), 프로젝트: t('프로젝트', 'Projects'), 주제: t('주제', 'Topics'), 노트: t('노트', 'Notes'), 개념노트: t('개념노트', 'Concept notes'), 문헌노트: t('문헌노트', 'Literature notes'), 사람: t('사람', 'People'),
}
const SCREEN = t('화면', 'Screen')
/** 묶음과 같은 종류면 줄에 종류를 적지 않는다 */
const GROUP_KIND: Record<Group, string> = {
  화면: SCREEN, 프로젝트: KIND_LABEL.project, 주제: KIND_LABEL.card, 노트: KIND_LABEL.note, 개념노트: KIND_LABEL.concept, 문헌노트: KIND_LABEL.paper, 사람: KIND_LABEL.person,
}
const GROUP_OF: Record<SearchItem['kind'], Group> = {
  project: '프로젝트', card: '주제', note: '노트', part: '노트', block: '노트', statement: '노트', concept: '개념노트', paper: '문헌노트', person: '사람',
}

/**
 * 전역 검색 (10/4 19:33 피드백 "검색 아이콘은 상단에, 전역으로"): 제목줄의 돋보기나 "/" 키로 연다.
 * 모든 프로젝트의 카드·노트·장·보조 노트·진술 이름, 개념노트(이름·다른 이름·본문), 문헌노트, 사람, 앱 화면을 한 번에 찾는다.
 * ↑↓로 고르고 Enter로 열며 Esc로 닫는다.
 * 라이브러리 노트(문헌노트, LaTeX 개념노트)는 프로젝트 작업 화면에서 열리므로 지금 프로젝트(없으면 첫 프로젝트)에서 연다.
 */
export function SearchOverlay({ rid, onClose }: { rid: string | null; onClose(): void }) {
  const [q, setQ] = useState('')
  const [catalog, setCatalog] = useState<SearchItem[] | null>(null)
  const [failed, setFailed] = useState(false)
  /** 공유 라이브러리가 있어 개념노트 색인을 찾을 수 있는지 (목록을 받기 전에는 모름) */
  const [library, setLibrary] = useState(false)
  const [conceptSearch, setConceptSearch] = useState<QueryResults<ConceptRow>>({ query: '', status: 'idle', items: [] })
  const concepts = resultsForQuery(conceptSearch, q.trim(), library)
  const [active, setActive] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    searchApi.catalog().then((r) => { setCatalog(r.items); setLibrary(r.library) }).catch(() => { setCatalog([]); setFailed(true) })
  }, [])
  // 개념노트는 본문까지 찾는 색인에서 (잠깐 모았다가, 늦게 온 답은 버린다)
  useEffect(() => {
    const term = q.trim()
    if (!term || !library) { setConceptSearch({ query: term, status: 'idle', items: [] }); return }
    setConceptSearch({ query: term, status: 'pending', items: [] })
    let alive = true
    const timer = window.setTimeout(() => {
      conceptsApi.list({ q: term, limit: 6, showEmpty: true }).then((r) => { if (alive) setConceptSearch({ query: term, status: 'ready', items: r.items }) }).catch(() => { if (alive) setConceptSearch({ query: term, status: 'error', items: [] }) })
    }, 120)
    return () => { alive = false; window.clearTimeout(timer) }
  }, [q, library])

  const libRid = rid ?? catalog?.find((x) => x.kind === 'project')?.rid ?? null
  const groups = useMemo(() => {
    const term = q.trim()
    const out: { group: Group; hits: Hit[] }[] = []
    const pages: Hit[] = [
      { key: 'page:home', title: t('홈', 'Home'), kind: SCREEN, icon: Icon.home, to: { page: 'home' } },
      ...GLOBAL_PAGES.map((g) => ({ key: `page:${g.page}`, title: g.name, kind: SCREEN, where: /[—:]/.test(g.tip) ? g.tip.replace(/^[^—:]*[—:]\s*/, '') : undefined, icon: g.icon, to: { page: g.page } as Route })),
    ]
    const items = catalog ?? []
    const toHit = (x: SearchItem): Hit | null => {
      const base = { key: `${x.kind}:${x.rid ?? ''}:${x.id}`, title: x.title, icon: KIND_ICON[x.kind], where: x.project }
      const kind = x.kind === 'note' && x.noteKind ? NOTE_KIND_LABEL[x.noteKind] : KIND_LABEL[x.kind]
      switch (x.kind) {
        case 'project': return { ...base, kind, where: undefined, to: { page: 'overview', rid: x.id } }
        case 'card': return { ...base, kind, to: { page: 'topic', rid: x.rid!, tid: x.id } }
        case 'note': case 'part': return { ...base, kind, to: { page: 'part', rid: x.rid!, file: x.file! } }
        case 'block': return { ...base, kind, to: { page: 'block', rid: x.rid!, bid: x.id } }
        case 'statement': return { ...base, kind, to: { page: 'statement', rid: x.rid!, sid: x.id } }
        case 'paper': case 'concept': return libRid ? { ...base, kind, to: { page: x.kind, rid: libRid, id: x.id } } : null
        case 'person': return { ...base, kind, to: { page: 'network', person: x.id } }
      }
    }
    // 프로젝트 이름은 찾는 글에 넣지 않는다 (넣으면 프로젝트 이름과 맞는 말에 그 프로젝트의 노트가 모두 걸린다)
    const text = (x: SearchItem): [string, string] => [x.title, x.also ?? '']
    const add = (group: Group, hits: Hit[]) => { if (hits.length) out.push({ group, hits }) }
    if (!term) {
      add('화면', pages)
      add('프로젝트', items.filter((x) => x.kind === 'project').map(toHit).filter((h): h is Hit => !!h))
      return out
    }
    add('화면', rank(pages, term, (p) => [p.title, p.where], 4))
    for (const group of GROUPS.slice(1)) {
      const of = items.filter((x) => GROUP_OF[x.kind] === group)
      const hits = rank(of, term, text, group === '노트' ? 8 : 5).map(toHit).filter((h): h is Hit => !!h)
      if (group === '개념노트') {
        hits.unshift(...concepts.items.map((c): Hit => ({ key: `md:${c.id}`, title: c.title, kind: KIND_LABEL.concept, where: c.subject || undefined, icon: Icon.concept, to: { page: 'library', topic: c.id } })))
        hits.splice(6)
      }
      add(group, hits)
    }
    return out
  }, [q, catalog, concepts.items, libRid])

  const flat = groups.flatMap((g) => g.hits)
  const sel = Math.min(active, Math.max(0, flat.length - 1))
  useEffect(() => { listRef.current?.querySelector('.sr-row.on')?.scrollIntoView({ block: 'nearest' }) }, [sel])

  const open = (h: Hit) => { onClose(); go(h.to) }
  const key = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((sel + 1) % Math.max(1, flat.length)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((sel - 1 + flat.length) % Math.max(1, flat.length)) }
    else if (e.key === 'Enter') { e.preventDefault(); const h = flat[sel]; if (h) open(h) }
    else if (e.key === 'Escape') { e.preventDefault(); onClose() }
  }

  let n = -1
  return (
    <div className="overlay sr-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="dialog sr-box" role="dialog" aria-label={t('검색', 'Search')} data-ui="검색 창">
        <label className="sr-input">
          {Icon.search}
          <input autoFocus value={q} placeholder={t('모든 프로젝트의 주제·노트·개념노트·문헌노트·사람·화면 찾기', 'Search topics, notes, concept notes, literature notes, people and screens in all projects')} aria-label={t('찾을 말', 'Search term')}
            role="combobox" aria-expanded aria-controls="sr-list" aria-activedescendant={flat[sel] ? `sr-${sel}` : undefined}
            onChange={(e) => { setQ(e.target.value); setActive(0) }} onKeyDown={key} />
        </label>
        <div className="sr-list" id="sr-list" role="listbox" ref={listRef}>
          {catalog === null ? <p className="sr-empty">{t('불러오는 중…', 'Loading…')}</p>
            : !flat.length && concepts.status !== 'pending' && concepts.status !== 'error' ? <p className="sr-empty">{q.trim() ? t(`"${q.trim()}"와 맞는 것이 없습니다`, `Nothing matches "${q.trim()}"`) : t('찾을 말을 적으세요', 'Type something to search')}</p>
            : groups.map((g) => (
              <div key={g.group} className="sr-group">
                <div className="sr-head">{GROUP_NAME[g.group]}</div>
                {g.hits.map((h) => {
                  const i = ++n
                  return (
                    <button key={h.key} id={`sr-${i}`} role="option" aria-selected={i === sel} className={`sr-row${i === sel ? ' on' : ''}`}
                      onMouseMove={() => { if (i !== sel) setActive(i) }} onClick={() => open(h)}>
                      <span className="sr-icon" aria-hidden>{h.icon}</span>
                      <span className="sr-title">{h.title}</span>
                      {h.where && <span className="sr-where">{h.where}</span>}
                      {h.kind !== GROUP_KIND[g.group] && <span className="sr-kind">{h.kind}</span>}
                    </button>
                  )
                })}
              </div>
            ))}
          {concepts.status === 'pending' && <p className="sr-empty">{t('개념노트 찾는 중…', 'Searching concept notes…')}</p>}
          {concepts.status === 'error' && <p className="sr-empty">{t('개념노트를 찾지 못했습니다. 찾을 말을 다시 적어 주세요', 'Couldn\'t search concept notes. Try typing again')}</p>}
          {failed && <p className="sr-empty">{t('프로젝트 노트 목록을 읽지 못했습니다. 개념노트와 화면만 찾습니다', 'Couldn\'t read project notes. Searching only concept notes and screens')}</p>}
        </div>
        <div className="sr-foot"><span><kbd>↑</kbd><kbd>↓</kbd> {t('고르기', 'Select')}</span><span><kbd>Enter</kbd> {t('열기', 'Open')}</span><span><kbd>Esc</kbd> {t('닫기', 'Close')}</span><span><kbd>/</kbd> {t('어디서나 검색 열기', 'Open search anywhere')}</span></div>
      </div>
    </div>
  )
}
