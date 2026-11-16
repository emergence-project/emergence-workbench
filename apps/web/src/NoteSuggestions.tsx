import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { agentEditsApi, type AgentKind, type EditSuggestion } from './api'
import { AgentLogo } from './agentLogos'
import { useConceptRender } from './ConceptNotes'
import { paintHistory } from './historyPaint'
import type { RenderOptions } from './ObsidianMarkdown'
import { renderNote } from './noteRender'
import { useAgentEdits } from './projectQueries'
import { qk } from './queries'
import { agentName } from './taskView'
import { t } from './i18n'

/**
 * 내 문단에 대한 에이전트 고침은 제안으로 (11/8 15:16 논의 → 11/16 「시안은 다 추천대로」, 시안 N7ik 2절 ②).
 * 내가 마지막에 쓴 문단(git 기록)은 에이전트가 바로 바꾸지 못하고 제안으로 남는다. 노트 파일은 그대로이고,
 * 읽는 본문에서 그 문단 바로 아래에 줄 그은 글 · 새 글로 겹쳐 보인다. 「받기」를 눌러야 파일에 쓴다(내 이름 + 에이전트 Co-Authored-By로 커밋).
 * 수정 검토 화면에도 같은 카드가 모인다.
 */

const NAME: Record<string, string> = { claude: 'Claude', 'claude-code': 'Claude', codex: 'Codex', gemini: 'Gemini' }
const KIND: Record<string, AgentKind> = { claude: 'claude-code', 'claude-code': 'claude-code', codex: 'codex', gemini: 'gemini' }
/** 옛 배치(notes/)와 주제 폴더 경로가 섞여도 노트 폴더 이름으로 맞춘다 */
const folder = (f: string) => f.split('/').slice(-2).join('/')

export function useNoteSuggestions(rid: string, file: string | undefined): EditSuggestion[] {
  const all = useAgentEdits(rid).data?.suggestions

  return useMemo(() => (all ?? []).filter((s) => file && s.target.kind === 'note' && (s.target.file === file || folder(s.target.file) === folder(file))), [all, file])
}

/** 제안 카드 하나: 머리(에이전트 · 내 문단 · 이유), 겹쳐 칠한 글, 받기 · 버리기 */
export function SuggestionCard({ s, rid, options, where }: { s: EditSuggestion; rid: string; options: RenderOptions; where?: boolean }) {
  const client = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [fail, setFail] = useState<string | null>(null)
  const beforeRef = useRef<HTMLDivElement>(null)
  const afterRef = useRef<HTMLDivElement>(null)
  const beforeHtml = useMemo(() => renderNote(s.before, options), [s.before, options])
  const afterHtml = useMemo(() => renderNote(s.after, options), [s.after, options])
  useLayoutEffect(() => {
    if (!beforeRef.current || !afterRef.current) return
    afterRef.current.innerHTML = afterHtml
    try { paintHistory(beforeRef.current, afterRef.current, 'nh-ins ag', 'nh-del') } catch { afterRef.current.innerHTML = afterHtml }
  }, [beforeHtml, afterHtml])
  const decide = async (take: boolean) => {
    setBusy(true); setFail(null)
    try {
      await agentEditsApi.decideSuggestion(s.id, take)
      void client.invalidateQueries({ queryKey: qk.agentEdits(rid) })
    } catch (e) { setFail(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }
  const kind = s.by ? KIND[s.by.toLowerCase()] : undefined
  return (
    <div className="ns-card" data-ui="제안" data-ui-item={s.section ?? s.title}>
      <div className="ns-head">
        {kind && <AgentLogo agent={kind} />}
        <b>{s.by ? NAME[s.by.toLowerCase()] ?? agentName(s.by) : t('에이전트', 'Agent')}</b>
        <span className="ns-tag">{t('제안 · 내 문단', 'Suggestion · your paragraph')}</span>
        {where && <span className="muted ns-where" title={s.target.kind === 'note' ? s.target.file : ''}>{s.title}{s.section ? ` › ${s.section}` : ''}</span>}
        <span className="sp" />
        <button className="btn sm" disabled={busy} data-ui="제안 버리기" onClick={() => void decide(false)}>{t('버리기', 'Discard')}</button>
        <button className="btn sm primary" disabled={busy} data-ui="제안 받기" title={t('노트 파일에 씁니다', 'Writes it into the note file')} onClick={() => void decide(true)}>{t('받기', 'Take')}</button>
      </div>
      {s.reason && <p className="ns-reason">{t('이유', 'Why')} · {s.reason}</p>}
      <div ref={beforeRef} className="ob-md" hidden dangerouslySetInnerHTML={{ __html: beforeHtml }} />
      <div ref={afterRef} className="ob-md ns-text" />
      {!s.after && <p className="muted ns-none">{t('이 문단을 지우자는 제안', 'Suggests removing this paragraph')}</p>}
      {fail && <p className="error-text">{fail}</p>}
    </div>
  )
}

/** 수정 검토 화면의 절: 그 프로젝트의 제안 모두 */
export function SuggestionsSection({ list, rid }: { list: EditSuggestion[]; rid: string }) {
  const options = useConceptRender(rid)
  if (!list.length) return null
  return (
    <section className="ae-sec" data-ui="내 문단 제안">
      <h2 className="ae-h">{t('내 문단에 대한 제안', 'Suggestions on your paragraphs')} <span className="rail-count">{list.length}</span></h2>
      <p className="muted ae-hint">{t('내가 쓴 문단이라 에이전트가 파일을 바꾸지 않았습니다. 받기를 눌러야 노트에 씁니다.', 'You wrote these paragraphs, so the agent did not change the file. Take writes it into the note.')}</p>
      {list.map((s) => <SuggestionCard key={s.id} s={s} rid={rid} options={options} where />)}
    </section>
  )
}

/** 문단 글에서 비교할 앞부분: Markdown 기호와 수식을 뺀 글자 (빈칸 없이) */
const keyOf = (md: string) => md.replace(/\$\$[\s\S]*?\$\$|\$[^$\n]*\$|\\\(.*?\\\)/g, ' ').replace(/[#>*_`[\]()!-]/g, ' ').replace(/\s+/g, '').slice(0, 24)

/**
 * 읽는 본문에서 제안마다 그 문단 바로 아래에 카드를 둔다(못 찾으면 본문 맨 위). body = 본문을 그린 요소
 */
export function NoteSuggestions({ rid, file, body, options }: { rid: string; file: string; body: React.RefObject<HTMLElement | null>; options: RenderOptions }) {
  const list = useNoteSuggestions(rid, file)
  // 제안마다 자리 표시 하나(그대로 둔다). 본문은 수식 · 그림을 그리며 다시 쓰여 끼운 자리가 빠질 수 있어, 빠지면 다시 끼운다
  const hosts = useMemo(() => new Map(list.map((s) => { const h = document.createElement('div'); h.className = 'ns-host'; return [s.id, h] as const })), [list])
  // 본문 요소의 ref는 이 컴포넌트의 레이아웃 효과보다 늦게 붙으므로(부모) 그린 뒤의 효과에서 끼운다
  useEffect(() => {
    const el = body.current
    if (!el || !hosts.size) return
    const place = () => {
      const root = el.querySelector('.ob-md') ?? el
      for (const s of list) {
        const host = hosts.get(s.id)!
        if (host.isConnected && root.contains(host)) continue
        const key = keyOf(s.before)
        const at = key ? [...root.children].find((c) => !c.classList.contains('ns-host') && (c.textContent ?? '').replace(/\s+/g, '').includes(key)) : undefined
        if (at) at.after(host)
        else root.prepend(host)
      }
    }
    place()
    const watch = new MutationObserver(place)
    watch.observe(el, { childList: true, subtree: true })
    return () => { watch.disconnect(); hosts.forEach((h) => h.remove()) }
  }, [hosts, list, body])
  return <>{list.map((s) => createPortal(<SuggestionCard s={s} rid={rid} options={options} />, hosts.get(s.id)!, s.id))}</>
}
