import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { api, FEEDBACK_EVENT, records, type FeedbackItem, type FeedbackState } from './api'
import { uiShown } from './uiNames'
import { Icon } from './icons'
import { MemoText } from './memo'
import { onListKey } from './listInput'
import { askConfirm } from './askText'
import { feedbackConversation, splitThread, summaryRows, type ThreadStep } from './feedbackThread'
import { jumpToFeedbackTarget } from './feedbackJump'
import { feedbackSummary, feedbackWhen } from './feedbackFormat'
import { feedbackBucket, needsAnswer, needsConfirm, stateOf, unansweredComments, type FeedbackBucket } from './feedbackBuckets'
import { plural, shown, t } from './i18n'

export { needsAnswer, needsConfirm, stateOf } from './feedbackBuckets'

/**
 * 피드백 모아 보기: feedback/의 모든 날짜 파일과 처리 기록(feedback/status.yaml).
 * 처리 기록은 코딩 에이전트가 고치거나 답할 때 적는다. 기록이 없으면 "대기".
 * 맥 피드백 모드의 코멘트(feedback/날짜.md)와 채팅 미리보기 댓글(feedback/preview/날짜.md)을 함께 보여 준다.
 * 보기: 시각(기본, 한 표에 시각순 — 10/4 피드백 "표처럼, 날짜 섹션 없이 시각에 통합") · 화면(처리 기록의 area) · 주제(theme) · 종류.
 * 묶음 안에서 대기는 다 펼치고, 처리한 것은 한 줄로 줄여 접어 둔다 (눌러서 펼침).
 */
type Filter = FeedbackBucket | '전체'
const FILTERS: Filter[] = ['확인 필요', '대기', '완료', '전체']
const FILTER_TITLES: Record<FeedbackBucket, string> = {
  '확인 필요': t('답하거나 승인·수정 요청할 것: 에이전트가 물은 것과 처리한 것', 'To answer, approve or request changes: what the agent asked and what it handled'),
  '대기': t('에이전트가 처리할 것: 새 피드백, 수정 요청한 것, 묻지 않은 보류', 'For the agent to handle: new feedback, change requests, holds without a question'),
  '완료': t('승인했거나 확인 기간(7일)이 지난 반영·답변', 'Approved, or applied and answered items past the 7-day review period'),
}
/** 필터 · 묶기 · 상태의 화면 이름 (값은 한국어 그대로 저장한다) */
const LABEL: Record<string, string> = {
  '확인 필요': t('확인 필요', 'Needs review'), '대기': t('대기', 'Waiting'), '완료': t('완료', 'Done'), '전체': t('전체', 'All'),
  '시각': t('시각', 'Time'), '화면': t('화면', 'Screen'), '테마': t('테마', 'Theme'), '종류': t('종류', 'Kind'),
  '반영': t('반영', 'Applied'), '답변': t('답변', 'Answered'), '보류': t('보류', 'On hold'), '승인': t('승인', 'Approved'),
  '거절': t('거절', 'Declined'), '동의': t('동의', 'Agreed'), '나중에': t('나중에', 'Later'),
  '처리': t('처리', 'Handled'), '다시 처리': t('다시 처리', 'Reworked'), '나': t('나', 'Me'),
}
const label = (v: string) => LABEL[v] ?? shown(v)
/** 태그는 두 글자로 (10/9): 상태 · 요소 · 유형 태그에 세 글자 넘는 이름을 쓰지 않는다. 필터 이름은 그대로 */
const TAG: Record<string, string> = {
  '확인 필요': t('질의', 'Asked'), '나중에': t('추후', 'Later'), '디자인': t('모양', 'Design'), '미분류': t('미정', 'None'),
}
const stateName = (s: FeedbackState | '대기') => TAG[s] ?? label(s)
const kindName = (k: string) => TAG[k] ?? shown(k)
/** 표의 답 칸: 에이전트가 적은 상태. 사용자의 승인 · 수정 요청은 확인 칸에 따로 (10/9) */
const answerOf = (e: FeedbackItem): FeedbackState | '대기' => { const st = stateOf(e); return st === '승인' && e.review?.verdict === '승인' ? e.status?.state ?? '대기' : st }
/** 종류는 둘로 나눠 보인다 (10/9): 요소(디자인 · 버그 · 기능, 10/9 전 분류)와 유형(수정 · 질문 · 제안, 사용자가 고른 것) */
const ELEMENTS = ['디자인', '버그', '기능']
const TYPES = ['수정', '질문', '제안']
/** 자료 값 '반려'는 화면에서 "수정 요청" (10/7 사용자 결정) */
const verdictName = (v: string) => (v === '반려' ? t('수정 요청', 'Request changes') : label(v))
/** 종류는 Claude가 처리하며 가린다 (status.yaml의 kind). 아직이면 날짜 파일의 종류(새 코멘트는 미분류) */
const kindOf = (e: FeedbackItem): string => e.status?.kind ?? e.kind
const matches = (f: Filter, e: FeedbackItem) => f === '전체' || feedbackBucket(e) === f

type GroupBy = '시각' | '화면' | '테마' | '종류'
const GROUPS: GroupBy[] = ['시각', '화면', '테마', '종류']
const GROUP_KEY = 'rw-feedback-group'
const UNSORTED = '아직 분류 전'
/** 주제는 요구 정리 문서의 절 순서대로 */
const THEME_ORDER = ['구조', '이름·모델', '홈·할 일', '자료', '에이전트', '지식', '디자인', '연동', '피드백 도구']
/** 화면 부위는 사용자가 앱을 보는 순서대로: 홈과 앱 테두리 → 프로젝트 안 → 앱 전체 화면 */
const AREA_ORDER = ['홈', '레일', '상단바', '사이드바', '프로젝트 첫 화면', '프로젝트 정보', '작업', '노트', '참고 자료', '지식', '피드백', '소개', '설정', '앱 전체']
const groupOf = (g: GroupBy, e: FeedbackItem): string =>
  g === '화면' ? e.status?.area ?? UNSORTED
    : g === '테마' ? e.status?.theme ?? UNSORTED
      : g === '종류' ? kindOf(e) : ''
const orderIn = (order: string[], name: string) => (name === UNSORTED ? -1 : order.indexOf(name) === -1 ? 99 : order.indexOf(name))
const rank = (g: GroupBy, name: string) => (g === '테마' ? orderIn(THEME_ORDER, name) : g === '화면' ? orderIn(AREA_ORDER, name) : 0)

/** 그룹으로 나누기. 날짜는 최근 것부터, 화면·주제는 정한 순서, 종류는 대기가 많은 것부터 */
export function groupFeedback(entries: FeedbackItem[], g: GroupBy): [string, FeedbackItem[]][] {
  const out = new Map<string, FeedbackItem[]>()
  for (const e of entries) { const k = groupOf(g, e); out.set(k, [...(out.get(k) ?? []), e]) }
  const pending = (l: FeedbackItem[]) => l.filter((e) => stateOf(e) === '대기').length
  return [...out].sort(([a, la], [b, lb]) =>
    g === '테마' || g === '화면' ? rank(g, a) - rank(g, b) || a.localeCompare(b)
        : pending(lb) - pending(la) || lb.length - la.length || a.localeCompare(b))
}

const readGroup = (): GroupBy => { try { const raw = localStorage.getItem(GROUP_KEY); const v = (raw === '주제' ? '테마' : raw) as GroupBy | null; return v && GROUPS.includes(v) ? v : '시각' } catch { return '시각' } }

export function FeedbackPage({ version }: { version: number }) {
  const [entries, setEntries] = useState<FeedbackItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('대기')
  const [group, setGroupState] = useState<GroupBy>(readGroup)
  const setGroup = (g: GroupBy) => { setGroupState(g); try { localStorage.setItem(GROUP_KEY, g) } catch { /* 무시 */ } }
  const [tick, setTick] = useState(0)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [user, setUser] = useState<string | null>(null)
  useEffect(() => { api.feedbackAll().then((b) => { setEntries(b.entries); setStatusError(b.statusError); setUser(b.user ?? null) }).catch((e: Error) => setError(e.message)) }, [version, tick])
  // 피드백 모드에서 새로 남기거나 고치면 바로 다시 읽는다
  useEffect(() => {
    const on = () => setTick((t) => t + 1)
    window.addEventListener(FEEDBACK_EVENT, on)
    return () => window.removeEventListener(FEEDBACK_EVENT, on)
  }, [])

  // 10/8 11:36 피드백: 확인 필요가 있으면 그것부터 연다 (띠의 수가 세는 것). 사용자가 고른 뒤에는 그대로 둔다
  const picked = useRef(false)
  useEffect(() => {
    if (picked.current || !entries) return
    picked.current = true
    if (entries.some((e) => matches('확인 필요', e))) setFilter('확인 필요')
  }, [entries])

  const shown = useMemo(() => (entries ?? []).filter((e) => matches(filter, e)), [entries, filter])
  const groups = useMemo(() => (group === '시각' ? [] : groupFeedback(shown, group)), [shown, group])

  return (
    <Account.Provider value={user}>
    <main className="stage full" data-ui="피드백">
      <section className="pane">
        <div className="pane-head fbp-toolbar" data-ui="머리줄">
          <div className="segmented small fbp-filters" role="radiogroup" aria-label={t('필터', 'Filter')} data-ui="거르기">
            {FILTERS.map((f) => (
              <button key={f} role="radio" aria-checked={filter === f} className={filter === f ? 'on' : ''} title={f === '전체' ? undefined : FILTER_TITLES[f]} onClick={() => { picked.current = true; setFilter(f) }}>
                {label(f)} {entries && <span className={f === '확인 필요' ? 'rail-count' : 'muted'}>{entries.filter((e) => matches(f, e)).length}</span>}
              </button>
            ))}
          </div>
          <div className="fbp-groupby" data-ui="묶기">
            <div className="segmented small" role="radiogroup" aria-label={t('보기', 'View')}>
              {GROUPS.map((g) => <button key={g} role="radio" aria-checked={group === g} className={group === g ? 'on' : ''} onClick={() => setGroup(g)}>{label(g)}</button>)}
            </div>
          </div>
          <div className="fbp-tools">
            <PublishButton tick={tick} version={version} />
          </div>
        </div>
        <div className="scroll">
          <div className={`page-body${group === '시각' ? ' fbp-wide' : ''}`}>
            {error && <p className="error-text">{error}</p>}
            {statusError && <div className="banner danger" data-ui="처리 기록 오류">{t('feedback/status.yaml을 읽지 못해 처리 기록 없이 보여 줍니다 (모두 대기로 보임)', 'Could not read feedback/status.yaml, so items are shown without handling records (all appear as waiting)')}: {statusError}</div>}
            {!entries && !error && <p className="muted">{t('불러오는 중…', 'Loading…')}</p>}
            {entries && shown.length === 0 && <p className="muted">{filter === '대기' ? t('처리를 기다리는 피드백이 없습니다.', 'No feedback is waiting.') : t('없습니다.', 'None.')}</p>}
            {group === '시각' && shown.length > 0 && <FeedbackTable list={shown} />}
            {groups.map(([name, list]) => <Group key={name} name={name} list={list} showDate />)}
          </div>
        </div>
      </section>
    </main>
    </Account.Provider>
  )
}

/** 피드백을 남기는 사람의 GitHub 계정: 대화에 "사용자 (계정)"으로 */
const Account = createContext<string | null>(null)

const keyOf = (e: FeedbackItem) => `${e.source ?? ''} ${e.date} ${e.time} ${e.target} ${e.n}`

/**
 * 시각 보기: 모든 피드백을 한 표에 (10/4 피드백). 열: 시각 · 상태 · 피드백(교정문) · 화면(지적한 곳) · 부위(디자인 요소)
 * · 앱 버전(남길 때의 커밋) · 반영 커밋. 머리의 시각을 누르면 순서가 바뀐다. 줄을 누르면 그 아래에 자세히.
 */
function FeedbackTable({ list }: { list: FeedbackItem[] }) {
  const [newest, setNewest] = useState(true)
  const [open, setOpen] = useState<string | null>(null)
  const rows = [...list].sort((a, b) => { const d = `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`) || a.n - b.n; return newest ? -d : d })
  return (
    <table className="fbp-table" data-ui="피드백 표">
      <thead>
        <tr>
          <th><button className="fb-link" title={t('순서 바꾸기', 'Reverse order')} onClick={() => setNewest((v) => !v)}>{t('시각', 'Time')} {newest ? '↓' : '↑'}</button></th>
          <th>{t('요소', 'Element')}</th><th>{t('유형', 'Type')}</th><th>{t('답', 'Answer')}</th><th>{t('확인', 'Review')}</th><th>{t('피드백', 'Feedback')}</th><th>{t('화면', 'Screen')}</th><th>{t('부위', 'Part')}</th><th>{t('남긴 버전', 'Left in')}</th><th>{t('반영 버전', 'Fixed in')}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((e) => {
          const k = keyOf(e)
          const st = stateOf(e)
          const text = feedbackSummary(e.status?.clean ?? e.text)
          return [
            <tr key={k} className={`fbp-row${open === k ? ' on' : ''}`} data-ui="피드백 줄" data-ui-item={`${e.date} ${e.time} ${e.target}`} onClick={() => setOpen(open === k ? null : k)}>
              <td className="mono fbp-when"><button type="button" className="fbp-open" aria-expanded={open === k} aria-label={`${open === k ? t('접기', 'Collapse') : t('펼치기', 'Expand')}: ${e.date} ${e.time} ${text.slice(0, 40)}`}>{feedbackWhen(e.date, e.time)}</button></td>
              <td className="fbp-cell">{ELEMENTS.includes(kindOf(e)) ? kindName(kindOf(e)) : ''}</td>
              <td className="fbp-cell">{TYPES.includes(kindOf(e)) ? kindName(kindOf(e)) : ''}</td>
              <td className="fbp-cell-state"><span className={`fbp-state st-${st}`}>{stateName(answerOf(e))}</span></td>
              <td className="fbp-cell" title={e.review?.note}>{e.review ? verdictName(e.review.verdict) : ''}</td>
              <td className="fbp-cell-text" title={e.status?.understood ?? text}>{text}{e.merged && <span className="muted"> +{e.merged.length}</span>}</td>
              <td className="fbp-cell" title={e.route}>{e.status?.area ?? <span className="muted">{uiShown(e.target).split(' › ')[0] || (e.source ? t('미리보기', 'Preview') : '—')}</span>}</td>
              <td className="fbp-cell" title={uiShown(e.target)}>{uiShown(e.target).split(' › ').pop()}</td>
              <td className="mono fbp-cell">{e.version ?? '—'}</td>
              <td className="mono fbp-cell">{e.status?.version ?? e.status?.commit ?? ''}<InApp e={e} /></td>
            </tr>,
            open === k && <tr key={`${k}-open`} className="fbp-row-open"><td colSpan={10}><Entry e={e} showDate onFold={() => setOpen(null)} /></td></tr>,
          ]
        })}
      </tbody>
    </table>
  )
}

/** 반영 커밋 옆: 지금 앱에 들어 있는지 (10/4 피드백 "반영했는지 어떻게 봐?"). 모르면 아무것도 안 붙인다 */
function InApp({ e }: { e: FeedbackItem }) {
  if (e.inApp === undefined) return null
  return e.inApp
    ? <span className="fbp-inapp" data-ui="앱에 있음" title={t('이 커밋이 지금 쓰는 앱에 들어 있습니다', 'This commit is in the app you are using')}> · {t('앱에 있음', 'In app')}</span>
    : <span className="fbp-inapp need" data-ui="업데이트 필요" title={t('고친 코드가 아직 이 앱에 없습니다. 상단바의 새 버전 버튼이나 설정 › 앱 기본정보에서 업데이트하세요', 'The fix is not in this app yet. Update with the new version button in the top bar or in Settings › About this app')}> · {t('앱 업데이트 필요', 'App update needed')}</span>
}

/** 한 묶음: 대기는 펼치고, 처리한 것은 한 줄씩. 처리한 것이 많으면 접어 둔다 */
const FOLD_AT = 3
function Group({ name, list, showDate }: { name: string; list: FeedbackItem[]; showDate: boolean }) {
  const open = list.filter((e) => stateOf(e) === '대기')
  const done = list.filter((e) => stateOf(e) !== '대기')
  const counts = (['반영', '거절', '확인 필요', '답변', '동의', '나중에', '보류', '승인'] as const).map((s) => [s, done.filter((e) => stateOf(e) === s).length] as const).filter(([, n]) => n > 0)
  return (
    <section data-ui="피드백 묶음" data-ui-item={name} className="fbp-group">
      <div className="sec-head">
        <h2>{name === UNSORTED ? t('아직 분류 전', 'Not sorted yet') : name}</h2><span className="count">{list.length}</span>
        <span className="muted fbp-counts">{[open.length && `${label('대기')} ${open.length}`, ...counts.map(([s, n]) => `${label(s)} ${n}`)].filter(Boolean).join(' · ')}</span>
      </div>
      <div className="fbp-list">
        {open.map((e) => <Entry key={`${e.source ?? ''} ${e.date} ${e.time} ${e.target} ${e.n}`} e={e} showDate={showDate} />)}
        {done.length > 0 && (done.length > FOLD_AT && open.length > 0
          ? (
            <details className="fbp-fold" data-ui="처리한 피드백 접기">
              <summary>{t(`처리한 것 ${done.length}건`, `Handled ${done.length}`)}</summary>
              {done.map((e) => <Short key={`${e.source ?? ''} ${e.date} ${e.time} ${e.target} ${e.n}`} e={e} showDate={showDate} />)}
            </details>
          )
          : done.map((e) => <Short key={`${e.source ?? ''} ${e.date} ${e.time} ${e.target} ${e.n}`} e={e} showDate={showDate} />))}
      </div>
    </section>
  )
}

/** 처리한 피드백 한 줄: 상태 · 교정문(없으면 원문) · 눌러서 펼침 */
function Short({ e, showDate }: { e: FeedbackItem; showDate: boolean }) {
  const [open, setOpen] = useState(false)
  if (open) return <Entry e={e} showDate={showDate} onFold={() => setOpen(false)} />
  const st = stateOf(e)
  const text = feedbackSummary(e.status?.clean ?? e.text)
  return (
    <button className="fbp-short" data-ui="피드백 한 줄" data-ui-item={`${e.time} ${e.target}`} onClick={() => setOpen(true)} title={e.status?.understood ?? text}>
      <span className="tag">{kindName(kindOf(e))}</span>
      <span className={`fbp-state st-${st}`}>{stateName(st)}</span>
      <span className="fbp-short-text">{text}</span>
      {e.merged && <span className="muted fbp-merged-count" title={t('같은 지적을 합친 수', 'Merged duplicates')}>+{e.merged.length}</span>}
      <span className="muted fbp-short-when">{showDate ? feedbackWhen(e.date, e.time) : e.time}</span>
    </button>
  )
}

function Entry({ e, showDate, onFold }: { e: FeedbackItem; showDate?: boolean; onFold?(): void }) {
  const st = stateOf(e)
  return (
    <article className={`fbp-entry st-${st}`} data-ui="피드백 항목" data-ui-item={`${e.time} ${e.target}`}>
      <div className="fbp-head">
        <span className={`fbp-state st-${st}`}>{stateName(st)}</span>
        <span className="tag">{kindName(kindOf(e))}</span>
        {e.source && <span className="tag" title={t('채팅의 앱 미리보기에 남긴 댓글', 'Comment left in the app preview in chat')}>{e.source}</span>}
        {e.status?.theme && <span className="fbp-theme">#{e.status.theme}</span>}
        <span className="muted">{showDate ? feedbackWhen(e.date, e.time) : e.time}</span>
        {/* 위치 글자 자체를 눌러 화면을 열고 그 부위를 칠한다 (10/6 11:09). */}
        {e.route
          ? <button type="button" className="a fbp-target" data-ui="그 자리로 가기" data-tip={t('그 자리로 가기', 'Go to the spot')} aria-label={`${t('그 자리로 가기', 'Go to the spot')}: ${uiShown(e.target)}`} onClick={() => jumpToFeedbackTarget(e.route, e.target)}><span className="fbp-target-text">{uiShown(e.target)}</span></button>
          : <span className="fbp-target">{uiShown(e.target)}</span>}
        <span className="sp" />
        {/* 10/4 20:43 "접기도 아이콘으로, 오른쪽 끝에" */}
        {onFold && <button className="icon-btn fbp-foldback" data-ui="접기" data-tip={t('접기', 'Collapse')} aria-label={t('접기', 'Collapse')} onClick={onFold}>{Icon.fold}</button>}
      </div>
      {e.status?.clean ? <CleanText e={e} /> : e.source ? <div className="fbp-text"><MemoText text={e.text} /></div> : <FeedbackText e={e} />}
      {needsAnswer(e) && <div className="fbp-ask" data-ui="물음"><b>{t('Claude가 묻는 것', 'Claude asks')}</b> {e.status!.ask}</div>}
      {e.status && <Summary e={e} />}
      {(e.status || e.comments) && <Conversation e={e} />}
      {e.merged && (
        <details className="fbp-merged" data-ui="합친 코멘트">
          <summary>{t(`같은 지적 ${e.merged.length}건을 이 항목으로 합침`, `Merged ${plural(e.merged.length, 'duplicate')} into this item`)} · {e.merged.map((m) => `${m.date.slice(5)} ${m.time}`).join(', ')}</summary>
          {e.merged.map((m) => (
            <div key={`${m.source ?? ''} ${m.date} ${m.time} ${m.n}`} className="fbp-merged-one">
              <span className="muted">{m.date.slice(5)} {m.time} · {m.source ? `${m.source} · ` : ''}{shown(m.kind)} · {uiShown(m.target)}</span>
              <MemoText text={m.text} />
            </div>
          ))}
        </details>
      )}
      <Compose e={e} />
    </article>
  )
}

/** "10-04 14:00" (reviews.yaml의 at: 2026-10-04T14:00) */
const whenOf = (at: string) => at.replace('T', ' ').slice(5, 16)
const FIELD_NAME = { understood: t('이해한 요구', 'Understood request'), cause: t('원인', 'Cause'), note: t('처리', 'Handling') }

/**
 * 처리 요약 (10/8 시안): 이해한 요구 · 원인 · 처리를 한곳에, 오른쪽에 그 글이 마지막으로 바뀐 시각.
 * 다시 처리하기 전의 글은 "고친 이력 n번"에 접어 둔다 (status.yaml revised).
 */
function Summary({ e }: { e: FeedbackItem }) {
  const st = e.status!
  const rows = summaryRows(st)
  const revised = st.revised ?? []
  if (!rows.length && !revised.length) return null
  return (
    <div className="fbp-summary" data-ui="처리 요약">
      {rows.map((r) => (
        <div key={r.field} className="fbp-summary-row">
          <b>{FIELD_NAME[r.field]}</b><span className="fbp-summary-text"><MemoText text={r.text} /></span><span className="muted">{r.at ? whenOf(r.at) : ''}</span>
        </div>
      ))}
      {revised.length > 0 && (
        <details className="fbp-earlier" data-ui="고친 이력">
          <summary>{t(`고친 이력 ${revised.length}번`, plural(revised.length, 'earlier version'))}</summary>
          {[...revised].reverse().map((h) => (
            <div key={h.at} className="fbp-summary-old">
              <span className="muted">{whenOf(h.handled_at ?? h.at)}</span>
              {(['understood', 'cause', 'note'] as const).map((f) => h[f] && <div key={f} className="fbp-summary-row"><b>{FIELD_NAME[f]}</b><span className="fbp-summary-text">{h[f]}</span><span /></div>)}
            </div>
          ))}
        </details>
      )}
    </div>
  )
}

/**
 * 대화 (10/8 시안, 10/4 18:11 "반려한 지적을 댓글처럼"): 관리자의 처리와 답 · 사용자의 승인 · 수정 요청 · 코멘트를 시각순으로.
 * 마지막 주고받음만 펼치고 앞의 것은 접는다 (10/8 11:28).
 */
function Conversation({ e }: { e: FeedbackItem }) {
  const steps = feedbackConversation(e)
  if (!steps.length) return null
  const { earlier, latest, folded } = splitThread(steps)
  // 처리 중 마지막 것에만 전후 그림과 "지금 앱에 있음"을 붙인다
  const lastHandling = steps.map((s) => s.kind === '처리' || s.kind === '다시 처리').lastIndexOf(true)
  const lastMine = steps.map((s) => s.who === '나').lastIndexOf(true)
  let rejects = 0
  const numbered = steps.map((s) => (s.who === '나' && s.kind === '반려' ? ++rejects : 0))
  const say = (s: ThreadStep, i: number) => <Say key={i} e={e} s={s} n={numbered[i]!} latestHandling={i === lastHandling} undo={i === lastMine && i === steps.length - 1 && (s.kind === '승인' || s.kind === '반려')} />
  return (
    <div className="fbp-thread-box" data-ui="주고받은 기록">
      {folded > 0 && (
        <details className="fbp-earlier" data-ui="이전 주고받음">
          <summary>{t(`이전 주고받음 ${folded}번`, `${plural(folded, 'earlier exchange')}`)}</summary>
          <ol className="fbp-thread">{earlier.map(say)}</ol>
        </details>
      )}
      <ol className="fbp-thread">{latest.map((s, i) => say(s, earlier.length + i))}</ol>
    </div>
  )
}

/** 대화 한 칸. 사용자 글은 오른쪽 위 연필로 고친다 (고친 시각이 "고침 HH:MM"으로 붙는다) */
function Say({ e, s, n, latestHandling, undo }: { e: FeedbackItem; s: ThreadStep; n: number; latestHandling: boolean; undo: boolean }) {
  const user = useContext(Account)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  if (s.kind === '대기') return <li className="fbp-say-wait muted">{t('관리자가 다시 처리하기를 기다립니다', 'Waiting for the maintainer to rework it')}</li>
  const me = s.who === '나'
  const name = me ? (user ? `${t('사용자', 'User')} (${user})` : t('사용자', 'User')) : ('by' in s && s.by ? `${t('관리자', 'Maintainer')} (${s.by})` : t('관리자', 'Maintainer'))
  const what = s.kind === '반려' ? t(`${n}번째 수정 요청`, `Change request ${n}`)
    : s.kind === '승인' ? label('승인')
      : s.kind === '코멘트' ? t('코멘트', 'Comment')
        : s.kind === '답' ? t('답만 함', 'Answered only')
          : 'commit' in s && s.commit ? t('앱에 반영됨', 'Applied to the app') : t('답만 함', 'Answered only')
  const at = 'at' in s ? s.at : undefined
  const edited = me && 'edited' in s ? s.edited : undefined
  const save = () => {
    if (!at || !draft.trim()) return
    api.editFeedbackNote(e.key, at, draft).then(() => { setEditing(false); setError(null) }).catch((err: Error) => setError(err.message))
  }
  const handling = s.kind === '처리' || s.kind === '다시 처리'
  const pictures = handling && latestHandling ? e.status?.pictures ?? [] : []
  return (
    <li className={`fbp-say${me ? ' me' : ''}`} data-ui={me ? '사용자 글' : '관리자 글'}>
      <div className="fbp-say-head">
        <b>{name}</b>
        <span>{what}</span>
        {undo && <button className="fb-link" title={t('마지막 승인·수정 요청을 되돌립니다', 'Undo the last approval or change request')} onClick={() => void api.reviewFeedback(e.key, null).catch((err: Error) => setError(err.message))}>{t('되돌리기', 'Undo')}</button>}
        <span className="sp" />
        {at && <span className="muted fbp-say-when">{whenOf(at)}{edited && ` · ${t('고침', 'edited')} ${edited.slice(11, 16)}`}</span>}
        {me && at && s.kind !== '승인' && !editing && <button className="icon-btn fbp-say-edit" data-tip={t('고치기', 'Edit')} aria-label={t(`고치기: ${whenOf(at)} 글`, `Edit: message at ${whenOf(at)}`)} onClick={() => { setDraft(s.note ?? ''); setEditing(true) }}>{Icon.pencil}</button>}
      </div>
      {editing
        ? (
          <div className="fbp-text">
            <textarea className="fbp-input" autoFocus value={draft} onChange={(ev) => setDraft(ev.target.value)}
              onKeyDown={(ev) => { if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) { ev.preventDefault(); save() } else if (ev.key === 'Escape') setEditing(false); else onListKey(ev, setDraft) }} />
            <span className="fbp-edit on">
              <button className="btn" onClick={() => setEditing(false)}>{t('취소', 'Cancel')}</button>
              <button className="btn primary" disabled={!draft.trim()} onClick={save}>{t('저장', 'Save')} <span className="kbd">⌘↵</span></button>
            </span>
          </div>
        )
        : s.note && <MemoText text={s.note} />}
      {pictures.length > 0 && (
        <div className="fbp-pictures" data-ui="전후 그림">
          {pictures.slice(0, 2).map((p, k) => (
            <figure key={p}>
              <a href={`/api/feedback/picture?path=${encodeURIComponent(p)}`} target="_blank" rel="noreferrer"><img src={`/api/feedback/picture?path=${encodeURIComponent(p)}`} alt={k ? t('고친 뒤 화면', 'Screen after the fix') : t('고치기 전 화면', 'Screen before the fix')} /></a>
              <figcaption className="muted">{k ? t('뒤', 'After') : t('전', 'Before')}</figcaption>
            </figure>
          ))}
        </div>
      )}
      {handling && 'commit' in s && s.commit && (latestHandling
        ? <span className="muted fbp-say-version">{e.status?.version ?? s.commit}<InApp e={e} /></span>
        : <span className="mono muted fbp-say-version">{s.commit}</span>)}
      {error && <span className="error-text">{error}</span>}
    </li>
  )
}

/**
 * 아래 입력란 (10/8 시안): 코멘트 · 수정 요청 · 승인을 한곳에.
 * 비었으면 승인만 켜지고, 글을 쓰면 승인은 꺼지고 코멘트 · 수정 요청이 켜진다.
 * 코멘트는 처리를 그대로 두고 묻거나 덧붙인다(관리자가 답만 한다). 수정 요청은 다시 처리하게 돌려보낸다(자료 값 반려).
 * 보류는 승인하지 않고 수정 요청으로 답한다 (10/5 22:35).
 */
function Compose({ e }: { e: FeedbackItem }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const st = stateOf(e)
  const typed = !!text.trim()
  const canApprove = !typed && (st === '반영' || st === '답변' || st === '거절' || st === '동의' || st === '나중에')
  // 다시 처리를 기다리는 동안에는 또 돌려보내지 않는다 (코멘트나 글 고치기는 된다)
  const canReject = typed && !!e.status && st !== '대기'
  const run = (p: Promise<unknown>) => {
    setBusy(true)
    p.then(() => { setText(''); setError(null) }).catch((err: Error) => setError(err.message)).finally(() => setBusy(false))
  }
  const waiting = unansweredComments(e).length > 0
  return (
    <div className="fbp-compose" data-ui="코멘트 입력란">
      <textarea rows={2} value={text} placeholder={t('코멘트나 고칠 점', 'Comment or what to change')} aria-label={t('코멘트나 고칠 점', 'Comment or what to change')}
        onChange={(ev) => setText(ev.target.value)} onKeyDown={(ev) => onListKey(ev, setText)} />
      <div className="fbp-compose-row" data-ui="승인·반려">
        {waiting && <span className="muted">{t('관리자의 답을 기다립니다', 'Waiting for the maintainer to answer')}</span>}
        {error && <span className="error-text">{error}</span>}
        <span className="sp" />
        <button className="btn" disabled={busy || !typed} onClick={() => run(api.commentFeedback(e.key, text))}>{t('코멘트', 'Comment')}</button>
        <button className="btn" disabled={busy || !canReject} onClick={() => run(api.reviewFeedback(e.key, '반려', text))}>{t('수정 요청', 'Request changes')}</button>
        <button className="btn primary" disabled={busy || !canApprove} onClick={() => run(api.reviewFeedback(e.key, '승인'))}>{t('승인', 'Approve')}</button>
      </div>
    </div>
  )
}

/** 왼쪽 띠의 피드백 버튼에 붙는 수: 답할 것 + 확인할 것. 피드백이 바뀌면 다시 센다 */
export function FeedbackRailCount({ version }: { version: number }) {
  const [n, setN] = useState<{ ask: number; confirm: number } | null>(null)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    api.feedbackAll().then((b) => setN({ ask: b.entries.filter(needsAnswer).length, confirm: b.entries.filter((e) => needsConfirm(e)).length })).catch(() => setN(null))
  }, [version, tick])
  useEffect(() => {
    const on = () => setTick((t) => t + 1)
    window.addEventListener(FEEDBACK_EVENT, on)
    const timer = window.setInterval(on, 10 * 60_000)
    return () => { window.removeEventListener(FEEDBACK_EVENT, on); window.clearInterval(timer) }
  }, [])
  if (!n || n.ask + n.confirm === 0) return null
  return <span className="rail-count" data-ui="내 차례 수" title={t(`피드백에서 확인 필요 — 답할 것 ${n.ask} · 확인할 것 ${n.confirm}`, `Feedback needs review: ${n.ask} to answer · ${n.confirm} to check`)}>{n.ask + n.confirm}</span>
}

/** 피드백 글: 읽기, 고치기, 지우기. 피드백 화면과 피드백 모드의 "이번에 남긴 코멘트"가 함께 쓴다 */
export function FeedbackText({ e, onChanged }: { e: Pick<FeedbackItem, 'date' | 'time' | 'target' | 'n' | 'text'>; onChanged?(text: string | null): void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(e.text)
  const [error, setError] = useState<string | null>(null)
  const at = { date: e.date, time: e.time, target: e.target, n: e.n }
  const save = (text: string | null) => {
    api.editFeedback(at, text).then(() => { setEditing(false); setError(null); onChanged?.(text) }).catch((err: Error) => setError(err.message))
  }
  if (!editing) {
    return (
      <div className="fbp-text">
        <MemoText text={e.text} />
        {/* 10/4 15:54 "고치기 지우기 우측 상단으로 옮기고 아이콘으로" */}
        <span className="fbp-edit fbp-edit-icons hover-actions">
          <button className="icon-btn" title={t('고치기', 'Edit')} aria-label={t(`고치기: ${e.date} ${e.time} 피드백`, `Edit: ${e.date} ${e.time} feedback`)} onClick={() => { setDraft(e.text); setEditing(true) }}>{Icon.pencil}</button>
          <button className="icon-btn" title={t('지우기', 'Delete')} aria-label={t(`지우기: ${e.date} ${e.time} 피드백`, `Delete: ${e.date} ${e.time} feedback`)}
            onClick={() => void askConfirm({ title: t('이 피드백을 지울까요?', 'Delete this feedback?'), hint: t('그날 피드백 파일에서 이 항목만 지워지고, 처리 기록(feedback/status.yaml)은 그대로 남습니다.', 'Only this item is removed from that day\'s feedback file. The handling record (feedback/status.yaml) stays.'), ok: t('지우기', 'Delete') }).then((y) => { if (y) save(null) })}>{Icon.trash}</button>
        </span>
        {error && <div className="error-text">{error}</div>}
      </div>
    )
  }
  return (
    <div className="fbp-text">
      <textarea className="fbp-input" autoFocus value={draft} onChange={(ev) => setDraft(ev.target.value)}
        onKeyDown={(ev) => { if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) { ev.preventDefault(); if (draft.trim()) save(draft) } else if (ev.key === 'Escape') setEditing(false); else onListKey(ev, setDraft) }} />
      <span className="fbp-edit on">
        <button className="btn" onClick={() => setEditing(false)}>{t('취소', 'Cancel')}</button>
        <button className="btn primary" disabled={!draft.trim()} onClick={() => save(draft)}>{t('저장', 'Save')} <span className="kbd">⌘↵</span></button>
      </span>
      {error && <div className="error-text">{error}</div>}
    </div>
  )
}

/** 교정문을 보여 주고, 원문은 눌러서 본다 (원문 고치기·지우기는 원문 쪽에서) */
function CleanText({ e }: { e: FeedbackItem }) {
  const [raw, setRaw] = useState(false)
  return (
    <div>
      {raw ? (e.source ? <div className="fbp-text"><MemoText text={e.text} /></div> : <FeedbackText e={e} />) : <div className="fbp-text"><MemoText text={e.status!.clean!} /></div>}
      <button className="fb-link fbp-raw" onClick={() => setRaw((v) => !v)}>{raw ? t('교정문 보기', 'Show corrected text') : t('원문 보기', 'Show original')}</button>
    </div>
  )
}

/**
 * 피드백 › 피드백 등록 (10/8 피드백: "GitHub에 올리기" 대신): 이 맥에서 남겼지만 아직 GitHub에 없는 피드백만 올려 클라우드의 Claude가 읽게 한다.
 * GitHub에 새 버전이 있어도 앱 코드는 받지 않고 피드백만 그 위에 얹는다.
 * 늘 같은 자리에 둔다 (올릴 것이 없으면 흐리게). 올리지 않는 모드(개발용 예제)에서만 숨긴다.
 * 실사용 앱은 피드백을 남기면 30초 뒤 저절로 올린다(서버). 버튼은 바로 올리거나, 자동 올리기가 실패했을 때 다시 올리는 데 쓴다.
 */
function PublishButton({ tick, version }: { tick: number; version: number }) {
  const [files, setFiles] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ text: string; error: boolean } | null>(null)
  const [again, setAgain] = useState(0)
  const [publishable, setPublishable] = useState(false)
  const [auto, setAuto] = useState<{ on: boolean; error: string | null }>({ on: false, error: null })
  useEffect(() => {
    fetch('/api/feedback').then((r) => r.json()).then((b) => {
      setPublishable(!!b.publishable)
      setAuto({ on: !!b.autoPublish, error: b.lastAutoPublish?.error ?? null })
    }).catch(() => setPublishable(false))
  }, [version, tick, again])
  useEffect(() => { records.feedbackUnpublished().then(setFiles).catch(() => setFiles([])) }, [tick, version, again])

  const publish = async () => {
    setBusy(true); setNote(null)
    try { setNote({ text: (await records.publishFeedback()).message, error: false }) } catch (e) { setNote({ text: (e as Error).message, error: true }) } finally {
      setBusy(false); setAgain((n) => n + 1)
    }
  }

  return (
    <>
      {!note && auto.error && files.length > 0 && <span className="error-text" data-ui="올리기 결과" style={{ fontSize: 'var(--fs-sm)', marginRight: 'var(--sp-2)' }}>{t('저절로 등록하지 못했습니다', 'Automatic registration failed')}: {auto.error}</span>}
      {note && <span className={note.error ? 'error-text' : 'muted'} data-ui="올리기 결과" style={{ fontSize: 'var(--fs-sm)', marginRight: 'var(--sp-2)' }}>{note.text}</span>}
      {publishable && (
        <button className={`btn${files.length > 0 ? ' primary' : ''}`} data-ui="GitHub에 올리기" disabled={busy || files.length === 0} style={{ marginRight: 'var(--sp-2)' }} onClick={() => void publish()}
          title={files.length > 0 ? `${auto.on ? t('남긴 뒤 30초 지나면 저절로 등록됩니다. 지금 바로 등록하려면 누르세요.\n', 'Feedback is registered automatically 30 seconds after you leave it. Click to register now.\n') : ''}${t('아직 GitHub에 없는 피드백만 GitHub에 올려 등록합니다. 다른 파일은 올리지 않습니다', 'Pushes only feedback not yet on GitHub. No other files are pushed')}\n\n${files.join('\n')}` : t('남긴 피드백이 모두 GitHub에 등록되어 있습니다', 'All feedback is registered on GitHub')}>
          {busy ? t('등록 중…', 'Registering…') : files.length > 0 ? `${t('피드백 등록', 'Register feedback')} · ${files.length}` : t('모두 등록함', 'All registered')}
        </button>
      )}
    </>
  )
}
