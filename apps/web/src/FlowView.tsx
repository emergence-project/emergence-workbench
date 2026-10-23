/**
 * 연구 흐름 (프로젝트의 흐름 화면, 10/14 시안 "GAMC 연구 흐름"): 점 하나 = 생각의 한 걸음, 선 = "어디서 왔나".
 * 처음에는 주제 화면에 두었으나 생각은 주제를 넘나들어 프로젝트 하나에 한 흐름으로 옮겼다 (10/14 사용자). 주제는 필터로 굵게 본다.
 * 가로는 생각의 순서(날짜가 아니다), 기호는 종류, 색은 상태. 파일은 workbench/flow/*.yaml (에이전트도 쓴다).
 * 점을 누르면 아래에 자세히, 두 번 누르면 그 점을 가운데로. 계보(앞선 점·뒤따른 점)는 늘 크게 보인다.
 * 2단계 (10/14): ＋ 점으로 더하고, 점을 끌어 옮기고(layout.yaml), 자세히의 연필로 고치고, 사람 승인은 근거 표의 동그라미로.
 * 10/15: 고치기는 창이 아니라 자세히 자리에서 하고, 설명 칸은 노트처럼 그린다(줄 바꿈, $$…$$ 줄 수식, ![설명](그림) 그림).
 *
 * 파일 (flow/): marks(종류·상태·기호 그림) · data(흐름 자료 읽기) · FlowChart(차트, 줄 · 점 끌기 · 새 점 자리) ·
 * FlowCard(점 자세히) · evidence(근거 승인 표시 · 설명 글) · FlowEditor(점 고치기 · 새 점 적기) · figures(설명 칸 그림 넣기) ·
 * ApproveDialog(근거 승인 창) · NoteFlow(노트 옆 흐름 점) · FlowSymbolTable(소개의 흐름 기호 표). 이 파일은 흐름 화면과 주제 화면의 한 줄.
 */
import { useMemo, useState } from 'react'
import type { NoteRow } from './api'
import { layoutFlow } from './flowLayout'
import { go } from './router'
import { t as tr } from './i18n'
import { type TopicRef, useFlow } from './flow/data'
import { FlowChart, FOLD_KEY, selectFlowDot } from './flow/FlowChart'
import { FlowBundles } from './flow/FlowBundles'
import { store } from './store'

/** 흐름 화면 (왼쪽 사이드바의 "흐름"): 프로젝트의 점 전부. topic이면 그 주제의 점을 굵게 */
export function FlowPage({ rid, topic, notes, topics }: { rid: string; topic?: string; notes: NoteRow[]; topics: TopicRef[] }) {
  const { scan, reload } = useFlow(rid)
  const lay = useMemo(() => scan ? layoutFlow(scan.nodes, scan.layout, { rows: scan.rows }) : null, [scan])
  // 묶음 접기 (10/23 "판단 설계"): 기본은 접은 흐름, "모두 펼치기"로 지금의 점 차트
  const [fold, setFoldState] = useState(() => store.get<boolean>(FOLD_KEY, true))
  const setFold = (v: boolean) => { setFoldState(v); store.set(FOLD_KEY, v) }
  const focus = topic && topics.some((x) => x.id === topic) ? topic : undefined
  const foldSwitch = <div className="segmented small" role="radiogroup" aria-label={tr('묶음', 'Bundles')} data-ui="흐름 접기">
    <button type="button" role="radio" aria-checked={fold} className={fold ? 'on' : ''} onClick={() => setFold(true)}>{tr('접기', 'Fold')}</button>
    <button type="button" role="radio" aria-checked={!fold} className={fold ? '' : 'on'} onClick={() => setFold(false)}>{tr('펼치기', 'Open')}</button>
  </div>
  return <div className="ws-doc" data-ui="흐름 화면">
    <section className="pane">
      <div className="scroll"><div className="page-body fl-page">
        {!scan || !lay ? <p className="muted">{tr('불러오는 중…', 'Loading…')}</p>
          : fold ? <FlowBundles rid={rid} all={scan.nodes} topics={topics} focus={focus} foldSwitch={foldSwitch} onOpenDot={(id) => { selectFlowDot(rid, id); setFold(false) }} />
          : <FlowChart rid={rid} focus={focus} all={scan.nodes} cells={scan.layout} lay={lay} rowNames={scan.rows?.names ?? {}} warn={scan.diagnostics.length} notes={notes} topics={topics} reload={reload} foldSwitch={foldSwitch} />}
      </div></div>
    </section>
  </div>
}

/** 주제 화면의 한 줄: 이 주제의 점 수와 흐름 화면으로 가는 링크 (흐름은 프로젝트 하나에 하나) */
export function TopicFlowLink({ rid, tid }: { rid: string; tid: string }) {
  const { scan } = useFlow(rid)
  if (!scan) return null
  const n = scan.nodes.filter((x) => x.topics.includes(tid)).length
  return <p className="fl-topic-link" data-ui="주제 흐름 링크">
    <span className="muted">{n ? tr(`이 주제의 흐름 점 ${n}개`, `${n} flow dots in this topic`) : tr('이 주제의 흐름 점이 없습니다', 'No flow dots in this topic')}</span>
    <button className="a" onClick={() => go({ page: 'flow', rid, topic: tid })}>{tr('흐름에서 보기', 'View in flow')}</button>
  </p>
}

export { openFlowDot } from './flow/FlowChart'
export { NoteFlow } from './flow/NoteFlow'
export { FlowSymbolTable } from './flow/FlowSymbolTable'
