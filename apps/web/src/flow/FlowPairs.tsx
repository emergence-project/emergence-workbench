import { useState } from 'react'
import { pairSuggestions } from '@rw/core'
import { ConflictError, tasksApi, type FlowNode, type Task } from '../api'
import type { FlashAction } from '../flash'
import { t as tr } from '../i18n'
import { go } from '../router'
import { useFlow } from './data'
import { MarkIcon } from './marks'

/**
 * 짝 제안 (10/27 결정 "맡긴 일과 흐름 점 잇기"): 기록 › 내 차례 맨 위 띠. 흐름 점과 아직 잇지 않은 맡긴 일과,
 * 그 일이 만든 점 · 작업 내용에 적힌 점 이름으로 찾은 후보. "잇기"를 누를 때만 맡긴 일 파일에 flow 한 줄을 쓴다(흐름 점 파일은 그대로).
 * 내 차례 수에는 세지 않는다 (d)
 */
export function FlowPairs({ rid, nodes, tasks, onSaved, reload }: { rid: string; nodes: FlowNode[]; tasks: Task[]; onSaved(m: string, action?: FlashAction): void; reload(): unknown }) {
  const pairs = pairSuggestions(nodes, tasks)
  const [open, setOpen] = useState(false)
  const [pick, setPick] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  if (!pairs.length) return null
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const dotOf = (p: (typeof pairs)[number]) => pick[p.task.id] ?? p.dots[0]!
  const link = async (list: typeof pairs) => {
    setBusy(true)
    let done = 0
    for (const p of list) {
      try { await tasksApi(rid).linkFlow(p.task.id, { flow: dotOf(p), baseHash: p.task.hash }); done++ }
      catch (e) { onSaved(e instanceof ConflictError ? tr(`"${p.task.title}" 파일이 그새 바뀌었습니다. 다시 보고 이으세요`, `"${p.task.title}" changed in the meantime. Check it and link again`) : (e as Error).message) }
    }
    setBusy(false)
    if (done) onSaved(tr(`맡긴 일 ${done}개를 흐름 점과 이었습니다`, `Linked ${done} delegated task${done > 1 ? 's' : ''} to flow dots`))
    await reload()
  }
  return (
    <section className="fp" data-ui="흐름 짝 제안">
      <div className="fp-h">
        <b>{tr(`흐름 점과 이을 맡긴 일 ${pairs.length}`, `${pairs.length} delegated task${pairs.length > 1 ? 's' : ''} to link to flow dots`)}</b>
        <span className="muted fp-tip">{tr('그 일이 만든 점이나 작업 내용에 적힌 점 이름으로 찾았습니다', 'Found from the dots they made or dot names in the task')}</span>
        <span className="sp" />
        <button className="btn sm" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? tr('접기', 'Collapse') : tr('하나씩 보기', 'Review one by one')}</button>
        <button className="btn sm primary" disabled={busy} title={tr('맡긴 일 파일에 flow 한 줄씩 씁니다. 흐름 점 파일은 고치지 않습니다', 'Writes one flow line into each task file. Flow dot files are not changed')} onClick={() => void link(pairs)}>{tr(`${pairs.length}개 잇기`, `Link ${pairs.length}`)}</button>
      </div>
      {open && <ul className="fp-rows">
        {pairs.map((p) => {
          const n = byId.get(dotOf(p))
          return <li key={p.task.id} data-ui="흐름 짝 줄" data-ui-item={p.task.id}>
            <span className="fp-task" title={p.task.file}>{p.task.title}</span>
            <span className="fp-arrow muted" aria-hidden>→</span>
            <span className="fp-dot">{n && <MarkIcon n={n} size={16} />}
              {p.dots.length > 1
                ? <select aria-label={tr('이을 흐름 점', 'Flow dot to link')} value={dotOf(p)} onChange={(e) => setPick({ ...pick, [p.task.id]: e.target.value })}>
                  {p.dots.map((d) => <option key={d} value={d}>{byId.get(d)?.short ?? d}</option>)}
                </select>
                : <span title={n?.title}>{n?.short ?? dotOf(p)}</span>}
            </span>
            <button className="btn sm" disabled={busy} onClick={() => void link([p])}>{tr('잇기', 'Link')}</button>
          </li>
        })}
      </ul>}
    </section>
  )
}

/** 맡긴 일이 이은 흐름 점 칩 (판단 카드 · 보고서). 누르면 흐름. inRow: 펼치기 버튼(판단 카드 줄) 안이면 버튼 안에 버튼을 두지 않게 span으로 */
export function TaskFlowChip({ rid, task, nodes, inRow = false }: { rid: string; task: Task; nodes: FlowNode[]; inRow?: boolean }) {
  const n = task.flow ? nodes.find((x) => x.id === task.flow) : undefined
  if (!n) return null
  const open = (e: { stopPropagation(): void; preventDefault(): void }) => { e.stopPropagation(); e.preventDefault(); go({ page: 'flow', rid }) }
  const props = { className: 'a tk-flow-chip', 'data-ui': '맡긴 일 흐름 점', title: tr(`흐름 점: ${n.title}`, `Flow dot: ${n.title}`) }
  return inRow
    ? <span {...props} role="link" tabIndex={0} onClick={open} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') open(e) }}><MarkIcon n={n} size={14} />{n.short}</span>
    : <button {...props} onClick={open}><MarkIcon n={n} size={14} />{n.short}</button>
}

/**
 * 보고서 머리 표의 "흐름 점" 칸: 이었으면 칩과 풀기(×), 아직이면 제안한 점과 잇기.
 * 이은 점은 결과를 승인할 때 끝남 · 해결이 되고 결론이 새 명제가 된다 (10/27 (a))
 */
export function TaskFlowField({ rid, task, onSaved, reload }: { rid: string; task: Task; onSaved(m: string): void; reload(): unknown }) {
  const nodes = useFlow(rid).scan?.nodes ?? []
  const [busy, setBusy] = useState(false)
  const suggestion = task.flow ? undefined : pairSuggestions(nodes, [task])[0]?.dots[0]
  if (!task.flow && !suggestion) return null
  const set = (flow: string | null) => {
    setBusy(true)
    tasksApi(rid).linkFlow(task.id, { flow, baseHash: task.hash })
      .then(() => onSaved(flow ? tr('흐름 점과 이었습니다', 'Linked to the flow dot') : tr('흐름 점과 잇기를 풀었습니다', 'Unlinked from the flow dot')),
        (e) => onSaved(e instanceof ConflictError ? tr('파일이 그새 바뀌었습니다. 새 내용을 보고 다시 하세요', 'The file changed in the meantime. Check it and try again') : (e as Error).message))
      .then(() => { setBusy(false); return reload() })
  }
  const sug = suggestion ? nodes.find((x) => x.id === suggestion) : undefined
  const dot = nodes.find((x) => x.id === task.flow)
  // 승인할 때 흐름이 바뀌는 점: 끝나지 않은 질문 · 작업 점 (서버 taskFlow.ts와 같은 조건)
  const linkedOpen = !!dot && dot.progress !== 'done' && dot.kind !== 'finding'
  return <>
    <dt>{tr('흐름 점', 'Flow dot')}</dt>
    <dd className="tk-flow" data-ui="보고서 흐름 점">
      {task.flow
        ? <><TaskFlowChip rid={rid} task={task} nodes={nodes} />{!nodes.some((x) => x.id === task.flow) && <span className="mono">{task.flow}</span>}
          <button className="icon-btn sm" disabled={busy} title={tr('잇기 풀기', 'Unlink')} aria-label={tr('흐름 점과 잇기 풀기', 'Unlink from the flow dot')} onClick={() => set(null)}>×</button>
          {task.state === 'result' && linkedOpen && <span className="muted fp-tip">{tr('승인하면 이 점은 끝남 · 해결, 결론은 새 명제', 'Approving marks this dot done · solved and adds the conclusion as a proposition')}</span>}</>
        : <><span className="muted">{tr('제안', 'Suggested')}</span>{sug && <MarkIcon n={sug} size={14} />}<span title={sug?.title}>{sug?.short ?? suggestion}</span>
          <button className="btn sm" disabled={busy} onClick={() => set(suggestion!)}>{tr('잇기', 'Link')}</button></>}
    </dd>
  </>
}
