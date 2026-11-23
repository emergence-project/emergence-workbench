// Claude가 쓰고 다른 에이전트가 검토 (11/9 사용자 결정, 시안 https://claude.ai/artifact/3rzyEjiuLgnmBvmWLJoER8 1절)
// 사이드바 「검토」 칸 · 입력란 /codex: 읽기만 하는 에이전트가 고친 곳 · 요청 · 마지막 답을 읽고 카드를 붙인다.
// 11/23 사용자 결정 "여러 에이전트에게 동시 검토, 호출한 에이전트 각각이 독립 검토": 고른 검토자(Codex · Gemini) 각각이 같은 글을 따로 읽고 카드를 하나씩 붙인다.
// 카드의 「Claude에게 넘기기」는 검토 글을 입력란에 넣는다(보내기 전에 고칠 수 있다). 에이전트끼리 저절로 주고받지 않는다
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { agentChatsApi, type Chat, type ChatItem, type Reviewer } from './api'
import { AGENT_NAME, AgentChip, isClaude, useAgentKinds, useAgentPrefs } from './AgentPick'
import { t } from './i18n'
import { qk } from './queries'
import { store } from './store'

type Review = Extract<ChatItem, { kind: 'review' }>
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e))
/** 검토할 수 있는 에이전트 (계약의 REVIEWERS와 같은 값. 값을 가져오면 화면 번들에 zod가 들어가서 여기 다시 적는다) */
const REVIEWERS: Reviewer[] = ['codex', 'gemini']
const isReviewer = (a: string): a is Reviewer => REVIEWERS.some((r) => r === a)
const PICK_KEY = 'rw-review-by'

/** 이 컴퓨터에 깔리고 로그인했고, 설정 › 에이전트의 하는 일이 검토 · 둘 다인 검토자 */
export function useReviewers(): Reviewer[] {
  const kinds = useAgentKinds()
  const per = useAgentPrefs()?.per
  return REVIEWERS.filter((a) => { const k = kinds?.find((x) => x.id === a); return !!k?.installed && k.login !== false && (per?.[a]?.role ?? 'both') !== 'write' })
}

/** 검토를 맡길 에이전트 고르기 (이 브라우저에 기억). 고른 것이 없으면 쓸 수 있는 첫 검토자 */
function usePick(avail: Reviewer[]) {
  const [saved, setSaved] = useState<Reviewer[]>(() => store.get<Reviewer[]>(PICK_KEY, ['codex']))
  const on = saved.filter((a) => avail.includes(a))
  const pick = on.length ? on : avail.slice(0, 1)
  const toggle = (a: Reviewer) => { const next = pick.includes(a) ? pick.filter((x) => x !== a) : [...pick, a]; if (!next.length) return; setSaved(next); store.set(PICK_KEY, next) }
  return { pick, toggle }
}

const pendingOf = (chat: Chat) => new Set(chat.items.filter((i): i is Review => i.kind === 'review' && i.text === undefined && !i.error).map((i) => i.by))

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
export const passText = (text: string, by = 'Codex') => t(`${by}가 검토했습니다. 맞는 것은 고치고, 아니면 왜 아닌지 알려 줘.\n\n${text}`, `${by} reviewed the work. Fix what is right, and tell me why for anything you disagree with.\n\n${text}`)

/** 고른 검토자 각각에게 검토를 맡긴다 (이미 읽는 중인 검토자는 서버가 건너뛴다) */
function useRun(chat: Chat, onError: (m: string) => void) {
  const client = useQueryClient()
  const [going, setGoing] = useState(false)
  const run = async (by: Reviewer[]) => {
    setGoing(true)
    try { client.setQueryData(qk.agentChat(chat.id), await agentChatsApi.review(chat.id, by)) } catch (e) { onError(msg(e)) } finally { setGoing(false) }
  }
  return { going, run }
}

/** 대화 머리의 검토 단추 (사이드바가 없는 패널 · 탭 대화, Claude 대화에서만): 사이드바 검토 칸에서 고른 검토자들에게 */
export function ReviewButton({ chat, onError }: { chat: Chat; onError(m: string): void }) {
  const avail = useReviewers()
  const { pick } = usePick(avail)
  const { going, run } = useRun(chat, onError)
  if (!avail.length || !isClaude(chat.agent)) return null
  const pending = pendingOf(chat)
  const names = pick.map((a) => AGENT_NAME[a]).join(' · ')
  return <button className="btn sm" data-ui="검토 버튼" disabled={going || pick.every((a) => pending.has(a))} data-tip={t(`읽기만 하는 ${names}가 고친 곳과 마지막 답을 각자 검토합니다`, `${names} each read the changes and the latest answer, without editing`)} onClick={() => void run(pick)}>{t(`${names} 검토`, `${names} review`)}</button>
}

/** 사이드바의 「검토」 칸 (11/23 안 B): 검토자 고르기(Codex · Gemini) · 「검토하기」와 지난 검토(최근 것 먼저). 카드 자체는 대화 줄에 그대로 있다 */
export function ReviewPane({ chat, onError }: { chat: Chat; onError(m: string): void }) {
  const reviews = chat.items.filter((i): i is Review => i.kind === 'review').reverse()
  const avail = useReviewers()
  const { pick, toggle } = usePick(avail)
  const { going, run } = useRun(chat, onError)
  const pending = pendingOf(chat)
  return (
    <section data-ui="검토 칸">
      <div className="ac-work-row ac-review-pane-h"><h3>{t('검토', 'Review')}</h3>
        {avail.length > 0 && <button className="btn sm" data-ui="검토하기" disabled={going || pick.every((a) => pending.has(a))} onClick={() => void run(pick)}>{t('검토하기', 'Review')}</button>}</div>
      {avail.length > 0 && <div className="ac-review-pick" data-ui="검토자 고르기" role="group" aria-label={t('검토자', 'Reviewers')}>
        {avail.map((a) => (
          <label key={a} className="ac-review-who"><input type="checkbox" checked={pick.includes(a)} disabled={pick.length === 1 && pick.includes(a)} onChange={() => toggle(a)} /><AgentChip agent={a} />{pending.has(a) && <span className="muted">{t('읽는 중…', 'reading…')}</span>}</label>
        ))}
      </div>}
      <span className="muted ac-hint">{t('고른 에이전트 각각이 읽기만 하면서 고친 곳 · 요청 · 마지막 답을 따로 읽습니다. 서로의 검토는 보지 않고, 결과 카드는 대화에도 하나씩 붙습니다', 'Each chosen agent reads the changes, the request and the latest answer on its own, without editing or seeing the others. Each result card also goes into the conversation')}</span>
      {!reviews.length && <span className="muted ac-hint">{t('아직 검토가 없습니다', 'No reviews yet')}</span>}
      {reviews.map((it) => {
        const lines = it.text ? reviewLines(it.text) : []
        const fix = lines.filter((l) => l.level === 'fix').length, look = lines.filter((l) => l.level === 'look').length
        return (
          <details key={`${it.at}-${it.by}`} className="ac-review-past" data-ui="지난 검토">
            <summary><AgentChip agent={it.by} /> <span className="muted">{new Date(it.at).toLocaleString()}</span> · {it.text === undefined && !it.error ? t('읽는 중…', 'Reading…') : it.error ? t('오류', 'Error') : fix || look ? t(`고칠 것 ${fix} · 볼 것 ${look}`, `${fix} to fix · ${look} to check`) : t('고칠 것 없음', 'Nothing to fix')}</summary>
            {it.error ? <div className="error-text">! {it.error}</div> : <ol className="ac-review-list">{lines.map((l, i) => (
              <li key={i} className={l.level}>{l.level === 'fix' && <span className="ac-review-lv fix">{t('고칠 것', 'Fix')}</span>}{l.level === 'look' && <span className="ac-review-lv">{t('볼 것', 'Check')}</span>}{l.text}</li>
            ))}</ol>}
          </details>
        )
      })}
    </section>
  )
}

/** 대화 안의 검토 카드: 검토한 에이전트 로고 · 무엇을 봤는지 · 고칠 것 / 볼 것 · 「Claude에게 넘기기」 · 「다시 검토」 */
export function ReviewCard({ chat, it, onPass, onError }: { chat: Chat; it: Review; onPass?(text: string): void; onError(m: string): void }) {
  const { run } = useRun(chat, onError)
  const pending = it.text === undefined && !it.error
  const name = AGENT_NAME[it.by]
  // 검토자마다 마지막 카드에만 넘기기 · 다시 검토 (여럿이 동시에 검토하면 카드가 검토자마다 하나씩)
  const last = [...chat.items].reverse().find((i) => i.kind === 'review' && i.by === it.by) === it
  return (
    <li className={`ac-review ${it.by}`} data-ui="검토 카드" title={new Date(it.at).toLocaleString()}>
      <div className="ac-review-top">
        <AgentChip agent={it.by} /><span className="ac-review-name">{t('검토', 'review')}</span>
        <span className="muted">{it.edits ? t(`고친 ${it.edits}곳 · 요청 · 마지막 답을 봄`, `${it.edits} change${it.edits > 1 ? 's' : ''} · request · latest answer`) : t('요청 · 마지막 답을 봄', 'request · latest answer')}{it.auto && t(' · 자동', ' · automatic')}</span>
        {it.seconds !== undefined && <span className="muted ac-review-time">{t(`${it.seconds}초`, `${it.seconds}s`)}</span>}
      </div>
      {pending ? <div className="muted">{t(`${name}가 읽는 중…`, `${name} is reading…`)}</div>
        : it.error ? <div className="error-text">! {it.error}</div>
        : <ol className="ac-review-list">{reviewLines(it.text ?? '').map((l, i) => (
          <li key={i} className={l.level}>{l.level === 'fix' && <span className="ac-review-lv fix">{t('고칠 것', 'Fix')}</span>}{l.level === 'look' && <span className="ac-review-lv">{t('볼 것', 'Check')}</span>}{l.text}</li>
        ))}</ol>}
      {!pending && last && (
        <div className="ac-review-act">
          {it.text && onPass && !reviewLines(it.text).every((l) => l.level === 'none') && <button className="btn sm primary" data-ui="Claude에게 넘기기" onClick={() => onPass(passText(it.text!, name))}>{t('Claude에게 넘기기', 'Pass to Claude')}</button>}
          <button className="btn sm" data-ui="다시 검토" onClick={() => { if (isReviewer(it.by)) void run([it.by]) }}>{t('다시 검토', 'Review again')}</button>
          <span className="muted ac-hint">{t('넘기기 전에는 Claude가 보지 않음', 'Claude does not see it until you pass it')}</span>
        </div>
      )}
    </li>
  )
}
