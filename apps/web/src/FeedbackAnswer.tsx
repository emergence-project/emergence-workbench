import { useState } from 'react'
import { api, type FeedbackItem } from './api'
import { PictureGallery, type GalleryPicture } from './PictureGallery'
import { ComposeBox } from './Conversation'
import { asksUser, feedbackBucket, stateOf } from './feedbackBuckets'
import { t } from './i18n'
import { REPLY, REPLY_MEANING } from './feedbackTags'
import { Icon } from './icons'

// 피드백 항목에 답하는 부품 (11/8 처리와 대화 나누기, 시안 N7ik 3절): 지금 처리 카드의 승인 · 전후 그림, 대화 아래 입력란. 피드백 화면과 폰 내 차례가 함께 쓴다

/** 사용자가 아직 손대지 않은 결과 답(묻는 답 · 끝난 것 빼고): 대화를 접고 카드의 「승인」 · 「의견 남기기」만 보인다 (11/9 시안 N7ik 3절) */
export const resultToApprove = (e: FeedbackItem) => answerable(e) && !asksUser(e)

/** 결과를 알린 답이나 묻는 답에 사용자가 답할 수 있는 때 (승인 · 중단으로 끝났거나 관리자 차례면 아니다) */
export const answerable = (e: FeedbackItem) => {
  const st = stateOf(e)
  return !!e.status && st !== '대기' && st !== '승인' && (asksUser(e) || st === '반영' || st === '답변' || st === '거절' || st === '나중에')
}

/**
 * 지금 처리 카드의 「승인」: 결과를 알린 답에만. 승인이 아닌 의견은 아래 입력란에서.
 * onOpinion이 있으면 옆에 「의견 남기기」(11/9 시안 N7ik 3절 승인): 접어 둔 대화를 펼치고 입력란으로 간다
 */
export function ApproveButton({ e, onOpinion }: { e: FeedbackItem; onOpinion?(): void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (asksUser(e) || !answerable(e)) return null
  const send = () => {
    setBusy(true)
    api.reviewFeedback(e.key, '승인').then(() => setError(null), (err: Error) => setError(err.message)).finally(() => setBusy(false))
  }
  return (
    <div className="fbp-now-act">
      {error && <span className="error-text">{error}</span>}
      {onOpinion && <button className="btn" data-ui="의견 남기기" title={t('승인하기 전에 진행 · 질문 · 논의 · 반려를 적습니다', 'Go ahead, ask, discuss or send back before approving')} onClick={onOpinion}>{t('의견 남기기', 'Leave a reply')}</button>}
      <button className="btn primary" data-ui="처리 승인" disabled={busy} title={t('이 처리를 그대로 끝냅니다', 'Accept this handling as is')} onClick={send}>{t('승인', 'Approve')}</button>
    </div>
  )
}

/** 지금 처리의 전후 그림: 누르면 크게 띄워 ← →로 넘겨 본다 (10/13 진행) */
export function HandlingPictures({ e }: { e: FeedbackItem }) {
  const [big, setBig] = useState<number | null>(null)
  const gallery: GalleryPicture[] = (e.status?.pictures ?? []).slice(0, 2).map((p, k) => ({
    src: `/api/feedback/picture?path=${encodeURIComponent(p)}`,
    label: k ? t('후', 'After') : t('전', 'Before'),
    alt: k ? t('고친 뒤 화면', 'Screen after the fix') : t('수정 전 화면', 'Screen before the fix'),
  }))
  if (!gallery.length) return null
  return (
    <div className="fbp-pictures" data-ui="전후 그림">
      {gallery.map((g, k) => (
        <figure key={g.src}>
          <button type="button" className="fbp-picture" data-tip={t('크게 보기', 'View larger')} aria-label={`${t('크게 보기', 'View larger')}: ${g.alt}`} onClick={() => setBig(k)}><img src={g.src} alt={g.alt} /></button>
          <figcaption className="muted">{g.label}</figcaption>
        </figure>
      ))}
      {big !== null && <PictureGallery pictures={gallery} start={big} onClose={() => setBig(null)} />}
    </div>
  )
}

/**
 * 아래 입력란 (10/8 시안 · 11/8 시안 N7ik 3절): 승인이 아닌 의견은 여기서 종류를 고르고 글을 적어 「보내기」. 의견은 주고받은 대화에 남는다.
 * - 결과를 알린 답(반영 · 답변 · 거절 · 나중에): 진행 · 질문 · 논의 · 반려. 승인은 위 지금 처리 카드에.
 * - 결정을 묻는 답(확인 필요 · 동의 · 물음이 붙은 보류 · 답변): 진행 · 질문 · 논의 · 중단.
 * 순서는 받아들이는 쪽에서 거부하는 쪽으로 (11/9 09:22 코멘트).
 * - 끝났거나 관리자 차례가 아니면 질문만.
 * 질문(자료 값 코멘트) · 반려 · 논의는 글이 있어야 보낸다. 진행 · 중단은 글 없이도 보내고, 글이 있으면 함께 적힌다.
 * 질문은 처리를 그대로 두고 묻는다(관리자가 답만 한다). 반려 · 진행 · 논의는 다시 처리하게 돌려보낸다(논의는 고치지 않고 시안 · 물음으로). 중단은 그대로 끝낸다.
 */
type Opinion = '코멘트' | '반려' | '진행' | '중단' | '논의'
const NEEDS_TEXT: Opinion[] = ['반려', '논의', '코멘트']
export function Compose({ e, focus }: { e: FeedbackItem; focus?: boolean }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [picked, setPicked] = useState<Opinion | null>(null)
  const choices: Opinion[] = !answerable(e) ? ['코멘트'] : asksUser(e) ? ['진행', '코멘트', '논의', '중단'] : ['진행', '코멘트', '논의', '반려']
  // 결정을 묻는 답은 「진행」이 골라진 채로 시작해 그대로 보내면 된다 (11/8 20:41 시안 코멘트). 나머지는 질문
  const choice = picked && choices.includes(picked) ? picked : choices.includes('진행') && asksUser(e) ? '진행' : '코멘트'
  const canSend = !NEEDS_TEXT.includes(choice) || !!text.trim()
  const send = () => {
    setBusy(true)
    ;(choice === '코멘트' ? api.commentFeedback(e.key, text) : api.reviewFeedback(e.key, choice, text))
      .then(() => { setText(''); setPicked(null); setError(null) }, (err: Error) => setError(err.message)).finally(() => setBusy(false))
  }
  // 관리자 차례(처리 전 · 코멘트에 답하기 전 · 다시 처리하기 전)에는 입력란을 두지 않는다 (10/10 13:02)
  const hint = NEEDS_TEXT.includes(choice) ? `${REPLY_MEANING[choice]}: ${t('적어 주세요', 'write it here')}` : `${REPLY_MEANING[choice]} · ${t('덧붙일 말 (선택)', 'anything to add (optional)')}`
  return (
    <ComposeBox value={text} onChange={setText} placeholder={hint} error={error} focus={focus}
      waiting={feedbackBucket(e) === '대기' ? t('관리자의 답을 기다립니다', 'Waiting for the maintainer to answer') : undefined}
      lead={choices.length > 1 && (
        <div className="segmented fbp-opinion" role="radiogroup" data-ui="의견 종류" aria-label={t('의견 종류', 'Kind of reply')}>
          {choices.map((c) => <button key={c} type="button" role="radio" aria-checked={c === choice} className={c === choice ? 'on' : ''} title={REPLY_MEANING[c]} onClick={() => setPicked(c)}>{REPLY[c]}</button>)}
        </div>
      )}>
        <button className="btn primary" disabled={busy || !canSend} title={canSend ? undefined : t('글을 적어야 보낼 수 있습니다', 'Write something to send this')} onClick={send}>{t('보내기', 'Send')}</button>
    </ComposeBox>
  )
}

/**
 * 에이전트가 맡아 처리 중인 항목 (11/9 사용자 "맡은 스레드를 잃어버리면 맡음만 남을 수 있어"): 누가 언제 맡았고 언제 저절로 풀리는지,
 * 그리고 기다리지 않고 바로 푸는 ×. 풀면 다음 처리(정기 작업 · 대화 · 바로 맡기기)가 다시 맡을 수 있다
 */
export function ClaimLine({ e }: { e: FeedbackItem }) {
  const [error, setError] = useState('')
  if (!e.claim) return null
  const hm = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
  const release = () => void api.releaseFeedbackClaim(e.key).catch((err: Error) => setError(err.message))
  return (
    <div className="fbp-agent fbp-claim" data-ui="맡음">
      <span className="muted">{t(`${e.claim.machine}가 ${hm(e.claim.at)}에 맡아 처리 중 · ${hm(e.claim.until)}에 자동으로 풀림`, `${e.claim.machine} took this at ${hm(e.claim.at)} · released automatically at ${hm(e.claim.until)}`)}</span>
      <button type="button" className="icon-btn sm" data-ui="맡음 풀기" data-tip={t('맡음 풀기: 다른 곳이 다시 맡을 수 있게 합니다', 'Release: let another agent take it')} aria-label={t('맡음 풀기', 'Release')} onClick={release}>{Icon.x}</button>
      {error && <span className="error-text fbp-agent-error" role="alert">{error}</span>}
    </div>
  )
}
