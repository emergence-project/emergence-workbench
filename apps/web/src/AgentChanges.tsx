import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { agentChatsApi, APP_RID, type Chat, type ChatItem, type ChatMessageBody } from './api'
import { t } from './i18n'
import { qk } from './queries'
import { Delta, reviewOf } from './AgentChats'

type Edit = Extract<ChatItem, { kind: 'edit' }>

/** 바뀐 곳에 단 코멘트를 에이전트에게 보낼 지시로 */
export function commentMessage(notes: { file: string; old: string; new: string; text: string }[]): ChatMessageBody {
  return {
    text: [t('변경사항에 코멘트를 달았습니다. 하나씩 반영해 주세요.', 'I commented on the changes. Please address each one.'), ...notes.map((n, i) => `${i + 1}. ${n.file}: ${n.text}`)].join('\n'),
    attach: notes.map((n) => ({ kind: 'selection' as const, ref: n.file, label: (n.new || n.old).slice(0, 40), text: [n.old && `- ${n.old}`, n.new && `+ ${n.new}`].filter(Boolean).join('\n').slice(0, 4000) })),
  }
}

/**
 * 변경사항에서 펼친 파일 (11/23 제안 「기본은 파일별로 접어 두자 · 일관되게」): 처음에는 파일 줄만, 눌러서 그 파일만 펼친다.
 * 파일이 하나여도 같다. 펼친 파일은 대화마다 기억하고(앱을 다시 열면 다시 접힘), 대화 줄의 「변경사항 보기」는 그 파일을 펼쳐 둔다.
 */
const openFiles = new Map<string, Set<string>>()
const openListeners = new Set<() => void>()
export function openChangeFile(chatId: string, file: string) {
  openFiles.set(chatId, new Set([...(openFiles.get(chatId) ?? []), file]))
  openListeners.forEach((f) => f())
}
function useOpenFiles(chatId: string): [Set<string>, (files: string[], open: boolean) => void] {
  const [, bump] = useState(0)
  useEffect(() => { const f = () => bump((n) => n + 1); openListeners.add(f); return () => { openListeners.delete(f) } }, [])
  const set = (files: string[], open: boolean) => {
    const next = new Set(openFiles.get(chatId) ?? [])
    files.forEach((f) => (open ? next.add(f) : next.delete(f)))
    openFiles.set(chatId, next); openListeners.forEach((f) => f())
  }
  return [openFiles.get(chatId) ?? new Set(), set]
}

/** 바뀐 곳: 파일마다 고친 문단(− · +), 문단을 누르면 코멘트, 모아서 에이전트에게 보내기. 승인 · 되돌리기는 수정 검토에서(파일 줄 오른쪽 「수정 검토 ›」, 10/28 21:39 정렬) */
export function Changes({ chat, onSaved }: { chat: Chat; onSaved(m: string): void }) {
  const client = useQueryClient()
  const edits = chat.items.filter((i): i is Edit => i.kind === 'edit')
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [open, setOpen] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [fail, setFail] = useState<string | null>(null)
  const files = [...new Set(edits.map((e) => e.file))]
  const ready = Object.entries(notes).filter(([, v]) => v.trim())
  const [opened, setOpened] = useOpenFiles(chat.id)
  // 코멘트를 단 파일은 접히지 않는다(쓰던 코멘트가 가려지지 않게)
  const noted = new Set(ready.map(([k]) => edits[Number(k.split(':')[0])]?.file))
  const isOpen = (f: string) => opened.has(f) || noted.has(f)
  const allOpen = files.every(isOpen)
  const send = async () => {
    const list = ready.map(([k, v]) => { const [ei, pi] = k.split(':').map(Number); const e = edits[ei!]!; const p = e.parts[pi!]!; return { file: e.file, old: p.old, new: p.new, text: v.trim() } })
    setBusy(true); setFail(null)
    try {
      client.setQueryData(qk.agentChat(chat.id), await agentChatsApi.send(chat.id, commentMessage(list)))
      setNotes({}); setOpen(null)
      onSaved(t('코멘트를 에이전트에게 보냈습니다', 'Comments sent to the agent'))
    } catch (e) { setFail(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }
  if (!edits.length) return null
  return (
    <section className="ac-changes" data-ui="바뀐 곳">
      <div className="ac-work-row ac-change-all">
        <span className="muted">{t(`파일 ${files.length}`, `${files.length} file(s)`)}</span>
        <span className="sp" />
        <button className="a" data-ui="바뀐 곳 모두 펼치기" onClick={() => setOpened(files, !allOpen)}>{allOpen ? t('모두 접기', 'Collapse all') : t('모두 펼치기', 'Expand all')}</button>
      </div>
      {files.map((f) => {
        const mine = edits.map((e, ei) => ({ e, ei })).filter((x) => x.e.file === f)
        const on = isOpen(f)
        return (
          <div key={f} className={`ac-change-file${on ? ' open' : ''}`}>
            <div className="ac-work-row">
              <button className="ac-change-head" data-ui="바뀐 파일 펼치기" aria-expanded={on} disabled={on && noted.has(f)} title={f} onClick={() => setOpened([f], !on)}>
                <span className="tree-chev" aria-hidden><span>›</span></span>
                <span className="mono ac-file">{f}</span>
                <Delta added={mine.reduce((s, x) => s + x.e.added, 0)} removed={mine.reduce((s, x) => s + x.e.removed, 0)} />
              </button>
              {chat.rid !== APP_RID && <button className="a ac-change-review" data-ui="수정 검토로" title={t('수정 검토에서 승인 · 되돌리기', 'Approve or revert in edit review')} onClick={() => reviewOf(chat.rid, f)}>{t('수정 검토 ›', 'Edit review ›')}</button>}
            </div>
            {on && mine.map(({ e, ei }) => e.parts.map((p, pi) => {
              const k = `${ei}:${pi}`
              return (
                <div key={k} className={`ac-diff ac-diff-part${open === k ? ' on' : ''}`}>
                  <button className="ac-diff-hit" data-ui="바뀐 곳 코멘트" aria-expanded={open === k} title={t('눌러서 코멘트', 'Click to comment')} onClick={() => setOpen(open === k ? null : k)}>
                    {p.old && <div className="ac-diff-old"><span aria-hidden>− </span>{p.old}</div>}
                    {p.new && <div className="ac-diff-new"><span aria-hidden>+ </span>{p.new}</div>}
                  </button>
                  {notes[k]?.trim() && open !== k && <div className="ac-diff-note"><b>{t('나', 'Me')}</b> · {notes[k]}</div>}
                  {open === k && <textarea className="ac-diff-input" rows={2} autoFocus value={notes[k] ?? ''} placeholder={t('이 고침에 코멘트', 'Comment on this change')} aria-label={t('코멘트', 'Comment')}
                    onChange={(ev) => setNotes({ ...notes, [k]: ev.target.value })}
                    onKeyDown={(ev) => { if (ev.key === 'Escape') { ev.preventDefault(); setOpen(null) } }} />}
                </div>
              )
            }))}
            {on && mine.at(-1)?.e.reason && <span className="muted ac-hint">{mine.at(-1)!.e.reason}</span>}
          </div>
        )
      })}
      {fail && <span className="error-text ac-hint">{fail}</span>}
      <div className="ac-card-row">
        <span className="muted ac-hint">{ready.length ? t(`코멘트 ${ready.length}개`, `${ready.length} comment(s)`) : t('문단을 누르면 코멘트를 답니다', 'Click a change to comment')}</span>
        <span className="sp" />
        <button className="btn primary sm" data-ui="코멘트 보내기" disabled={!ready.length || busy} onClick={() => void send()}>{t('에이전트에게 보내기', 'Send to the agent')}</button>
      </div>
    </section>
  )
}
