import type { KeyboardEvent, ReactNode } from 'react'
import { useQueries } from '@tanstack/react-query'
import { problemsApi, type Attempt, type ProblemDoc, type ProblemRow } from './api'
import { t } from './i18n'
import { branchPoints, chartGeo, CW, layoutTree, RH, ROOT, roundedPath, wrapName } from './problemChart'
import { ANSWER_NAME, ATTEMPT_NAME, SIDE_NAME } from './problemNames'
import { qk } from './queries'

/**
 * 흐름 차트 (11/12 사용자 결정 "점 = 시도로 되살리기"): 옛 흐름 차트의 모양(기호 아래 이름, 둥글게 꺾이는 선, 왼쪽에서 오른쪽으로 갈라지는 가지)에
 * 지금의 흐름을 그린다. 여는 점 ◇는 질문, 점 ○ 하나는 시도 하나(주장과 근거)이고 색은 시도의 상태다.
 * 목록 보기와 같은 자료를 그리기만 하고, 점을 누르면 그 시도의 내용을 연다. 배치는 problemChart.ts.
 */

/** 이름 한 줄의 폭(한글 글자 수)과 줄 간격 */
const NAME_W = 12, LINE = 14, NAME_Y = 31

type Flow = Pick<ProblemRow, 'state' | 'used' | 'limit' | 'stop' | 'answer'> & { attempts: readonly Attempt[] }

const claimed = (a: Attempt) => !!a.statement && (a.state === 'holds' || a.state === 'reported')
const stale = (a: Attempt) => !!a.restated || !!a.changed?.length

/** 점 아래 옅은 한 줄: 상태 이름과, 주장이 있으면 질문의 어느 쪽 근거인지 */
function tally(a: Attempt, flow: Flow): string {
  const state = a.state === 'holds' && a.accepted ? t('승인', 'Accepted') : ATTEMPT_NAME[a.state]
  const more = a.state === 'holds' && stale(a) ? t('판정 후 변경', 'Changed after verdict')
    : claimed(a) && a.side ? SIDE_NAME[a.side]
    : a.state === 'candidate' && a.next && !flow.stop ? t('다음', 'Next')
    : a.state === 'active' && a.returned ? t('수정 요청', 'Sent back')
    : a.needs === 'all' ? t('분해', 'All') : ''
  return more ? `${state} · ${more}` : state
}

const pressed = (run: () => void) => (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); run() } }

function Names({ x, y, lines, sub, strong }: { x: number; y: number; lines: string[]; sub?: string; strong?: boolean }) {
  return <>
    {lines.map((line, i) => <text key={i} className={`pb-c-name${strong ? ' strong' : ''}`} x={x} y={y + NAME_Y + i * LINE} textAnchor="middle">{line}</text>)}
    {sub && <text className="pb-c-tally" x={x} y={y + NAME_Y + lines.length * LINE + 1} textAnchor="middle">{sub}</text>}
  </>
}

/** 흐름 하나의 나무. rootName을 주면 질문 점 아래에 그 이름을 적는다(흐름 하나 화면: 질문 글은 위 제목에 있다) */
export function TreeChart({ flow, selected, rootName, onPick, onRoot }: {
  flow: Flow; selected?: string | null; rootName?: string
  onPick(a: Attempt): void
  /** 질문 점을 누를 때 (없으면 누르는 점이 아니다) */
  onRoot?: () => void
}) {
  const layout = layoutTree(flow.attempts)
  const g = chartGeo(layout)
  const rx = g.X(ROOT.c), ry = g.Y(ROOT.r)
  const rootState = flow.state === 'open' ? 'active' : flow.state !== 'closed' ? 'candidate' : flow.answer ? 'holds' : 'dropped'
  const rootSub = flow.state === 'closed' && flow.answer ? t(`답: ${ANSWER_NAME[flow.answer]}`, `Answer: ${ANSWER_NAME[flow.answer]}`)
    : flow.state === 'open' ? t(`시도 ${flow.used}/${flow.limit}`, `Attempts ${flow.used}/${flow.limit}`) : undefined
  const root: ReactNode = <>
    <g className={`pb-c-m s-${rootState}`}>
      <rect className="pb-c-b" x={rx - 9.5} y={ry - 9.5} width={19} height={19} rx={3} transform={`rotate(45 ${rx} ${ry})`} />
      <text className="pb-c-g" x={rx} y={ry} dy=".36em" textAnchor="middle">?</text>
    </g>
    {rootName && <Names x={rx} y={ry} lines={[rootName]} sub={rootSub} strong />}
  </>
  return (
    <svg className="pb-c" width={g.width} height={g.height} viewBox={`0 0 ${g.width} ${g.height}`} role="group" aria-label={t('시도 차트', 'Attempt chart')}>
      {flow.attempts.map((a) => {
        const to = layout.at.get(a.id)
        const from = (a.parent && layout.at.get(a.parent)) || ROOT
        return to && <path key={a.id} className={`pb-c-e${a.state === 'dropped' ? ' dim' : ''}`} d={roundedPath(branchPoints(from, to, g))} />
      })}
      {onRoot ? <g className="pb-c-node" tabIndex={0} role="button" aria-label={t('질문 열기', 'Open the question')} onClick={onRoot} onKeyDown={pressed(onRoot)}>
        <rect className="pb-c-hit" x={rx - 22} y={ry - 20} width={44} height={40} rx={8} />{root}
      </g> : <g aria-hidden>{root}</g>}
      {flow.attempts.map((a) => {
        const cell = layout.at.get(a.id)
        if (!cell) return null
        const x = g.X(cell.c), y = g.Y(cell.r)
        const name = claimed(a) ? a.statement! : a.method
        const lines = wrapName(name, NAME_W)
        const sub = tally(a, flow)
        const on = selected === a.id
        const turn = a.state === 'holds' && stale(a)
        return (
          <g key={a.id} className={`pb-c-node s-${a.state}${on ? ' on' : ''}`} tabIndex={0} role="button" aria-pressed={on} aria-label={`${a.label} ${sub}: ${name}`}
            data-ui="점" data-ui-item={`${a.label} ${a.method}`} onClick={() => onPick(a)} onKeyDown={pressed(() => onPick(a))}>
            <title>{`${a.label} · ${sub}\n${name}`}</title>
            <rect className="pb-c-hit" x={x - CW / 2 + 4} y={y - 20} width={CW - 8} height={RH - 8} rx={8} />
            {turn && <circle className="pb-c-turn" cx={x} cy={y} r={17} />}
            {on && <circle className="pb-c-sel" cx={x} cy={y} r={turn ? 20.5 : 17} />}
            <g className={`pb-c-m s-${a.state}`}>
              <circle className="pb-c-b" cx={x} cy={y} r={12.5} />
              <text className={`pb-c-g${a.label.length > 2 ? ' long' : ''}`} x={x} y={y} dy=".36em" textAnchor="middle">{a.label}</text>
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
 * 나무는 흐름 하나의 자료(시도)가 있어야 그릴 수 있어 줄마다 읽는다 (흐름 하나 화면과 같은 캐시 키)
 */
export function FlowsChart({ rid, rows, label, onPick, onRoot }: {
  rid: string; rows: readonly ProblemRow[]
  label(p: ProblemRow): ReactNode
  onPick(p: ProblemRow, a: Attempt): void
  onRoot(p: ProblemRow): void
}) {
  const docs = useQueries({ queries: rows.map((p) => ({ queryKey: qk.problem(rid, p.id), queryFn: (): Promise<ProblemDoc> => problemsApi(rid).get(p.id) })) })
  return (
    <div className="pb-chart" data-ui="흐름 차트">
      {rows.map((p, i) => (
        <div key={p.id} className="pb-chart-row" data-ui="차트 줄" data-ui-item={p.question}>
          <div className="pb-chart-q">{label(p)}</div>
          <div className="pb-chart-tree"><TreeChart flow={docs[i]?.data ?? { ...p, attempts: [] }} onPick={(a) => onPick(p, a)} onRoot={() => onRoot(p)} /></div>
        </div>
      ))}
    </div>
  )
}
