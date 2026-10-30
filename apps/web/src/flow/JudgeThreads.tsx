import { useState } from 'react'
import type { CommentEntry } from '../api'
import { Author } from '../Author'
import { flash } from '../flash'
import { flowTarget, useSlot } from '../Comments'
import { ComposeBox, SayCard } from '../Conversation'
import { t as tr } from '../i18n'
import { Icon } from '../icons'
import { MemoText } from '../memo'
import { USER_ANSWER_BY } from '../recordsPanelHelpers'
import { recordWrites } from '../useRecordActions'
import { judgeQuestions, readDrafts, threadState, writeDrafts, type JudgeDraft, type ThreadState } from './threadModel'

const STATE_NAME: Record<ThreadState, () => string> = {
  draft: () => tr('보내지 않음', 'Not sent'), waiting: () => tr('답하는 중', 'Waiting for an answer'),
  answered: () => tr('답함 · 내 차례', 'Answered · your turn'), closed: () => tr('완료', 'Done'),
}

/**
 * 판단 화면의 질문과 답 (10/23 "판단 설계" 4-1): 짚은 곳(칸)마다 질문 하나가 줄기 하나.
 * 질문은 흐름 점의 기록(workbench/comments/flow-<점>.md)에 field와 함께 쓰고, 보내지 않은 것은 이 브라우저에 모아 두었다가 한 번에 보낸다.
 */
export function useJudgeThreads(rid: string, id: string, title: string) {
  const ct = flowTarget(id, title)
  const target = ct.target
  const slot = useSlot(rid, target)
  const [drafts, setDraftsState] = useState<JudgeDraft[]>(() => readDrafts(rid, id))
  const [open, setOpen] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const setDrafts = (list: JudgeDraft[]) => { setDraftsState(list); writeDrafts(rid, id, list) }
  const writes = recordWrites(rid)
  const questions = judgeQuestions(slot.file?.comments ?? [])
  const send = async (list: JudgeDraft[]) => {
    setBusy(true)
    let sent = 0
    try {
      for (const d of list) { await writes.add(target, { kind: '질문', title: ct.title, source: ct.source, text: d.text, ...(d.field && { field: d.field }) }); sent++ }
    } catch (e) { flash((e as Error).message) }
    setBusy(false)
    return sent
  }
  return {
    target, questions, drafts, open, busy, setOpen,
    /** 그 칸의 줄기 (''은 명제 · 카드 전체) */
    of: (field: string) => questions.filter((q) => (q.field ?? '') === field),
    draftsOf: (field: string) => drafts.map((d, i) => ({ d, i })).filter((x) => x.d.field === field),
    keep: (field: string, text: string) => { setDrafts([...drafts, { field, text }]); setOpen(null) },
    sendNow: async (field: string, text: string) => { if (await send([{ field, text }])) setOpen(null) },
    sendAll: async () => { const n = await send(drafts); setDrafts(drafts.slice(n)) },
    dropDraft: (i: number) => setDrafts(drafts.filter((_, k) => k !== i)),
    reply: async (q: CommentEntry, text: string) => { setBusy(true); try { await writes.reply(target, q.id, text) } catch (e) { flash((e as Error).message) } setBusy(false) },
    close: async (q: CommentEntry) => { setBusy(true); try { await writes.setState(target, q.id, '끝냄', slot.file!.hash) } catch (e) { flash((e as Error).message) } setBusy(false) },
    counts: () => {
      const live = questions.filter((q) => threadState(q) !== 'closed')
      return { all: live.length, answered: live.filter((q) => threadState(q) === 'answered').length, drafts: drafts.length }
    },
  }
}
export type JudgeThreadsState = ReturnType<typeof useJudgeThreads>

/** 칸 오른쪽의 말풍선: 이 칸에 묻기 */
export function AskButton({ th, field }: { th: JudgeThreadsState; field: string }) {
  const on = th.open === field
  return <button className={`icon-btn sm jd-ask${on ? ' on' : ''}`} data-ui="판단 화면 묻기" title={tr('이 칸에 묻기', 'Ask about this')} aria-label={tr('이 칸에 묻기', 'Ask about this')} aria-expanded={on}
    onClick={() => th.setOpen(on ? null : field)}>{Icon.comment}</button>
}

/** 칸 아래의 줄기들과 (열렸으면) 입력란 */
export function FieldThreads({ th, field, numberOf }: { th: JudgeThreadsState; field: string; numberOf(id: string): number }) {
  const list = th.of(field)
  const drafts = th.draftsOf(field)
  if (!list.length && !drafts.length && th.open !== field) return null
  return <div className="jd-threads" data-ui="판단 화면 질문">
    {list.map((q) => <Thread key={q.id} th={th} q={q} n={numberOf(q.id)} />)}
    {drafts.map(({ d, i }) => <div key={`d${i}`} className="jd-thread draft">
      <div className="jd-thread-h"><span className="muted">{STATE_NAME.draft()}</span><span className="sp" />
        <button className="icon-btn sm" title={tr('제거', 'Remove')} aria-label={tr('제거', 'Remove')} onClick={() => th.dropDraft(i)}>{Icon.x}</button></div>
      <MemoText text={d.text} />
    </div>)}
    {th.open === field && <Composer th={th} field={field} />}
  </div>
}

function Composer({ th, field }: { th: JudgeThreadsState; field: string }) {
  const [text, setText] = useState('')
  const ok = !!text.trim() && !th.busy
  return <ComposeBox value={text} onChange={setText} placeholder={field ? tr('이 칸에 대한 질문이나 고칠 점', 'A question or fix about this') : tr('전체에 대한 질문이나 고칠 점', 'A question or fix about the whole')}>
    <button className="btn" data-ui="판단 화면 모아 두기" disabled={!ok} title={tr('읽으며 여러 개 적어 두고 한 번에 보냅니다', 'Keep several while reading and send them together')} onClick={() => th.keep(field, text.trim())}>{tr('모아 두기', 'Keep')}</button>
    <button className="btn primary" data-ui="판단 화면 보내기" disabled={!ok} onClick={() => void th.sendNow(field, text.trim())}>{tr('보내기', 'Send')}</button>
  </ComposeBox>
}

function Thread({ th, q, n }: { th: JudgeThreadsState; q: CommentEntry; n: number }) {
  const [replying, setReplying] = useState(false)
  const [text, setText] = useState('')
  const st = threadState(q)
  return <div className={`jd-thread ${st}`} data-ui-item={q.id}>
    <div className="jd-thread-h"><b>{n}</b><span className={st === 'answered' ? 'fl-turn-name' : 'muted'}>{STATE_NAME[st]()}</span>
      {q.changed && <span className="fl-stale">{tr('질문 후 변경', 'changed since asked')}</span>}</div>
    <ul className="fbp-thread">
      <SayCard me ui="사용자 글" name={tr('사용자', 'User')}><MemoText text={q.body} /></SayCard>
      {q.answers.map((a, i) => <SayCard key={i} me={a.by === USER_ANSWER_BY} ui={a.by === USER_ANSWER_BY ? '사용자 글' : '에이전트 글'} name={a.by === USER_ANSWER_BY ? tr('사용자', 'User') : <Author by={a.by} />} when={a.at}><MemoText text={a.body} /></SayCard>)}
    </ul>
    {st !== 'closed' && (replying
      ? <ComposeBox value={text} onChange={setText} placeholder={tr('더 묻기', 'Ask more')}>
        <button className="btn" onClick={() => setReplying(false)}>{tr('취소', 'Cancel')}</button>
        <button className="btn primary" disabled={!text.trim() || th.busy} onClick={() => void th.reply(q, text.trim()).then(() => { setReplying(false); setText('') })}>{tr('보내기', 'Send')}</button>
      </ComposeBox>
      : <div className="jd-thread-act">
        {st === 'answered' && <button className="a" onClick={() => setReplying(true)}>{tr('더 묻기', 'Ask more')}</button>}
        <button className="a" disabled={th.busy} onClick={() => void th.close(q)}>{tr('완료', 'Done')}</button>
      </div>)}
  </div>
}
