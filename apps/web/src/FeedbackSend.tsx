// 피드백 화면 툴바의 보내기 버튼들: GitHub 이슈로 보내기, 피드백 파일로 보내기 · 가져오기 (FeedbackPage.tsx에서 나눔)
import { useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type FeedbackItem } from './api'
import { Dialog } from './dialogs'
import { feedbackSummary, feedbackWhen, issuesDraftUrl } from './feedbackFormat'
import { feedbackKindName as kindName } from './feedbackTags'
import { t } from './i18n'
import { qk } from './queries'
import { uiShown } from './uiNames'

/** 띠의 수 · 등록 버튼과 같은 키 (FeedbackPage.tsx) */
const FEEDBACK_STATE = [...qk.feedback, 'state'] as const
const keyOf = (e: FeedbackItem) => `${e.source ?? ''} ${e.date} ${e.time} ${e.target} ${e.n}`
const kindOf = (e: FeedbackItem): string => e.status?.kind ?? e.kind

/**
 * 모아서 GitHub 이슈로 보내기 (10/22 사용자: 항목마다 보내지 않고 등록해 두었다가 한 번에).
 * 앱 폴더가 공개 저장소를 가리켜 새 이슈 주소가 있을 때만 보인다. 지금 거른 목록에서 고르면 이슈 초안 하나를 새 창에 연다(보내기는 GitHub에서)
 */
export function IssueButton({ list }: { list: FeedbackItem[] }) {
  const state = useQuery({ queryKey: FEEDBACK_STATE, queryFn: () => api.feedbackState() })
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const base = state.data?.issues
  if (!base) return null
  const rows = [...list].sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`) || b.n - a.n)
  const chosen = rows.filter((e) => picked.has(keyOf(e))).reverse()
  const draft = chosen.length ? issuesDraftUrl(base, chosen.map((e) => ({
    date: e.date, time: e.time, kind: kindName(kindOf(e)), text: e.status?.clean ?? e.text, area: uiShown(e.target), route: e.route, version: e.version,
  })), `${navigator.platform} · ${innerWidth}×${innerHeight}`) : null
  const toggle = (k: string) => setPicked((p) => { const n = new Set(p); if (n.has(k)) n.delete(k); else n.add(k); return n })
  const close = () => setOpen(false)
  return <>
    <button className="btn" data-ui="GitHub 이슈로 보내기" title={t('지금 목록에서 골라 GitHub 이슈 하나로 보냅니다', 'Pick from this list and send them as one GitHub issue')} onClick={() => { setPicked(new Set()); setOpen(true) }}>{t('GitHub 이슈로 보내기', 'Send as GitHub issue')}</button>
    {open && <Dialog title={t('GitHub 이슈로 보내기', 'Send as GitHub issue')} ui="GitHub 이슈로 보내기" wide onClose={close}
      footer={<>
        {draft && draft.included < chosen.length && <span className="muted fbi-cut">{t(`주소가 길어 앞의 ${draft.included}개만 넣습니다`, `Only the first ${draft.included} fit in the address`)}</span>}
        <span className="sp" />
        <button className="btn" onClick={close}>{t('취소', 'Cancel')}</button>
        <button className="btn primary" disabled={!draft} onClick={() => { if (draft) window.open(draft.url, '_blank', 'noopener'); close() }}>{t(`이슈 초안 열기 · ${chosen.length}`, `Open issue draft · ${chosen.length}`)}</button>
      </>}>
      <p className="muted fbi-help">{t('고른 피드백을 공개 저장소의 버그 양식 하나에 차례로 적어 새 창에 엽니다. 그림은 넣지 않으니 필요하면 GitHub에서 붙이세요.', 'The picked feedback is written in order into one bug form of the public repository, opened in a new window. Pictures are not included; attach them on GitHub if needed.')}</p>
      <div className="fbi-all">
        <button className="a" onClick={() => setPicked(picked.size === rows.length ? new Set() : new Set(rows.map(keyOf)))}>{picked.size === rows.length ? t('선택 해제', 'Unpick all') : t('모두 고르기', 'Pick all')}</button>
        <span className="muted">{t(`${rows.length}개 중 ${picked.size}개`, `${picked.size} of ${rows.length}`)}</span>
      </div>
      <ul className="fbi-list" data-ui="보낼 피드백 목록">
        {rows.map((e) => { const k = keyOf(e); return (
          <li key={k}><label className="fbi-row">
            <input type="checkbox" checked={picked.has(k)} onChange={() => toggle(k)} />
            <span className="mono muted">{feedbackWhen(e.date, e.time)}</span>
            <span className="fbi-text">{feedbackSummary(e.status?.clean ?? e.text)}</span>
          </label></li>
        ) })}
      </ul>
    </Dialog>}
  </>
}

/**
 * 피드백 파일로 주고받기 (11/8 "친구의 피드백도 관리자인 나는 볼 수 있게"): GitHub 없이 쓰는 사람은 남긴 피드백을 한 파일로 만들어 카카오톡 · 메일로 보내고,
 * 관리자(피드백을 GitHub에 등록하는 앱)는 그 파일을 가져와 이 목록에서 함께 본다. 받은 항목에는 보낸 사람 이름 태그가 붙는다
 */
export function FeedbackFileButtons() {
  const client = useQueryClient()
  const state = useQuery({ queryKey: FEEDBACK_STATE, queryFn: () => api.feedbackState() })
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ text: string; error: boolean } | null>(null)
  if (!state.data?.enabled) return null
  const run = async (work: () => Promise<string>) => {
    setBusy(true); setNote(null)
    try { setNote({ text: await work(), error: false }) } catch (e) { setNote({ text: e instanceof Error ? e.message : String(e), error: true }) } finally { setBusy(false) }
  }
  const send = () => run(async () => {
    const r = await api.exportFeedback()
    return t(`${r.count}개를 파일로 만들었습니다: ${r.file} — 카카오톡이나 메일로 관리자에게 보내 주세요`, `Saved ${r.count} items to ${r.file}. Send this file to the app's maintainer by chat or email`)
  })
  const take = (file: File) => run(async () => {
    let body: unknown
    try { body = JSON.parse(await file.text()) } catch { throw new Error(t('피드백 파일(.json)이 아닙니다', 'Not a feedback file (.json)')) }
    const r = await api.importFeedback(body)
    void client.invalidateQueries({ queryKey: qk.feedback })
    return t(`${r.from}의 피드백 ${r.count}개를 가져왔습니다`, `Imported ${r.count} feedback items from ${r.from}`)
  })
  return <>
    {note && <span className={`fbp-file-note ${note.error ? 'error-text' : 'muted'}`} data-ui="피드백 파일 결과">{note.text}</span>}
    {state.data.relay && <button className={`btn${state.data.relay.pending ? ' primary' : ''}`} data-ui="관리자에게 보내기" disabled={busy || !state.data.relay.pending}
      title={state.data.relay.pending ? t('남긴 피드백은 잠시 뒤 자동으로 관리자에게 갑니다. 지금 바로 보내려면 누르세요', 'Feedback goes to the maintainer automatically shortly after you leave it. Click to send now') : t('남긴 피드백을 모두 관리자에게 보냈습니다', 'All your feedback has been sent to the maintainer')}
      onClick={() => void run(async () => { const r = await api.relayFeedback(); void client.invalidateQueries({ queryKey: qk.feedback }); return r.message })}>
      {busy ? t('보내는 중…', 'Sending…') : state.data.relay.pending ? `${t('관리자에게 보내기', 'Send to maintainer')} · ${state.data.relay.pending}` : t('모두 보냄', 'All sent')}
    </button>}
    {!note && state.data.relay?.error && <span className="fbp-file-note error-text" data-ui="피드백 파일 결과">{state.data.relay.error}</span>}
    {state.data.publishable
      ? <>
        <input ref={input} type="file" accept=".json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void take(f) }} />
        <button className="btn" data-ui="피드백 가져오기" disabled={busy} title={t('다른 사람이 보낸 피드백 파일(.json)을 가져와 이 목록에 함께 보입니다', 'Import a feedback file (.json) someone sent you and show it in this list')} onClick={() => input.current?.click()}>{busy ? t('가져오는 중…', 'Importing…') : t('피드백 가져오기', 'Import feedback')}</button>
      </>
      : (!state.data.relay || state.data.relay.error) && <button className="btn" data-ui="피드백 파일로 보내기" disabled={busy} title={t('남긴 피드백과 그림을 파일 하나로 만들어 내려받기 폴더에 둡니다. 그 파일을 관리자에게 보내면 관리자의 피드백 화면에 보입니다', 'Saves your feedback and pictures as one file in Downloads. Send it to the maintainer and it appears on their feedback screen')} onClick={() => void send()}>{busy ? t('만드는 중…', 'Saving…') : t('피드백 파일로 보내기', 'Send as file')}</button>}
  </>
}
