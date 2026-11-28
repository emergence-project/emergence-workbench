import { useLayoutEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fileHistory, fileVersions, type AgentKind, type FileCommit } from './api'
import { AgentLogo } from './agentLogos'
import { paintHistory } from './historyPaint'
import type { RenderOptions } from './ObsidianMarkdown'
import { renderNote } from './noteRender'
import { openRight } from './noteScreen'
import { t } from './i18n'
import { Icon } from './icons'

/**
 * 노트 이력 보기 (11/8 15:16 논의 → 11/16 「시안은 다 추천대로」, 시안 N7ik 2절 ③′, Overleaf 방식).
 * 오른쪽 사이드바 「정보」 머리줄의 시계로 켜고 끈다(기본 끔. 11/28에 노트 툴바에서 옮김). 켜면 오른쪽 사이드바 「정보」가 이 노트 파일을 고친 커밋 목록이 된다:
 * 줄마다 날짜 · 고친 이(작성자와 Co-Authored-By) · 커밋 메시지 · 번호, 최근이 위. 하나를 고르면 그 커밋의 git diff를,
 * Shift를 누르고 하나 더 고르면 그 사이 diff 전체를 본문에 겹친다: 더한 글은 밑줄 바탕, 지운 글은 줄 그음.
 * 에이전트가 고친 곳은 진행 색을 옅게, 내가 고친 곳은 회색. 재료는 git 기록뿐이다(#419부터 에이전트 저장은 에이전트 이름으로 커밋).
 */

/** 이력 보기 단추: 시계 (정보 머리줄과 소개 툴바가 같이 쓴다, 11/11 안 C′) */
export function HistoryButton({ on, onChange }: { on: boolean; onChange(v: boolean): void }) {
  return (
    <button className={`icon-btn${on ? ' on' : ''}`} data-ui="이력 보기" data-tip={on ? t('이력 끄기', 'Hide history') : t('이력 보기', 'Show history')} aria-pressed={on}
      aria-label={t('이력 보기', 'Show history')} onClick={() => onChange(!on)}>{Icon.history}</button>
  )
}

// ---------- 켬 · 고른 커밋 (툴바 · 사이드바 · 본문이 함께 본다) ----------

interface HistoryState { on: boolean; key: string; picked: string[] }
const KEY = 'rw.noteHistory'
const initial = (): HistoryState => { try { return { on: localStorage.getItem(KEY) === '1', key: '', picked: [] } } catch { return { on: false, key: '', picked: [] } } }
let state = initial()
const listeners = new Set<() => void>()
const set = (next: HistoryState) => { state = next; listeners.forEach((f) => f()) }
const subscribe = (f: () => void) => { listeners.add(f); return () => { listeners.delete(f) } }
export const useNoteHistory = () => useSyncExternalStore(subscribe, () => state)

export function setNoteHistory(on: boolean) {
  try { localStorage.setItem(KEY, on ? '1' : '0') } catch { /* 기억하지 못해도 지금 화면은 바뀐다 */ }
  set({ on, key: '', picked: [] })
  if (on) openRight('info')
}
/** 고른 커밋: 노트(rid/file)마다. 다른 노트로 가면 풀린다 */
export const pickedFor = (s: HistoryState, key: string) => (s.on && s.key === key ? s.picked : [])
const pick = (key: string, picked: string[]) => set({ ...state, key, picked })

const AGENT_KIND: Record<string, AgentKind> = { claude: 'claude-code', 'claude code': 'claude-code', codex: 'codex', gemini: 'gemini' }
const kindOf = (name: string): AgentKind | undefined => AGENT_KIND[name.trim().toLowerCase()]

/** 11/9 21:14 */
const when = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? iso : `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }

function Who({ c }: { c: FileCommit }) {
  return <span className="nh-who">{c.authors.map((a) => {
    const kind = a.agent ? kindOf(a.name) : undefined
    return <span key={a.name} className={`nh-author${a.agent ? ' ag' : ''}`}>{kind && <AgentLogo agent={kind} />}{a.agent ? a.name : t('나', 'Me')}</span>
  })}</span>
}

const useCommits = (rid: string, file: string) => useQuery({ queryKey: ['file-history', rid, file], queryFn: () => fileHistory(rid, file), staleTime: 30_000 })

/** 오른쪽 사이드바: 커밋 목록 (최근이 위) */
export function NoteHistorySide({ rid, file }: { rid: string; file: string }) {
  const h = useNoteHistory()
  const key = `${rid}/${file}`
  const picked = pickedFor(h, key)
  const q = useCommits(rid, file)
  const commits = q.data?.commits ?? []
  const choose = (hash: string, add: boolean) => {
    if (picked.includes(hash)) return pick(key, picked.filter((x) => x !== hash))
    pick(key, add && picked.length ? [picked[picked.length - 1]!, hash] : [hash])
  }
  return (
    <div className="nh-side" data-ui="노트 이력">
      <div className="nh-side-head"><span className="rs-label">{t('이력', 'History')}</span><span className="muted small">{t('커밋 · 최근이 위', 'Commits · newest first')}</span></div>
      {q.isLoading && <p className="muted">{t('불러오는 중…', 'Loading…')}</p>}
      {q.error && <p className="muted">{t('이력을 읽지 못했습니다', 'Could not read the history')}: {(q.error).message}</p>}
      {q.data && !commits.length && <p className="muted">{t('이 노트를 고친 커밋이 아직 없습니다. 저장한 고침은 올라간 뒤 여기에 보입니다.', 'No commit has changed this note yet. Saved edits show here once they are committed.')}</p>}
      <ul className="nh-list">
        {commits.map((c) => {
          const on = picked.includes(c.hash)
          return (
            <li key={c.hash} className={`nh-row${on ? ' on' : ''}`} role="button" tabIndex={0} aria-pressed={on} data-ui="이력 커밋" data-ui-item={c.short}
              title={t('누르면 이 커밋의 변경사항을 본문에 겹칩니다. Shift를 누르고 하나 더 고르면 그 사이 전체', 'Click to overlay this commit on the text. Shift-click another to see everything between the two')}
              onClick={(e) => choose(c.hash, e.shiftKey)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(c.hash, e.shiftKey) } }}>
              <span className="nh-line1"><b className="nh-when">{when(c.at)}</b><Who c={c} /></span>
              <span className="nh-line2">{c.subject || t('(메시지 없음)', '(no message)')} <span className="muted mono">· {c.short}</span></span>
            </li>
          )
        })}
      </ul>
      <p className="muted small nh-tip">{t('커밋 하나를 고르면 그 커밋의 변경사항을, Shift를 누르고 하나 더 고르면 두 커밋 사이 전체를 본문에 겹칩니다. 앱을 거치지 않고 파일을 고친 에이전트는 "나"로 보일 수 있습니다.', 'Choose one commit to overlay its changes on the text; Shift-click another to see everything between the two. Agents that changed the file outside the app may show as "Me".')}</p>
    </div>
  )
}

/**
 * 본문 대신: 고른 커밋 뒤의 노트를 그리고, 그 전 노트와 비교해 칠한다.
 * 위 띠에 고른 커밋(날짜 · 고친 이 · 번호)과 앞뒤 커밋으로 옮기는 단추.
 */
export function NoteHistoryBody({ rid, file, options, asset, head }: { rid: string; file: string; options: RenderOptions; asset?(name: string): string; head?: React.ReactNode }) {
  const h = useNoteHistory()
  const key = `${rid}/${file}`
  const picked = pickedFor(h, key)
  const commits = useCommits(rid, file).data?.commits ?? []
  const idx = picked.map((p) => commits.findIndex((c) => c.hash === p)).filter((i) => i >= 0).sort((a, b) => a - b)
  const newer = commits[idx[0] ?? -1], older = commits[idx[idx.length - 1] ?? -1]
  const v = useQuery({
    queryKey: ['file-versions', rid, file, newer?.hash, older?.hash],
    queryFn: () => fileVersions(rid, file, newer!.hash, older !== newer ? older!.hash : undefined),
    enabled: !!newer, staleTime: Infinity,
  })
  const strip = (s: string) => s.replace(/^---\n[\s\S]*?\n---\n?/, '')
  const beforeHtml = useMemo(() => (v.data ? renderNote(strip(v.data.before), options, asset) : ''), [v.data, options, asset])
  const afterHtml = useMemo(() => (v.data ? renderNote(strip(v.data.after), options, asset) : ''), [v.data, options, asset])
  const beforeRef = useRef<HTMLDivElement>(null)
  const afterRef = useRef<HTMLDivElement>(null)
  // 한 사람만 고친 범위면 그 사람의 색: 에이전트만이면 진행 색 옅게, 나만이면 회색, 섞이면 회색
  const span = idx.length ? commits.slice(idx[0], idx[idx.length - 1]! + 1) : []
  const agentOnly = span.length > 0 && span.every((c) => c.authors.every((a) => a.agent))
  useLayoutEffect(() => {
    if (!beforeRef.current || !afterRef.current || !v.data) return
    afterRef.current.innerHTML = afterHtml
    // 칠하다 실패해도 화면을 비우지 않는다: 칠하지 않은 후 글을 그대로 보인다
    try { paintHistory(beforeRef.current, afterRef.current, `nh-ins ${agentOnly ? 'ag' : 'me'}`, 'nh-del') } catch (e) { console.warn('이력 칠하기', e); afterRef.current.innerHTML = afterHtml }
  }, [afterHtml, beforeHtml, agentOnly, v.data])
  if (!newer) return null
  const step = (d: number) => { const i = (idx[0] ?? 0) + d; const c = commits[i]; if (c) pick(key, [c.hash]) }
  return (
    <div className="scroll md-note-read nh-body" data-ui="이력 본문">
      <div className="nh-bar" data-ui="고른 버전">
        <span className="nh-bar-what">
          <b>{when(newer.at)}</b><Who c={newer} /><span className="muted mono">{older && older !== newer ? `${older.short}^..${newer.short}` : newer.short}</span>
          {older && older !== newer && <span className="muted">{t(`· 커밋 ${idx[idx.length - 1]! - idx[0]! + 1}개`, `· ${idx[idx.length - 1]! - idx[0]! + 1} commits`)}</span>}
        </span>
        <span className="sp" />
        <button className="btn" disabled={(idx[idx.length - 1] ?? 0) >= commits.length - 1} onClick={() => step(1)}>{t('← 이전', '← Earlier')}</button>
        <button className="btn" disabled={(idx[0] ?? 0) <= 0} onClick={() => step(-1)}>{t('다음 →', 'Later →')}</button>
      </div>
      {head}
      <div className="page-body cn-body md-note-body">
        {v.isLoading && <p className="muted">{t('불러오는 중…', 'Loading…')}</p>}
        {v.data && !v.data.found && <p className="muted">{t('이 커밋을 찾지 못했습니다', 'Could not find this commit')}</p>}
        <div ref={beforeRef} className="ob-md" hidden dangerouslySetInnerHTML={{ __html: beforeHtml }} />
        <div ref={afterRef} className="ob-md nh-after" />
      </div>
    </div>
  )
}
