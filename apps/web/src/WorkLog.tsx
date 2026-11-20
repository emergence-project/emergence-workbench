// 작업 로그 (11/20 사용자 "이러한 작업대화가 대화창에서 나오는 것보다 사이드바에서 로그처럼 업데이트되는게 나을것 같아"):
// 에이전트의 생각 · 도구 묶음은 대화 본문에서 빼서 오른쪽 세부 패널의 「작업 로그」에 시간순으로 쌓는다.
// 대화에는 그 자리에 작은 「과정 n」 한 줄만 남고, 누르면 로그의 그 줄로 간다(세부 패널이 없는 좁은 자리에서는 그 자리에서 펼친다).
// 로그 줄의 번호를 누르면 대화의 그 자리로 돌아간다
import { useState } from 'react'
import type { Chat, ChatItem } from './api'
import { t } from './i18n'
import { MemoText } from './memo'

export type Step = Extract<ChatItem, { kind: 'step' }>
type Think = Extract<ChatItem, { kind: 'think' }>
/** 로그 한 줄: 이어진 도구 묶음 하나(until = 다음 줄의 시각, 얼마나 일했는지) 또는 생각 하나. n은 1부터 */
export type LogEntry = { n: number; at: string } & ({ kind: 'steps'; items: Step[]; until?: string } | { kind: 'think'; item: Think })
/** 대화 본문의 줄: 과정(로그 from..to 번)이나 그 밖의 한 줄 */
export type Block = { kind: 'proc'; from: number; to: number } | { kind: 'one'; item: Exclude<ChatItem, { kind: 'step' | 'think' }> }

/** 대화 줄을 본문(blocks)과 작업 로그(log)로 나눈다. 할 일 줄 · 기다리는 지시는 입력란 위에 따로 보이므로 둘 다에서 뺀다 */
export function chatLog(items: ChatItem[]): { blocks: Block[]; log: LogEntry[] } {
  const blocks: Block[] = []
  const log: LogEntry[] = []
  const close = (at: string) => { const last = log[log.length - 1]; if (last?.kind === 'steps' && !last.until) last.until = at }
  for (const it of items) {
    if (it.kind === 'todos' || (it.kind === 'user' && it.queued)) continue
    const lastBlock = blocks[blocks.length - 1], lastLog = log[log.length - 1]
    if (it.kind === 'step' || it.kind === 'think') {
      const inProc = lastBlock?.kind === 'proc'
      if (it.kind === 'step' && inProc && lastLog?.kind === 'steps') { lastLog.items.push(it); continue }
      close(it.at)
      const n = log.length + 1
      log.push(it.kind === 'step' ? { n, at: it.at, kind: 'steps', items: [it] } : { n, at: it.at, kind: 'think', item: it })
      if (inProc) lastBlock.to = n
      else blocks.push({ kind: 'proc', from: n, to: n })
      continue
    }
    close(it.at)
    blocks.push({ kind: 'one', item: it })
  }
  return { blocks, log }
}

export const isAgentStep = (s: Step) => s.tool === 'Task' || s.tool === 'Agent'
const isReadStep = (s: Step) => /^(Read|Grep|Glob|LS|NotebookRead)$|^(read|list|search|get)_/.test(s.tool)

export const secondsName = (s: number) => (s < 60 ? t(`${s}초`, `${s}s`) : t(`${Math.round(s / 60)}분`, `${Math.round(s / 60)} min`))

/** 도구 묶음의 요약: n초 동안 일함 · 읽기 n번 · 도구 n번 · 하위 에이전트 n (범위 밖 n) */
export function stepsSummary(items: Step[], until?: string): string {
  const agents = items.filter(isAgentStep).length
  const reads = items.filter(isReadStep).length
  const outside = items.filter((s) => s.outside).length
  const tools = items.length - agents - reads
  const from = Date.parse(items[0]?.at ?? '')
  const to = Date.parse(until ?? items[items.length - 1]?.at ?? '')
  const secs = Number.isFinite(from) && Number.isFinite(to) ? Math.round((to - from) / 1000) : 0
  return [
    secs >= 1 ? t(`${secondsName(secs)} 동안 일함`, `Worked for ${secondsName(secs)}`) : '',
    reads ? t(`읽기 ${reads}번`, `${reads} read${reads > 1 ? 's' : ''}`) : '',
    tools ? t(`도구 ${tools}번`, `${tools} tool call${tools > 1 ? 's' : ''}`) : '',
    agents ? t(`하위 에이전트 ${agents}`, `${agents} subagent${agents > 1 ? 's' : ''}`) : '',
    outside ? t(`범위 밖 ${outside}`, `${outside} outside scope`) : '',
  ].filter(Boolean).join(' · ')
}

/** 대화의 「과정 n」 줄에 붙는 짧은 말: 걸린 시간 · 도구 수 (생각만이면 「생각」) */
export function procSummary(entries: LogEntry[]): string {
  const steps = entries.flatMap((e) => (e.kind === 'steps' ? e.items : []))
  const last = entries[entries.length - 1]
  const until = last?.kind === 'steps' ? last.until : last?.at
  if (!steps.length) return t('생각', 'Thinking')
  return stepsSummary([{ ...steps[0]!, at: entries[0]!.at }, ...steps.slice(1)], until)
}

export const procName = (from: number, to: number) => t(`과정 ${from}${to > from ? `–${to}` : ''}`, `Steps ${from}${to > from ? `–${to}` : ''}`)

function StepLine({ s }: { s: Step }) {
  const agent = isAgentStep(s)
  return (
    <div className={`ac-step${s.sub ? ' sub' : ''}`} data-ui="도구 줄">
      <span className="ac-tool mono">{agent ? t('하위 에이전트', 'Subagent') : s.tool}</span>
      <span className="ac-sum" title={s.summary}>{s.summary}</span>
      {s.outside && <span className="tag" data-ui="범위 밖 태그" title={t('이 대화의 범위 밖을 읽었습니다', 'Read outside this conversation\'s scope')}>{t('범위 밖', 'Outside scope')}</span>}
    </div>
  )
}

const clock = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}` }
const firstLine = (s: string) => s.split('\n').find((l) => l.trim())?.trim() ?? ''

/** 로그 한 줄: 시각 · 번호(누르면 대화의 그 자리로) · 요약(누르면 펼침). 접힌 도구 묶음은 마지막 도구를 옅게 한 줄 */
export function LogLine({ e, open, onToggle, hit, onBack }: { e: LogEntry; open: boolean; onToggle(): void; hit?: boolean; onBack?(): void }) {
  const last = e.kind === 'steps' ? e.items[e.items.length - 1] : undefined
  return (
    <li className={`ac-log-line${hit ? ' hit' : ''}`} data-log-n={e.n}>
      <div className="ac-log-row">
        <span className="ac-log-at mono">{clock(e.at)}</span>
        {onBack
          ? <button className="a ac-log-n" data-ui="과정에서 대화로" data-tip={t('대화의 이 자리로', 'Go to this point in the conversation')} onClick={onBack}>{e.n}</button>
          : <span className="ac-log-n muted">{e.n}</span>}
        {e.kind === 'steps'
          ? <button className="a ac-steps-toggle" data-ui="도구 줄 펼치기" aria-expanded={open} onClick={onToggle}>{stepsSummary(e.items, e.until) || t('도구', 'Tools')} {open ? '▾' : '›'}</button>
          : <button className="a ac-steps-toggle" data-ui="에이전트 생각" aria-expanded={open} onClick={onToggle}>{t('생각', 'Thinking')} {open ? '▾' : '›'}</button>}
      </div>
      {!open && last && <div className="ac-log-hint"><span className="ac-tool mono">{isAgentStep(last) ? t('하위 에이전트', 'Subagent') : last.tool}</span><span className="ac-sum" title={last.summary}>{last.summary}</span></div>}
      {!open && e.kind === 'think' && <div className="ac-log-hint"><span className="ac-sum">{firstLine(e.item.text)}</span></div>}
      {open && (e.kind === 'steps' ? <div className="ac-log-body">{e.items.map((s, i) => <StepLine key={i} s={s} />)}</div> : <div className="ac-think ac-log-body"><MemoText text={e.item.text} /></div>)}
    </li>
  )
}

// ---------- 대화 안의 과정 줄 ----------

/**
 * 대화 본문의 「과정 n–m · 요약 ›」 한 줄. 누르면 그 자리에서 로그 줄을 펼친다 (11/20 16:05 진행: 세부 패널의 작업 로그를 없애고
 * 보통 에이전트처럼 대화 안에 접어 둔다). 도는 중인 마지막 과정은 지금 쓰는 도구를 옅게 붙인다
 */
export function ProcLine({ from, to, log, live }: { from: number; to: number; log: LogEntry[]; live?: boolean }) {
  const [inline, setInline] = useState(false)
  const [open, setOpen] = useState<ReadonlySet<number>>(new Set())
  const entries = log.slice(from - 1, to)
  const last = entries[entries.length - 1]
  const now = live && last?.kind === 'steps' ? last.items[last.items.length - 1] : undefined
  return (
    <li className="ac-proc" data-from={from} data-to={to}>
      <button className="a ac-proc-toggle" data-ui="과정 표시" aria-expanded={inline} onClick={() => setInline(!inline)}>
        {procName(from, to)} · {procSummary(entries)} {inline ? '▾' : '›'}
      </button>
      {now && !inline && <span className="ac-proc-now"><span className="ac-tool mono">{isAgentStep(now) ? t('하위 에이전트', 'Subagent') : now.tool}</span><span className="ac-sum" title={now.summary}>{now.summary}</span></span>}
      {inline && <ol className="ac-log-list inline">{entries.map((e) => <LogLine key={e.n} e={e} open={open.has(e.n)} onToggle={() => setOpen((o) => { const s = new Set(o); if (s.has(e.n)) s.delete(e.n); else s.add(e.n); return s })} />)}</ol>}
    </li>
  )
}
