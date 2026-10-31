import { useState, type ReactNode } from 'react'
import { api, type FeedbackItem } from '../api'
import { Compose } from '../FeedbackPage'
import { projectColor } from '../format'
import { t } from '../i18n'
import { Icon } from '../icons'
import { kindLabel } from '../recordLabels'
import { RecordList } from '../RecordList'
import { recordKind, recordRoute } from '../recordsPanelHelpers'
import { REPLY } from '../feedbackTags'
import { go } from '../router'
import { agentName, taskLine } from '../taskView'
import { recordLine } from '../workRecords'
import { TaskCard } from '../WorkTasks'
import { TURN_GROUPS, useTurns, type TurnItem } from './turns'

/**
 * 폰의 첫 화면 「내 차례」 (10/31 사용자 결정 "안 A · 내 차례 먼저", 시안 https://claude.ai/artifact/M7D5NatDAN9agDCJTmPpop ①②).
 * 모든 프로젝트에서 나를 기다리는 것을 종류마다 묶어 카드로. 결과를 알린 피드백은 카드의 승인 · 진행 · 중단을 바로 누르고,
 * 글이 필요한 답(질문 · 반려)과 기록 · 맡긴 일은 카드를 눌러 아래에서 올라오는 시트에서 한다. 시트 안은 맥 화면과 같은 부품이다.
 */
export function PhoneTurns({ version, onSaved }: { version: number; onSaved(m: string): void }) {
  const { items, loading } = useTurns(version)
  const [open, setOpen] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const sheet = open ? items.find((x) => x.key === open) : undefined
  const act = (p: Promise<unknown>) => { setError(null); p.catch((e: Error) => setError(e.message)) }
  return (
    <main className="stage full ph-turns" data-ui="내 차례">
      <div className="ph-head"><h1>{t('내 차례', 'Your turn')}</h1>{items.length > 0 && <span className="muted">{t(`${items.length}개`, `${items.length}`)}</span>}</div>
      {error && <div className="banner danger" role="alert">{error}</div>}
      {TURN_GROUPS.map((g) => {
        const list = items.filter((x) => x.kind === g)
        return list.length > 0 && (
          <section key={g} className="ph-group" data-ui="내 차례 묶음" data-ui-item={g}>
            <h2><span className="turn-dot" aria-hidden />{GROUP_NAME[g]()} · {list.length}</h2>
            {list.map((x) => <TurnCard key={x.key} x={x} onOpen={() => setOpen(x.key)} act={act} />)}
          </section>
        )
      })}
      {!items.length && <p className="empty ph-empty">{loading ? t('불러오는 중…', 'Loading…') : t('지금 내 차례인 것이 없습니다. 피드백의 답, 에이전트의 질문, 맡긴 일의 결과가 오면 여기에 보입니다.', 'Nothing is waiting for you. Feedback answers, agent questions and delegated task results show up here.')}</p>}
      {sheet && <Sheet x={sheet} onClose={() => setOpen(null)} onSaved={onSaved} />}
    </main>
  )
}

const GROUP_NAME: Record<TurnItem['kind'], () => string> = {
  feedback: () => t('피드백 답', 'Feedback answers'),
  record: () => t('에이전트 질문', 'Agent questions'),
  task: () => t('맡긴 일 결과', 'Delegated task results'),
  edits: () => t('수정 검토', 'Edit review'),
}

/** 피드백 항목의 이름: 교정한 문장, 없으면 원문 첫 줄 */
const feedbackTitle = (e: FeedbackItem) => (e.status?.clean || e.text).split('\n')[0]!.trim()
/** 에이전트 답의 첫 줄 (답의 첫 줄은 상태: 수정 완료 (#PR) · 확인 필요 …) */
const feedbackHead = (e: FeedbackItem) => (e.status?.note ?? '').split('\n')[0]!.trim()

function Chip({ rid, name }: { rid: string; name: string }) {
  return <span className="ph-chip" style={{ ['--pc' as string]: projectColor(rid) }}>{name}</span>
}

function TurnCard({ x, onOpen, act }: { x: TurnItem; onOpen(): void; act(p: Promise<unknown>): void }) {
  let meta: ReactNode, title: string, body: string | undefined, buttons: ReactNode = null
  if (x.kind === 'feedback') {
    const e = x.item
    meta = <><span className="ph-chip">{t('피드백', 'Feedback')}</span>{e.kind && <span>{e.kind}</span>}<span>{e.date.slice(5).replace('-', '/')}</span></>
    title = feedbackTitle(e)
    body = e.status?.ask ?? feedbackHead(e)
    // 글이 필요한 답(질문 · 반려)은 시트에서. 글 없이 끝나는 답만 카드에서 바로
    buttons = x.turn === 'answer'
      ? <><button className="btn" onClick={onOpen}>{REPLY['코멘트']}</button><button className="btn" onClick={() => act(api.reviewFeedback(e.key, '중단'))}>{REPLY['중단']}</button><button className="btn primary" onClick={() => act(api.reviewFeedback(e.key, '진행'))}>{REPLY['진행']}</button></>
      : <><button className="btn" onClick={onOpen}>{REPLY['코멘트']}</button><button className="btn" onClick={onOpen}>{REPLY['반려']}</button><button className="btn primary" onClick={() => act(api.reviewFeedback(e.key, '승인'))}>{REPLY['승인']}</button></>
  } else if (x.kind === 'record') {
    const { entry } = x.rec
    meta = <><Chip rid={x.rid} name={x.project} />{entry.by && <span className="ph-agent">{agentName(entry.by)}</span>}<span>{kindLabel(recordKind(entry))}</span></>
    title = recordLine(entry) || t('(빈 기록)', '(empty)')
    body = x.rec.file.target === 'project' ? undefined : x.rec.file.title
  } else if (x.kind === 'task') {
    meta = <><Chip rid={x.rid} name={x.project} /><span className="ph-agent">{agentName(x.task.agent)}</span><span>{taskLine(x.task)}</span></>
    title = x.task.title
    body = x.task.conclusion
  } else {
    meta = <Chip rid={x.rid} name={x.project} />
    title = t(`에이전트가 고친 노트 ${x.n}개`, `${x.n} notes edited by agents`)
    body = t('맥에서 변경사항을 보고 받거나 되돌립니다.', 'Review the changes and keep or undo them.')
  }
  const open = x.kind === 'edits' ? () => go({ page: 'edits', rid: x.rid }) : onOpen
  return (
    <article className="ph-card" data-ui="내 차례 카드">
      <button className="ph-card-main" onClick={open}>
        <span className="ph-meta">{meta}</span>
        <span className="ph-title">{title}</span>
        {body && <span className="ph-body">{body}</span>}
      </button>
      {buttons && <div className="ph-btns">{buttons}</div>}
    </article>
  )
}

/** 아래에서 올라오는 시트. 바깥(어두운 곳)이나 ×를 누르면 닫힌다. 답해서 내 차례에서 빠지면 저절로 닫힌다 */
function Sheet({ x, onClose, onSaved }: { x: TurnItem; onClose(): void; onSaved(m: string): void }) {
  let head: ReactNode, inner: ReactNode
  if (x.kind === 'feedback') {
    const e = x.item
    const pictures = (e.status?.pictures ?? []).slice(0, 2)
    head = feedbackTitle(e)
    inner = <>
      <div className="ph-meta">{t('피드백', 'Feedback')}{e.kind && ` · ${e.kind}`} · {e.date} {e.time}</div>
      {e.status?.note && <div className="ph-note">{e.status.note}</div>}
      {e.status?.ask && <div className="ph-ask">{e.status.ask}</div>}
      {pictures.length > 0 && <div className="ph-pics">{pictures.map((p, k) => (
        <figure key={p}><img src={`/api/feedback/picture?path=${encodeURIComponent(p)}`} alt={k === 0 ? t('전', 'Before') : t('후', 'After')} /><figcaption>{k === 0 ? t('전', 'Before') : t('후', 'After')}</figcaption></figure>
      ))}</div>}
      <Compose e={e} />
      <button className="a ph-more" onClick={() => go({ page: 'feedback' })}>{t('피드백 화면에서 전체 대화 보기', 'See the whole thread on the feedback screen')}</button>
    </>
  } else if (x.kind === 'record') {
    const { file, entry } = x.rec
    head = entry.by ? t(`${agentName(entry.by)}의 ${kindLabel(recordKind(entry))}`, `${kindLabel(recordKind(entry))} from ${agentName(entry.by)}`) : kindLabel(recordKind(entry))
    inner = <>
      <div className="ph-meta"><Chip rid={x.rid} name={x.project} />{file.target === 'project' ? t('이 프로젝트', 'This project') : file.title}</div>
      <RecordList rid={x.rid} file={file} filter={recordKind(entry) === '지시' ? '지시' : '질문'} items={[entry]} work
        onGo={() => { const r = recordRoute(x.rid, file, () => undefined); if (r) go(r) }} />
    </>
  } else if (x.kind === 'task') {
    head = x.task.title
    inner = <>
      <div className="ph-meta"><Chip rid={x.rid} name={x.project} />{t('맡긴 일', 'Delegated task')}</div>
      <TaskCard rid={x.rid} task={x.task} open onToggle={onClose} onSaved={onSaved} reload={() => undefined}
        onEditProposal={() => go({ page: 'records', rid: x.rid })} />
    </>
  } else return null
  return (
    <div className="ph-sheet-wrap" data-ui="답 시트">
      <div className="ph-scrim" onClick={onClose} />
      <div className="ph-sheet" role="dialog" aria-modal="true" aria-label={typeof head === 'string' ? head : undefined}>
        <div className="ph-sheet-head"><b>{head}</b><button className="icon-btn" aria-label={t('닫기', 'Close')} onClick={onClose}>{Icon.x}</button></div>
        <div className="ph-sheet-body">{inner}</div>
      </div>
    </div>
  )
}
