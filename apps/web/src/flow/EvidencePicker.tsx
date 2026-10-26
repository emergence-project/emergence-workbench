import { useEffect, useMemo, useRef, useState } from 'react'
import { flowApi, type NoteRow } from '../api'
import { t as tr } from '../i18n'
import { noteKindLabel } from '../noteKinds'

type Sections = Map<string, { name: string; level: number; preview: string }[]>
/** 프로젝트마다 한 번 받는 노트별 절 목록 (창을 열 때) */
const cache = new Map<string, Promise<Sections>>()
const sectionsOf = (rid: string) => {
  let p = cache.get(rid)
  if (!p) { p = flowApi(rid).sections().then((ns) => new Map(ns.map((n) => [n.file, n.sections]))); cache.set(rid, p) }
  return p
}
const SHOWN = 8

/**
 * 근거의 노트 · 절 고르기 (10/26 "흐름 연결" ②, 시안 2절): 제목으로 찾으면 노트마다 그 절이 함께 보이고,
 * 절 하나를 누르면 노트와 절이 한 번에 정해진다. 노트가 아닌 파일은 경로를 그대로 적어 고른다.
 */
export function EvidencePicker({ rid, notes, file, section, topicTitle, onPick }: {
  rid: string; notes: NoteRow[]; file: string; section: string; topicTitle(id: string): string
  onPick(file: string, section: string, note?: NoteRow): void
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [secs, setSecs] = useState<Sections | null>(null)
  const [peek, setPeek] = useState<{ file: string; name: string } | null>(null)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    void sectionsOf(rid).then(setSecs, () => setSecs(new Map()))
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc) }
  }, [open, rid])
  const shown = notes.find((x) => x.file === file)
  const hits = useMemo(() => {
    const w = q.trim().toLowerCase()
    return notes.filter((n) => !w || n.title.toLowerCase().includes(w) || n.file.toLowerCase().includes(w) || n.topics.some((t) => topicTitle(t).toLowerCase().includes(w)))
  }, [notes, q, topicTitle])
  const pick = (f: string, s: string, n?: NoteRow) => { onPick(f, s, n); setOpen(false); setQ('') }
  const preview = peek && secs?.get(peek.file)?.find((s) => s.name === peek.name)
  const label = shown ? shown.title : file || tr('노트 · 절 고르기', 'Choose a note and section')
  return (
    <div className="fl-evpick" ref={box}>
      <button type="button" className={`fl-in fl-evpick-btn${file ? '' : ' empty'}`} aria-expanded={open} onClick={() => setOpen(!open)}
        title={file || undefined}>
        <span className="fl-evpick-note">{label}</span>
        <span className="fl-evpick-sec">{file ? (section || tr('노트 전체', 'Whole note')) : ''}</span>
      </button>
      {open && <div className="fl-evpick-pop" role="dialog" aria-label={tr('노트와 절 찾기', 'Find a note and section')} data-ui="흐름 근거 고르기 창">
        <input className="fl-in fl-evpick-q" autoFocus value={q} placeholder={tr('노트 제목 · 주제로 찾기, 또는 파일 경로', 'Search note titles or topics, or type a file path')}
          aria-label={tr('노트 찾기', 'Search notes')} onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && q.includes('/') && !hits.length) { e.preventDefault(); pick(q.trim(), '') } }} />
        <div className="fl-evpick-list">
          {hits.slice(0, SHOWN).map((n) => {
            const ss = secs?.get(n.file) ?? []
            return <div key={n.file} className={`fl-evpick-grp${n.file === file ? ' on' : ''}`}>
              <div className="fl-evpick-head"><span className="fl-evpick-title">{n.title}</span>
                {n.topics[0] && <span className="tag">{topicTitle(n.topics[0])}</span>}
                <span className="fl-evpick-kind">{noteKindLabel(n.kind)}</span></div>
              <div className="fl-evpick-secs">
                {ss.filter((s) => s.level <= 3).map((s) => <button key={s.name} type="button" className={`fl-evpick-chip${s.level === 3 ? ' sub' : ''}${n.file === file && s.name === section ? ' on' : ''}`}
                  onMouseEnter={() => setPeek({ file: n.file, name: s.name })} onFocus={() => setPeek({ file: n.file, name: s.name })}
                  onClick={() => pick(n.file, s.name, n)}>{s.name}</button>)}
                <button type="button" className={`fl-evpick-chip whole${n.file === file && !section ? ' on' : ''}`} onClick={() => pick(n.file, '', n)}>{tr('노트 전체', 'Whole note')}</button>
              </div>
            </div>
          })}
          {hits.length > SHOWN && <p className="fl-help">{tr(`외 ${hits.length - SHOWN}개: 더 좁혀 찾으세요`, `${hits.length - SHOWN} more: narrow the search`)}</p>}
          {!hits.length && (q.includes('/')
            ? <button type="button" className="a" onClick={() => pick(q.trim(), '')}>{tr(`이 경로로: ${q.trim()}`, `Use this path: ${q.trim()}`)}</button>
            : <p className="fl-help">{tr('맞는 노트가 없습니다. 노트가 아닌 파일은 경로를 적으세요.', 'No note matches. For a file that is not a note, type its path.')}</p>)}
          {!secs && <p className="fl-help">{tr('절 목록을 불러오는 중…', 'Loading sections…')}</p>}
        </div>
        {preview && <div className="fl-evpick-peek"><b>{preview.name}</b>{preview.preview && <span> — {preview.preview}</span>}</div>}
        <p className="fl-help">{tr('절을 고르면 그 절이 바뀔 때만 확인이 낡습니다.', 'With a section, a check goes stale only when that section changes.')}</p>
      </div>}
    </div>
  )
}
