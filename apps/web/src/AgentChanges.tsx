import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { agentChatsApi, APP_RID, type Chat, type ChatItem, type ChatMessageBody } from './api'
import { t } from './i18n'
import { qk } from './queries'
import { go } from './router'
import { WorkAside } from './WorkAside'

/** 에이전트 대화의 변경사항: +n −n · 바뀐 곳(코멘트 달기) · 오른쪽 칸의 변경사항 보기 (AgentChats.tsx에서 나눔, 11/23) */

/** +n −n (노트 고침에서 더하고 뺀 줄) */
export function Delta({ added, removed }: { added: number; removed: number }) {
  return <span className="ac-delta"><span className="ac-add">+{added}</span><span className="ac-del">−{removed}</span></span>
}

export const reviewOf = (rid: string, file: string) => go({ page: 'review', key: `note:${rid}:${file}` })

type Edit = Extract<ChatItem, { kind: 'edit' }>

/** 바뀐 곳에 단 코멘트를 에이전트에게 보낼 지시로 */
export function commentMessage(notes: { file: string; old: string; new: string; text: string }[]): ChatMessageBody {
  return {
    text: [t('변경사항에 코멘트를 달았습니다. 하나씩 반영해 주세요.', 'I commented on the changes. Please address each one.'), ...notes.map((n, i) => `${i + 1}. ${n.file}: ${n.text}`)].join('\n'),
    attach: notes.map((n) => ({ kind: 'selection' as const, ref: n.file, label: (n.new || n.old).slice(0, 40), text: [n.old && `- ${n.old}`, n.new && `+ ${n.new}`].filter(Boolean).join('\n').slice(0, 4000) })),
  }
}

/** 바뀐 곳: 파일마다 고친 문단(− · +), 문단을 누르면 코멘트, 모아서 에이전트에게 보내기. 승인 · 되돌리기는 수정 검토에서(파일 줄 오른쪽 「수정 검토 ›」, 10/28 21:39 정렬) */
function Changes({ chat, onSaved }: { chat: Chat; onSaved(m: string): void }) {
  const client = useQueryClient()
  const edits = chat.items.filter((i): i is Edit => i.kind === 'edit')
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [open, setOpen] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [fail, setFail] = useState<string | null>(null)
  const files = [...new Set(edits.map((e) => e.file))]
  const ready = Object.entries(notes).filter(([, v]) => v.trim())
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
      {files.map((f) => {
        const mine = edits.map((e, ei) => ({ e, ei })).filter((x) => x.e.file === f)
        return (
          <div key={f} className="ac-change-file">
            <div className="ac-work-row">
              <span className="mono ac-file" title={f}>{f}</span>
              <Delta added={mine.reduce((s, x) => s + x.e.added, 0)} removed={mine.reduce((s, x) => s + x.e.removed, 0)} />
              {chat.rid !== APP_RID && <button className="a ac-change-review" data-ui="수정 검토로" title={t('수정 검토에서 승인 · 되돌리기', 'Approve or revert in edit review')} onClick={() => reviewOf(chat.rid, f)}>{t('수정 검토 ›', 'Edit review ›')}</button>}
            </div>
            {mine.map(({ e, ei }) => e.parts.map((p, pi) => {
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
            {mine.at(-1)?.e.reason && <span className="muted ac-hint">{mine.at(-1)!.e.reason}</span>}
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

/** 변경사항이 있는 대화의 +n −n (머리의 변경사항 아이콘에 붙는다). 고친 곳이 없거나 앱 기계 대화면 null */
export function chatDelta(chat: Chat | undefined): { added: number; removed: number } | null {
  if (!chat || chat.machine) return null
  const edits = chat.items.filter((i): i is Edit => i.kind === 'edit')
  return edits.length ? { added: edits.reduce((s, e) => s + e.added, 0), removed: edits.reduce((s, e) => s + e.removed, 0) } : null
}

/** 오른쪽 칸의 변경사항 보기: 칸 맨 위부터 전체 높이. 머리 한 줄에 파일 수와 컨텍스트 %를 둔다 (11/23 시안 agent-side-views) */
export function ChangesColumn({ chat, onSaved }: { chat: Chat; onSaved(m: string): void }) {
  const files = new Set(chat.items.flatMap((i) => (i.kind === 'edit' ? [i.file] : []))).size
  const context = [...chat.items].reverse().find((i): i is Extract<ChatItem, { kind: 'result' }> => i.kind === 'result' && !!i.context)?.context
  return (
    <WorkAside ui="변경사항 칸">
      <h3 className="ac-view-head">{t('변경사항', 'Changes')} <span className="muted">{[t(`파일 ${files}`, `${files} file${files > 1 ? 's' : ''}`), context && t(`컨텍스트 ${Math.round(Math.min(1, context.used / context.window) * 100)}%`, `context ${Math.round(Math.min(1, context.used / context.window) * 100)}%`)].filter(Boolean).join(' · ')}</span></h3>
      <Changes chat={chat} onSaved={onSaved} />
    </WorkAside>
  )
}
