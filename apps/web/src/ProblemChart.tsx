import type { KeyboardEvent, ReactNode } from 'react'
import { useQueries } from '@tanstack/react-query'
import { problemsApi, type Attempt, type Claim, type ProblemDoc, type ProblemRow } from './api'
import { t } from './i18n'
import { branchPoints, chartGeo, CW, layoutTree, RH, ROOT, roundedPath, wrapName } from './problemLayout'
import { ANSWER_NAME, ATTEMPT_NAME, SIDE_NAME } from './problemNames'
import { qk } from './queries'

/**
 * 흐름 차트 (11/13 사용자 결정 "점 = 주장, 시도는 근거"): 옛 흐름 차트의 모양(기호 아래 이름, 둥글게 꺾이는 선, 왼쪽에서 오른쪽으로 갈라지는 가지)에
 * 지금의 흐름을 그린다. 여는 점 ◇는 질문, 점 ○ 하나는 판단할 수 있는 주장 하나이고 색은 그 주장의 상태다. 선은 근거 관계다 (오른쪽 주장이 왼쪽 주장을 받친다).
 * 점 위의 작은 점들은 그 주장을 겨눈 시도이고(시도마다 하나, 색은 시도의 상태), 질문 위의 작은 점들은 아직 주장 없이 질문을 바로 겨눈 시도다.
 * 목록 보기와 같은 자료를 그리기만 하고, 점을 누르면 그 주장의 미리보기를 연다. 배치는 problemLayout.ts.
 */

/** 이름 한 줄의 폭(한글 글자 수)과 줄 간격, 점 위 작은 점(시도)의 높이 · 간격 */
const NAME_W = 12, LINE = 14, NAME_Y = 31, PIP_Y = -24, PIP_GAP = 9, PIP_MAX = 8

/** 질문 점을 고른 것 (주장은 번호가 1부터다) */
export const ROOT_ID = '0'

type Flow = Pick<ProblemRow, 'state' | 'used' | 'limit' | 'stop' | 'answer'> & { claims: readonly Claim[]; attempts: readonly Attempt[] }

/** 점 아래 옅은 한 줄: 상태 이름과, 질문 바로 아래면 어느 쪽 근거인지. 아래 주장을 기다리면 그것을 먼저 */
export function claimTally(c: Claim): string {
  const state = c.rejected ? t('기각', 'Rejected') : c.state === 'holds' && c.accepted ? t('승인', 'Accepted') : ATTEMPT_NAME[c.state]
  const side = c.side ? SIDE_NAME[c.side] : ''
  if (c.state === 'holds' && c.stale) return `${state} · ${t('판정 후 변경', 'Changed after verdict')}`
  if (c.waiting) return side ? `${t('근거 대기', 'Awaiting grounds')} · ${side}` : `${state} · ${t('근거 대기', 'Awaiting grounds')}`
  return side ? `${state} · ${side}` : state
}

const pressed = (run: () => void) => (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); run() } }

function Names({ x, y, lines, sub, strong }: { x: number; y: number; lines: string[]; sub?: string; strong?: boolean }) {
  return <>
    {lines.map((line, i) => <text key={i} className={`pb-c-name${strong ? ' strong' : ''}`} x={x} y={y + NAME_Y + i * LINE} textAnchor="middle">{line}</text>)}
    {sub && <text className="pb-c-tally" x={x} y={y + NAME_Y + lines.length * LINE + 1} textAnchor="middle">{sub}</text>}
  </>
}

/** 점 위의 작은 점들: 시도마다 하나, 색은 시도의 상태. 많으면 앞의 것만 그리고 끝에 수를 적는다 */
function Pips({ x, y, list }: { x: number; y: number; list: readonly Attempt[] }) {
  if (!list.length) return null
  const shown = list.slice(0, PIP_MAX), more = list.length - shown.length
  const x0 = x - ((shown.length - 1) * PIP_GAP) / 2 - (more ? 6 : 0)
  return <g aria-hidden>
    {shown.map((a, i) => <g key={a.id} className={`pb-c-m s-${a.state}`}><circle className="pb-c-pip" cx={x0 + i * PIP_GAP} cy={y + PIP_Y} r={3} /></g>)}
    {more > 0 && <text className="pb-c-tally" x={x0 + shown.length * PIP_GAP - 2} y={y + PIP_Y + 3}>+{more}</text>}
  </g>
}
const triesSaid = (list: readonly Attempt[]) => (list.length ? t(`시도 ${list.length}: ${list.map((a) => `${a.label} ${ATTEMPT_NAME[a.state]}`).join(', ')}`, `Attempts ${list.length}: ${list.map((a) => `${a.label} ${ATTEMPT_NAME[a.state]}`).join(', ')}`) : t('시도 없음', 'No attempts'))

/** 흐름 하나의 나무. rootName을 주면 질문 점 아래에 그 이름을 적는다(흐름 하나 화면: 질문 글은 위 제목에 있다) */
export function TreeChart({ flow, selected, rootName, onPick, onRoot }: {
  flow: Flow; selected?: string | null; rootName?: string
  onPick(c: Claim): void
  /** 질문 점을 누를 때 (없으면 누르는 점이 아니다) */
  onRoot?: () => void
}) {
  const layout = layoutTree(flow.claims.map((c) => ({ id: c.id, parent: c.under })))
  const g = chartGeo(layout)
  const rx = g.X(ROOT.c), ry = g.Y(ROOT.r)
  const tries = (id: string | undefined) => flow.attempts.filter((a) => a.claim === id)
  const direct = tries(undefined)
  const rootState = flow.state === 'open' ? 'active' : flow.state !== 'closed' ? 'candidate' : flow.answer ? 'holds' : 'dropped'
  const rootSub = flow.state === 'closed' && flow.answer ? t(`답: ${ANSWER_NAME[flow.answer]}`, `Answer: ${ANSWER_NAME[flow.answer]}`)
    : flow.state === 'open' ? t(`시도 ${flow.used}/${flow.limit}`, `Attempts ${flow.used}/${flow.limit}`) : undefined
  const rootOn = selected === ROOT_ID
  const root: ReactNode = <>
    {rootOn && <circle className="pb-c-sel" cx={rx} cy={ry} r={18} />}
    <Pips x={rx} y={ry} list={direct} />
    <g className={`pb-c-m s-${rootState}`}>
      <rect className="pb-c-b" x={rx - 9.5} y={ry - 9.5} width={19} height={19} rx={3} transform={`rotate(45 ${rx} ${ry})`} />
      <text className="pb-c-g" x={rx} y={ry} dy=".36em" textAnchor="middle">?</text>
    </g>
    {rootName && <Names x={rx} y={ry} lines={[rootName]} sub={rootSub} strong />}
  </>
  return (
    <svg className="pb-c" width={g.width} height={g.height} viewBox={`0 0 ${g.width} ${g.height}`} role="group" aria-label={t('주장 차트', 'Claim chart')}>
      {flow.claims.map((c) => {
        const to = layout.at.get(c.id)
        const from = (c.under && layout.at.get(c.under)) || ROOT
        return to && <path key={c.id} className={`pb-c-e${c.state === 'dropped' ? ' dim' : ''}`} d={roundedPath(branchPoints(from, to, g))} />
      })}
      {onRoot ? <g className={`pb-c-node${rootOn ? ' on' : ''}`} tabIndex={0} role="button" aria-pressed={rootOn} aria-label={`${t('질문', 'Question')}: ${triesSaid(direct)}`} data-ui="질문 점" onClick={onRoot} onKeyDown={pressed(onRoot)}>
        <title>{`${t('질문', 'Question')}\n${triesSaid(direct)}`}</title>
        <rect className="pb-c-hit" x={rx - 26} y={ry - 26} width={52} height={46} rx={8} />{root}
      </g> : <g aria-hidden>{root}</g>}
      {flow.claims.map((c) => {
        const cell = layout.at.get(c.id)
        if (!cell) return null
        const x = g.X(cell.c), y = g.Y(cell.r)
        const lines = wrapName(c.statement, NAME_W)
        const sub = claimTally(c)
        const own = tries(c.id)
        const on = selected === c.id
        const turn = c.state === 'holds' && !!c.stale
        return (
          <g key={c.id} className={`pb-c-node s-${c.state}${on ? ' on' : ''}`} tabIndex={0} role="button" aria-pressed={on} aria-label={`${c.id} ${sub}: ${c.statement}. ${triesSaid(own)}`}
            data-ui="점" data-ui-item={`${c.id} ${c.statement}`} onClick={() => onPick(c)} onKeyDown={pressed(() => onPick(c))}>
            <title>{`${c.id} · ${sub}\n${c.statement}\n${triesSaid(own)}`}</title>
            <rect className="pb-c-hit" x={x - CW / 2 + 4} y={y - 26} width={CW - 8} height={RH - 6} rx={8} />
            {turn && <circle className="pb-c-turn" cx={x} cy={y} r={17} />}
            {on && <circle className="pb-c-sel" cx={x} cy={y} r={turn ? 20.5 : 17} />}
            <Pips x={x} y={y} list={own} />
            <g className={`pb-c-m s-${c.state}`}>
              <circle className="pb-c-b" cx={x} cy={y} r={12.5} />
              <text className={`pb-c-g${c.id.length > 2 ? ' long' : ''}`} x={x} y={y} dy=".36em" textAnchor="middle">{c.id}</text>
            </g>
            <Names x={x} y={y} lines={lines} sub={sub} />
          </g>
        )
      })}
    </svg>
  )
}

/**
 * 여러 흐름의 차트: 줄마다 흐름 하나. 왼쪽 칸(label)은 질문과 수이고, 나무만 옆으로 밀린다.
 * 나무는 흐름 하나의 자료(주장 · 시도)가 있어야 그릴 수 있어 줄마다 읽는다 (흐름 하나 화면과 같은 캐시 키)
 */
export function FlowsChart({ rid, rows, label, onPick, onRoot }: {
  rid: string; rows: readonly ProblemRow[]
  label(p: ProblemRow): ReactNode
  onPick(p: ProblemRow, c: Claim): void
  onRoot(p: ProblemRow): void
}) {
  const docs = useQueries({ queries: rows.map((p) => ({ queryKey: qk.problem(rid, p.id), queryFn: (): Promise<ProblemDoc> => problemsApi(rid).get(p.id) })) })
  return (
    <div className="pb-chart" data-ui="흐름 차트">
      {rows.map((p, i) => (
        <div key={p.id} className="pb-chart-row" data-ui="차트 줄" data-ui-item={p.question}>
          <div className="pb-chart-q">{label(p)}</div>
          <div className="pb-chart-tree"><TreeChart flow={docs[i]?.data ?? { ...p, claims: [], attempts: [] }} onPick={(c) => onPick(p, c)} onRoot={() => onRoot(p)} /></div>
        </div>
      ))}
    </div>
  )
}
