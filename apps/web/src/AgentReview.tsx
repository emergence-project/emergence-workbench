// Claude가 쓰고 Codex가 검토 (11/9 사용자 결정, 시안 https://claude.ai/artifact/3rzyEjiuLgnmBvmWLJoER8 1절)
// Claude 대화 머리의 「Codex 검토」 · 입력란 /codex: 읽기만 하는 Codex가 고친 곳 · 요청 · 마지막 답을 읽고 카드를 붙인다.
// 카드의 「Claude에게 넘기기」는 검토 글을 입력란에 넣는다(보내기 전에 고칠 수 있다). 에이전트끼리 저절로 주고받지 않는다
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { agentChatsApi, type Chat, type ChatItem } from './api'
import { AgentChip, isClaude, useAgentKinds, useAgentPrefs } from './AgentPick'
import { t } from './i18n'
import { qk } from './queries'

type Review = Extract<ChatItem, { kind: 'review' }>
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** Codex가 이 컴퓨터에 깔리고 로그인했고, 설정 › 에이전트의 하는 일이 검토 · 둘 다인가 */
export function useReviewer(): boolean {
  const codex = useAgentKinds()?.find((k) => k.id === 'codex')
  const role = useAgentPrefs()?.per.codex?.role ?? 'both'
  return !!codex?.installed && codex.login !== false && role !== 'write'
}

/** 입력란의 /codex: 검토를 부른다 (노트 검토 /검토와 다름) */
export const isReviewCommand = (text: string) => /^\/codex\s*$/i.test(text.trim())

/** 검토 글의 한 줄: 고칠 것 · 볼 것 · 그 밖 */
export function reviewLines(text: string): { level: 'fix' | 'look' | 'none' | 'other'; text: string }[] {
  return text.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const m = /^[-*\d.)\s]*(고칠 것|볼 것|fix|check)\s*[:：]\s*(.*)$/i.exec(l)
    if (m) return { level: /^(고칠 것|fix)$/i.test(m[1]!) ? 'fix' : 'look', text: m[2]! }
    return { level: /^(고칠 것 없음|nothing to fix)/i.test(l) ? 'none' : 'other', text: l }
  })
}

/** 「Claude에게 넘기기」로 입력란에 넣는 글 */
export const passText = (text: string) => t(`Codex가 검토했습니다. 맞는 것은 고치고, 아니면 왜 아닌지 알려 줘.\n\n${text}`, `Codex reviewed the work. Fix what is right, and tell me why for anything you disagree with.\n\n${text}`)

/** 대화 머리의 「Codex 검토」 (Claude 대화에서만, Codex가 검토할 수 있을 때) */
export function ReviewButton({ chat, onError }: { chat: Chat; onError(m: string): void }) {
  const ok = useReviewer()
  const client = useQueryClient()
  const [going, setGoing] = useState(false)
  if (!ok || !isClaude(chat.agent)) return null
  const busy = going || chat.items.some((i) => i.kind === 'review' && i.text === undefined && !i.error)
  const run = async () => {
    setGoing(true)
    try { client.setQueryData(qk.agentChat(chat.id), await agentChatsApi.review(chat.id)) } catch (e) { onError(msg(e)) } finally { setGoing(false) }
  }
  return <button className="btn sm" data-ui="Codex 검토" disabled={busy} data-tip={t('읽기만 하는 Codex가 고친 곳과 마지막 답을 검토합니다', 'Codex reads the changes and the latest answer, without editing')} onClick={() => void run()}>{t('Codex 검토', 'Codex review')}</button>
}

/** 대화 안의 검토 카드: Codex 로고 · 무엇을 봤는지 · 고칠 것 / 볼 것 · 「Claude에게 넘기기」 · 「다시 검토」 */
export function ReviewCard({ chat, it, onPass, onError }: { chat: Chat; it: Review; onPass?(text: string): void; onError(m: string): void }) {
  const client = useQueryClient()
  const pending = it.text === undefined && !it.error
  const again = async () => { try { client.setQueryData(qk.agentChat(chat.id), await agentChatsApi.review(chat.id)) } catch (e) { onError(msg(e)) } }
  const last = [...chat.items].reverse().find((i) => i.kind === 'review') === it
  return (
    <li className="ac-review" data-ui="검토 카드" title={new Date(it.at).toLocaleString()}>
      <div className="ac-review-top">
        <AgentChip agent={it.by} /><span className="ac-review-name">{t('검토', 'review')}</span>
        <span className="muted">{it.edits ? t(`고친 ${it.edits}곳 · 요청 · 마지막 답을 봄`, `${it.edits} change${it.edits > 1 ? 's' : ''} · request · latest answer`) : t('요청 · 마지막 답을 봄', 'request · latest answer')}{it.auto && t(' · 자동', ' · automatic')}</span>
        {it.seconds !== undefined && <span className="muted ac-review-time">{t(`${it.seconds}초`, `${it.seconds}s`)}</span>}
      </div>
      {pending ? <div className="muted">{t('Codex가 읽는 중…', 'Codex is reading…')}</div>
        : it.error ? <div className="error-text">! {it.error}</div>
        : <ol className="ac-review-list">{reviewLines(it.text ?? '').map((l, i) => (
          <li key={i} className={l.level}>{l.level === 'fix' && <span className="ac-review-lv fix">{t('고칠 것', 'Fix')}</span>}{l.level === 'look' && <span className="ac-review-lv">{t('볼 것', 'Check')}</span>}{l.text}</li>
        ))}</ol>}
      {!pending && last && (
        <div className="ac-review-act">
          {it.text && onPass && !reviewLines(it.text).every((l) => l.level === 'none') && <button className="btn sm primary" data-ui="Claude에게 넘기기" onClick={() => onPass(passText(it.text!))}>{t('Claude에게 넘기기', 'Pass to Claude')}</button>}
          <button className="btn sm" data-ui="다시 검토" onClick={() => void again()}>{t('다시 검토', 'Review again')}</button>
          <span className="muted ac-hint">{t('넘기기 전에는 Claude가 보지 않음', 'Claude does not see it until you pass it')}</span>
        </div>
      )}
    </li>
  )
}
