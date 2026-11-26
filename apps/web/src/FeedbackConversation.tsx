import { SendArea } from './SendArea'
import { createContext, useContext, useState } from 'react'
import { api, type FeedbackItem } from './api'
import { Icon } from './icons'
import { MemoText } from './memo'
import { onListKey } from './listInput'
import { SayCard } from './Conversation'
import { ApproveButton, resultToApprove } from './FeedbackAnswer'
import { BeforeAfter, FeedbackMockups, HandlingPictures } from './FeedbackViewer'
import { feedbackConversation, latestReply, lockedBefore, splitThread, summaryAt, summaryRows, tagKey, type ThreadStep } from './feedbackThread'
import { stateOf } from './feedbackBuckets'
import { plural, t } from './i18n'
import { feedbackLabel as label, REPLY, TAG_NOTES } from './feedbackTags'
import { href } from './router'

export const verdictName = (v: string) => REPLY[v] ?? label(v)
/** 피드백을 남기는 사람의 GitHub 계정: 대화에 "사용자 (계정)"으로 */
export const Account = createContext<string | null>(null)
/** 반영 커밋 옆: 지금 앱에 들어 있는지 (10/4 피드백 "반영했는지 어떻게 봐?"). 모르면 아무것도 안 붙인다 */
export function InApp({ e }: { e: FeedbackItem }) {
  if (e.inApp === undefined) return null
  return e.inApp
    ? <span className="fbp-inapp" data-ui="앱에 있음" title={t('이 커밋이 지금 쓰는 앱에 들어 있습니다', 'This commit is in the app you are using')}> · {t('앱에 있음', 'In app')}</span>
    : <span className="fbp-inapp need" data-ui="업데이트 필요" title={t('고친 코드가 아직 이 앱에 없습니다. 상단바의 새 버전 버튼이나 설정 › 앱 기본정보에서 업데이트하세요', 'The fix is not in this app yet. Update with the new version button in the top bar or in Settings › About this app')}> · {t('앱 업데이트 필요', 'App update needed')}</span>
}

/** "10-04 14:00" (reviews.yaml의 at: 2026-10-04T14:00) */
const whenOf = (at: string) => at.replace('T', ' ').slice(5, 16)
const FIELD_NAME = { understood: t('이해한 요구', 'Understood request'), cause: t('원인', 'Cause'), note: t('처리', 'Handling'), reply: t('최근 답', 'Latest reply') }

/**
 * 지금 처리 (10/8 시안 · 11/8 처리와 대화 나누기, 시안 N7ik 3절): 이해한 요구 · 원인 · 처리, 전후 그림, 반영 버전을 한 카드에.
 * 결과를 알린 답이면 카드에 「승인」 · 「의견 남기기」(대화 아래 입력란으로). 다시 처리하기 전의 글은 "고친 이력 n번"에 접는다 (revised).
 */
export function Summary({ e, onOpinion }: { e: FeedbackItem; onOpinion?(): void }) {
  const st = e.status!
  const rows = summaryRows(st)
  const revised = st.revised ?? []
  if (!rows.length && !revised.length) return null
  return (
    <div className="fbp-summary" data-ui="처리 요약">
      <div className="fbp-now-head"><span className="tag">{t('지금 처리', 'Current handling')}{summaryAt(st) ? ` · ${whenOf(summaryAt(st)!)}` : ''}</span></div>
      {rows.map((r) => (
        <div key={r.field} className="fbp-summary-row">
          <b>{FIELD_NAME[r.field]}</b><span className="fbp-summary-text"><MemoText text={r.text} /></span><span className="muted">{r.at ? whenOf(r.at) : ''}</span>
        </div>
      ))}
      <HandlingPictures e={e} />
      {st.commit && <span className="muted fbp-say-version fbp-now-version">{st.version ?? st.commit}<InApp e={e} /></span>}
      {revised.length > 0 && (
        <details className="fbp-earlier" data-ui="고친 이력">
          <summary>{t(`고친 이력 ${revised.length}번`, plural(revised.length, 'earlier version'))}</summary>
          {[...revised].reverse().map((h) => (
            <div key={h.at} className="fbp-summary-old">
              <span className="muted">{whenOf(h.handled_at ?? h.at)}</span>
              {(['understood', 'cause', 'note'] as const).map((f) => h[f] && <div key={f} className="fbp-summary-row"><b>{FIELD_NAME[f]}</b><span className="fbp-summary-text">{h[f]}</span><span /></div>)}<BeforeAfter e={e} pictures={h.pictures} />
            </div>
          ))}
        </details>
      )}
      <ApproveButton e={e} onOpinion={onOpinion} />
    </div>
  )
}

/**
 * 대화 (10/8 시안, 10/4 18:11 "반려한 지적을 댓글처럼"): 관리자의 처리와 답 · 사용자의 승인 · 수정 요청 · 코멘트를 시각순으로.
 * 마지막 주고받음만 펼치고 앞의 것은 접는다 (10/8 11:28).
 */
export function Conversation({ e, shut, onOpen }: { e: FeedbackItem; shut: boolean; onOpen(open: boolean): void }) {
  const steps = feedbackConversation(e)
  if (!steps.length) return null
  const { earlier, latest, folded } = splitThread(steps)
  // 처리 중 마지막 것에만 전후 그림과 "지금 앱에 있음"을 붙인다
  const lastHandling = steps.map((s) => s.kind === '처리' || s.kind === '다시 처리').lastIndexOf(true)
  const lastMine = steps.map((s) => s.who === '나').lastIndexOf(true)
  const locked = lockedBefore(steps)
  const notes = [...new Set(steps.map(tagKey))].filter((k): k is string => !!k && k in TAG_NOTES)
  let rejects = 0
  const numbered = steps.map((s) => (s.who === '나' && s.kind === '반려' ? ++rejects : 0))
  const say = (s: ThreadStep, i: number) => <Say key={i} e={e} s={s} n={numbered[i]!} latestHandling={i === lastHandling} locked={i < locked} undo={i === lastMine && i === steps.length - 1 && (s.kind === '승인' || s.kind === '반려' || s.kind === '진행' || s.kind === '중단' || s.kind === '논의')} />
  const body = (
    <div className="fbp-thread-box" data-ui="주고받은 기록">
      {folded > 0 && (
        <details className="fbp-earlier" data-ui="이전 주고받음">
          <summary>{t(`이전 주고받음 ${folded}번`, `${plural(folded, 'earlier exchange')}`)}</summary>
          <ol className="fbp-thread">{earlier.map(say)}</ol>
        </details>
      )}
      <ol className="fbp-thread">{latest.map((s, i) => say(s, earlier.length + i))}</ol>
      {notes.length > 0 && (
        // 태그 설명은 한 줄에 옆으로 늘어놓고, 뜻은 가리키면 툴팁으로 (10/13 수정: 태그마다 한 줄이면 여백이 크다)
        <div className="fbp-notes" data-ui="태그 설명">
          {/* 태그를 모은 표는 앱 소개에 (10/14 13:32 제안). 물음표는 "태그 설명" 바로 옆에 (10/15 14:11 수정) */}
          <span className="fbp-notes-k">{t('태그 설명', 'Tags')}<a className="icon-btn sm fbp-notes-help" href={href({ page: 'about', part: 'symbols', anchor: 'tags' })} data-ui="태그 표 보기" data-tip={t('태그 표 보기', 'See all tags')} aria-label={t('태그 표 보기', 'See all tags')}>{Icon.help}</a></span>
          {notes.map((k) => <span key={k} className="tag fbp-note tip-start tip-wrap" tabIndex={0} data-tip={TAG_NOTES[k]!.note} aria-label={`${TAG_NOTES[k]!.name}: ${TAG_NOTES[k]!.note}`}>{TAG_NOTES[k]!.name}</span>)}
        </div>
      )}
    </div>
  )
  // 끝난 항목 · 승인을 기다리는 결과 답은 카드만 펴고 대화는 접는다 (11/8 · 11/9 시안 N7ik 3절)
  return resultToApprove(e) || stateOf(e) === '승인'
    ? <details className="fbp-earlier fbp-thread-fold" data-ui="이전 주고받음" open={!shut} onToggle={(ev) => { if (ev.currentTarget.open === shut) onOpen(ev.currentTarget.open) }}><summary>{t(`주고받은 대화 ${steps.length}개`, plural(steps.length, 'message'))}</summary>{body}</details>
    : <>{e.status && <div className="fbp-thread-cap muted">{t('주고받은 대화', 'Conversation')}</div>}{body}</>
}

/** 대화 한 칸. 사용자 글은 관리자가 답하기 전까지 오른쪽 위 연필로 고친다 (고친 시각이 "고침 HH:MM"으로 붙는다) */
function Say({ e, s, n, latestHandling, locked, undo }: { e: FeedbackItem; s: ThreadStep; n: number; latestHandling: boolean; locked: boolean; undo: boolean }) {
  const user = useContext(Account)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  if (s.kind === '대기') return <li className="fbp-say-wait muted">{t('관리자가 다시 처리하기를 기다립니다', 'Waiting for the maintainer to rework it')}</li>
  const me = s.who === '나'
  const name = me ? (user ? `${t('사용자', 'User')} (${user})` : t('사용자', 'User')) : ('by' in s && s.by ? `${t('관리자', 'Maintainer')} (${s.by})` : t('관리자', 'Maintainer'))
  const what = s.kind === '반려' ? t(`${n}번째 반려`, `Revision ${n}`)
    : s.kind === '승인' || s.kind === '진행' || s.kind === '중단' || s.kind === '논의' || s.kind === '코멘트' ? verdictName(s.kind)
        : s.kind === '답' ? t('답만 함', 'Answered only')
          : 'commit' in s && s.commit ? t('앱에 반영됨', 'Applied to the app') : t('답만 함', 'Answered only')
  const at = 'at' in s ? s.at : undefined
  const edited = me && 'edited' in s ? s.edited : undefined
  const save = () => {
    if (!at || !draft.trim()) return
    api.editFeedbackNote(e.key, at, draft).then(() => { setEditing(false); setError(null) }).catch((err: Error) => setError(err.message))
  }
  const handling = s.kind === '처리' || s.kind === '다시 처리'
  // 마지막 처리 · 처리 뒤 마지막 답은 첫 줄만 적고 위 「지금 처리」 카드를 가리킨다 (11/8: 같은 글을 두 번 보이지 않게, 11/10 「최근 답」)
  const pointer = !!e.status && ((handling && latestHandling && summaryRows(e.status).length > 0) || (s.kind === '답' && latestReply(e.status)?.at === s.at))
  return (
    <SayCard me={me} ui={me ? '사용자 글' : '관리자 글'} name={name} tag={what}
      afterTag={undo && <button className="fb-link" title={t('마지막 답(승인 · 반려 · 진행 · 중단)을 되돌립니다', 'Undo the last answer (approve, revise, proceed or stop)')} onClick={() => void api.reviewFeedback(e.key, null).catch((err: Error) => setError(err.message))}>{t('되돌리기', 'Undo')}</button>}
      when={at && <>{whenOf(at)}{edited && ` · ${t('고침', 'edited')} ${edited.slice(11, 16)}`}</>}
      end={me && at && s.kind !== '승인' && !locked && !editing && <button className="icon-btn sm fbp-say-edit" data-tip={t('수정', 'Edit')} aria-label={t(`수정: ${whenOf(at)} 글`, `Edit: message at ${whenOf(at)}`)} onClick={() => { setDraft(s.note ?? ''); setEditing(true) }}>{Icon.pencil}</button>}>
      {editing
        ? (
          <div className="fbp-text">
            <SendArea className="fbp-input" autoFocus value={draft} onChange={(ev) => setDraft(ev.target.value)} onSend={save}
              onKeyDown={(ev) => { if (ev.key === 'Escape') setEditing(false); else onListKey(ev, setDraft) }} />
            <span className="fbp-edit on">
              <button className="btn" onClick={() => setEditing(false)}>{t('취소', 'Cancel')}</button>
              <button className="btn primary tip-end" disabled={!draft.trim()} data-tip={t('저장 (⌘↵)', 'Save (⌘↵)')} onClick={save}>{t('저장', 'Save')}</button>
            </span>
          </div>
        )
        : pointer
          ? <span>{(s.note ?? '').split('\n')[0]} <span className="muted">→ {t('내용은 위 「지금 처리」', 'see Current handling above')}</span></span>
          : s.note && <MemoText text={s.note} />}
      {handling && !pointer && 'commit' in s && s.commit && <span className="mono muted fbp-say-version">{s.commit}</span>}
      {!pointer && 'mockups' in s && <FeedbackMockups e={e} paths={s.mockups} />}{error && <span className="error-text">{error}</span>}
    </SayCard>
  )
}
