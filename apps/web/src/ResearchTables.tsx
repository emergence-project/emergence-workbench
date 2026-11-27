import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { answerRule, rulesView, type RuleEntry, type RuleRow, type RulesView } from './api'
import { flash } from './flash'
import { t } from './i18n'
import { qk, queryClient } from './queries'

/**
 * 소개 › 연구의 두 표 (2026-11-27 사용자 결정 "추천대로"): 연구 중인 기능과 실험 · 에이전트 규칙.
 * 정본은 저장소의 docs/rules/registry.json 하나이고, 서버가 git 이력에서 잰 값과 사용자 답(피드백 폴더 rules.yaml)을 붙여 준다.
 * 사용자 차례(판정 「결정 필요」에 답이 없는 줄)만 주황이고 펼쳐져 있다. 유지 · 완화 · 지켜봄 · 보류는 글자로만 둔다.
 */

const VERDICT: Record<RuleEntry['verdict'], string> = {
  keep: t('유지', 'Keep'), relaxed: t('완화', 'Relaxed'), removed: t('없앰', 'Removed'), ask: t('결정 필요', 'Needs decision'),
  watch: t('지켜봄', 'Watching'), hold: t('보류', 'On hold'), reverted: t('되돌림', 'Reverted'),
}
const AUDIENCE: Record<NonNullable<RuleEntry['audience']>, string> = { uses: t('앱을 쓰는 에이전트', 'Agents using the app'), fixes: t('앱을 고치는 에이전트', 'Agents fixing the app'), both: t('둘 다', 'Both') }
const ENFORCE: Record<NonNullable<RuleEntry['enforce']>, string> = { prompt: t('글', 'Written'), code: t('코드', 'Code'), both: t('글과 코드', 'Both') }
const GONE = new Set<RuleEntry['verdict']>(['removed', 'reverted'])

export const useRulesView = () => useQuery({ queryKey: qk.rules, queryFn: rulesView, staleTime: 60_000 })
/** 사용자가 정할 줄: 판정이 결정 필요인데 아직 답이 없는 것 (서버 needsUser와 같다) */
export const needsUser = (r: RuleRow) => r.entry.verdict === 'ask' && !r.answer
/** 레일의 수 · 알림 「답할 것」: 답을 적을 수 있을 때만 센다 */
export function useRuleAsks(): RuleRow[] {
  const v = useRulesView().data
  return v?.answerable ? v.rows.filter(needsUser) : []
}
/** 결정을 기다리는 줄이 있는 소개 쪽 (실험은 research, 규칙은 rules) */
export const askPart = (r: RuleRow) => (r.entry.kind === 'experiment' ? 'research' : 'rules')

const day = (d: string) => d.slice(5).replace('-', '/')
const today = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10) }

function Verdict({ row }: { row: RuleRow }) {
  const you = needsUser(row)
  return (
    <span className={`rt-verdict${you ? ' you' : ''}`}>
      {you && <span className="rt-dot" aria-hidden />}
      {VERDICT[row.entry.verdict]}
      {row.entry.kind === 'safety' && <span className="tag">{t('안전', 'Safety')}</span>}
    </span>
  )
}

const WHEN_REVISITED = t('다시 정할 때', 'When revisited')
/** 설정 › 기능의 실험 줄: 이 표와 같은 판정 이름과 다시 볼 날 (보류는 날짜 대신 「다시 정할 때」) */
export function reviewLine(e: Pick<RuleEntry, 'verdict' | 'review'>): string {
  const verdict = VERDICT[e.verdict] ?? e.verdict
  if (e.verdict === 'hold') return `${verdict} · ${WHEN_REVISITED}`
  if (GONE.has(e.verdict)) return verdict
  return `${verdict} · ${t('다시 볼 날', 'review')} ${day(e.review)}${e.review <= today() ? ` ${t('지남', 'due')}` : ''}`
}

function Review({ e }: { e: RuleEntry }) {
  if (e.verdict === 'hold') return <span className="muted">{WHEN_REVISITED}</span>
  if (GONE.has(e.verdict)) return <span className="muted">—</span>
  const due = e.review <= today()
  return <span className={due ? 'rt-due' : ''}>{day(e.review)}{due && ` ${t('지남', 'due')}`}</span>
}

/** 잰 것: 의례 줄의 비율 · 지키는 파일을 고친 커밋 수 (git 이력), 없으면 판단 기준(실험) */
function measured(r: RuleRow): string {
  const m = r.measured
  if (m?.attest !== undefined && m.commits) return t(`줄 ${Math.round((100 * m.attest) / m.commits)}%`, `lines ${Math.round((100 * m.attest) / m.commits)}%`)
  if (m?.touch !== undefined) return t(`고친 커밋 ${m.touch}`, `${m.touch} commits`)
  return r.entry.gauge ?? '—'
}

function Answer({ row }: { row: RuleRow }) {
  const [busy, setBusy] = useState(false)
  if (row.answer) return <div className="rt-more"><span><b>{t('답', 'Answer')}</b> {row.answer.answer === '진행' ? t('진행', 'Proceed') : t('그대로 두기', 'Leave as is')} · {row.answer.at.replace('T', ' ')} · {t('에이전트가 다음 규칙 점검에서 반영합니다', 'An agent applies it at the next rules review')}</span></div>
  if (row.entry.verdict !== 'ask') return null
  const send = async (a: '진행' | '그대로') => {
    setBusy(true)
    try { queryClient.setQueryData<RulesView>(qk.rules, await answerRule(row.entry.id, a)) } catch (e) { flash(e instanceof Error ? e.message : String(e), undefined, { error: true }) } finally { setBusy(false) }
  }
  return (
    <div className="rt-btns">
      <button className="btn primary" data-ui="규칙 진행" disabled={busy} onClick={() => void send('진행')}>{t('진행', 'Proceed')}</button>
      <button className="btn" data-ui="규칙 그대로 두기" disabled={busy} onClick={() => void send('그대로')}>{t('그대로 두기', 'Leave as is')}</button>
    </div>
  )
}

/** 펼친 줄: 왜 · 어디 · 잰 것 · 메모 · 코드로 옮길 길 · 답 */
function More({ row }: { row: RuleRow }) {
  const e = row.entry
  const m = row.measured
  return (
    <>
      <div className="rt-more">
        <span><b>{t('이유', 'Why')}</b> {day(e.since)} · {e.why}</span>
        <span><b>{t('어디', 'Where')}</b> {e.where}</span>
        {m && <span><b>{t('잰 것', 'Measured')}</b> {t(`최근 커밋 ${m.commits}개`, `${m.commits} recent commits`)}{m.attest !== undefined && t(` 가운데 ${m.attest}개가 이 규칙 때문에 줄을 씀`, `, ${m.attest} wrote a line because of this rule`)}{m.touch !== undefined && t(` · 지키는 파일을 고친 커밋 ${m.touch}개`, ` · ${m.touch} touched the guarded files`)}</span>}
        {e.gauge && <span><b>{t('잴 것', 'Gauge')}</b> {e.gauge}</span>}
        <span><b>{t('메모', 'Note')}</b> {e.note}</span>
        {e.toCode && <span><b>{t('코드로 옮길 길', 'Way to move it into code')}</b> {e.toCode}</span>}
        {row.flags.map((f) => <span key={f} className="rt-due">{f}</span>)}
      </div>
      <Answer row={row} />
    </>
  )
}

function Row({ row, cols }: { row: RuleRow; cols: 'rule' | 'exp' }) {
  const [open, setOpen] = useState(needsUser(row))
  const e = row.entry
  return (
    <div className={`rt-row${needsUser(row) ? ' you' : ''}`} id={`rule-${e.id}`}>
      <button className="rt-name" aria-expanded={open} onClick={() => setOpen(!open)}>{e.rule}</button>
      {cols === 'rule' ? <span className="tag">{ENFORCE[e.enforce ?? 'prompt']}</span> : <span className="num">{day(e.since)}</span>}
      <Verdict row={row} />
      <span className="num rt-cut">{measured(row)}</span>
      <span className="num"><Review e={e} /></span>
      {open && <More row={row} />}
    </div>
  )
}

function Head({ cols }: { cols: 'rule' | 'exp' }) {
  return (
    <div className="rt-row head">
      <span>{cols === 'rule' ? t('규칙', 'Rule') : t('연구 · 실험', 'Feature or experiment')}</span>
      <span>{cols === 'rule' ? t('방식', 'How') : t('시작', 'Since')}</span>
      <span>{t('판정', 'Verdict')}</span>
      <span>{cols === 'rule' ? t('잰 것', 'Measured') : t('잴 것', 'Gauge')}</span>
      <span>{t('다시 볼 날', 'Review')}</span>
    </div>
  )
}

/** 되돌리거나 없앤 줄: 지우지 않고 이유와 함께 접어 둔다 */
function Gone({ rows }: { rows: RuleRow[] }) {
  if (!rows.length) return null
  return (
    <details className="rt-gone">
      <summary>{t(`되돌리거나 없앤 것 ${rows.length}`, `Reverted or removed: ${rows.length}`)}</summary>
      {rows.map((r) => <div key={r.entry.id} className="rt-gone-row"><b>{r.entry.rule}</b> · {VERDICT[r.entry.verdict]} {day(r.entry.review)} · {r.entry.note}</div>)}
    </details>
  )
}

/** 내려받은 앱: 앱 저장소의 목록이 없다 */
const Missing = () => <p className="muted">{t('이 앱에는 규칙 목록이 없습니다. 앱 저장소(docs/rules/registry.json)에서 앱을 돌릴 때 보입니다.', 'This copy of the app has no rule list. It shows when the app runs from its repository (docs/rules/registry.json).')}</p>

function useRows(): { v?: RulesView; error?: string } {
  const q = useRulesView()
  return { v: q.data, error: q.error ? String(q.error) : undefined }
}

/** 소개 › 연구 › 연구 중인 기능과 실험 */
export function ExperimentsTable() {
  const { v, error } = useRows()
  if (error) return <p className="error-text">{error}</p>
  if (!v) return <p className="muted">{t('불러오는 중', 'Loading')}</p>
  if (!v.rows.length) return <Missing />
  const all = v.rows.filter((r) => r.entry.kind === 'experiment')
  const live = all.filter((r) => !GONE.has(r.entry.verdict))
  const count = (vd: RuleEntry['verdict']) => all.filter((r) => r.entry.verdict === vd).length
  return (
    <div className="rt" data-ui="연구 표">
      <div className="rt-meta">{t(`${all.length}개 · 지켜봄 ${count('watch')} · 보류 ${count('hold')} · 되돌림 ${count('reverted')}`, `${all.length} · watching ${count('watch')} · on hold ${count('hold')} · reverted ${count('reverted')}`)}</div>
      <div className="rt-tbl"><Head cols="exp" />{live.map((r) => <Row key={r.entry.id} row={r} cols="exp" />)}</div>
      <Gone rows={all.filter((r) => GONE.has(r.entry.verdict))} />
    </div>
  )
}

type Who = 'all' | 'uses' | 'fixes'
type How = 'all' | 'prompt' | 'code'
const hits = (x: string | undefined, want: string) => want === 'all' || x === want || x === 'both'

/** 소개 › 연구 › 에이전트 규칙: 대상 × 방식 */
export function RulesTable() {
  const { v, error } = useRows()
  const [who, setWho] = useState<Who>('all')
  const [how, setHow] = useState<How>('all')
  if (error) return <p className="error-text">{error}</p>
  if (!v) return <p className="muted">{t('불러오는 중', 'Loading')}</p>
  if (!v.rows.length) return <Missing />
  const rules = v.rows.filter((r) => r.entry.kind !== 'experiment')
  const live = rules.filter((r) => !GONE.has(r.entry.verdict))
  const shown = live.filter((r) => hits(r.entry.audience, who) && hits(r.entry.enforce, how))
  const n = (f: (r: RuleRow) => boolean) => live.filter(f).length
  const seg = <K extends string>(cur: K, set: (k: K) => void, opts: [K, string][], ui: string) => (
    <div className="segmented small" role="radiogroup" data-ui={ui}>
      {opts.map(([k, label]) => <button key={k} role="radio" aria-checked={cur === k} className={cur === k ? 'on' : ''} onClick={() => set(k)}>{label}</button>)}
    </div>
  )
  const groups = (['fixes', 'uses', 'both'] as const).map((a) => ({ a, rows: shown.filter((r) => r.entry.audience === a) })).filter((g) => g.rows.length)
  // 사용자 차례인 줄은 묶음 안에서 맨 위
  const order = (rows: RuleRow[]) => [...rows.filter(needsUser), ...rows.filter((r) => !needsUser(r))]
  return (
    <div className="rt" data-ui="규칙 표">
      <div className="rt-meta">{t(`규칙 ${live.length} · 글 ${n((r) => r.entry.enforce === 'prompt')} · 코드 ${n((r) => r.entry.enforce !== 'prompt')} · 최근 ${v.days}일 커밋 ${v.commits}`, `${live.length} rules · written ${n((r) => r.entry.enforce === 'prompt')} · code ${n((r) => r.entry.enforce !== 'prompt')} · ${v.commits} commits in ${v.days} days`)}</div>
      <div className="rt-filters">
        {seg(who, setWho, [['all', t(`전체 ${live.length}`, `All ${live.length}`)], ['uses', t(`앱을 쓰는 ${n((r) => hits(r.entry.audience, 'uses'))}`, `Using ${n((r) => hits(r.entry.audience, 'uses'))}`)], ['fixes', t(`앱을 고치는 ${n((r) => hits(r.entry.audience, 'fixes'))}`, `Fixing ${n((r) => hits(r.entry.audience, 'fixes'))}`)]], '규칙 대상')}
        {seg(how, setHow, [['all', t('전체', 'All')], ['prompt', t('글', 'Written')], ['code', t('코드', 'Code')]], '규칙 방식')}
      </div>
      <div className="rt-tbl">
        <Head cols="rule" />
        {groups.map((g) => (
          <div key={g.a} className="rt-group">
            <div className="rt-group-head">{AUDIENCE[g.a]} · {g.rows.length}</div>
            {order(g.rows).map((r) => <Row key={r.entry.id} row={r} cols="rule" />)}
          </div>
        ))}
      </div>
      <Gone rows={rules.filter((r) => GONE.has(r.entry.verdict))} />
    </div>
  )
}
