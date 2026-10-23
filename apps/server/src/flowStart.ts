// 시작 기록과 반영 기록 (10/23, docs/repo-format.md §14 "시작 기록" · "반영 기록"). 앱 서버 없이 파일만 읽고 써서
// 클라우드 에이전트도 같은 문을 거친다 (`pnpm agent:start` · `pnpm agent:integrate`).
// 시작: 선행 찾기 결과(가장 가까운 점, 또는 왜 새로운지)와 판정 기준이 있어야 점을 진행으로 연다.
// 반영: 끝난 점의 결과를 이해 문서에 반영했거나(그 문서가 점 id를 가리킨다) 반영하지 않은 이유를 적어야 끝난다.
import fs from 'node:fs'
import path from 'node:path'
import { FLOW_FIELDS, type FlowKind, type FlowNode, type FlowSearchReply } from '@rw/core/contract/flow'
import { stamp as coreStamp } from '@rw/core'
import { createFlowNode, patchFlowNode, readFlowNode, scanFlow, searchFlow, setFlowRecord } from './flow.js'
import { evidenceHash } from './flowGaps.js'
import { isInside } from './fsutil.js'
import { t } from './i18n.js'
import { WorkbenchError, type Workbench } from './workbench.js'

export interface StartInput {
  /** 이미 있는 점에 시작 기록을 붙일 때 그 id. 없으면 새 점을 만든다 */
  dot?: string
  kind?: FlowKind
  short?: string
  title?: string
  topics?: string[]
  from?: FlowNode['from']
  task?: string
  /** 설명 칸 (goal · question · motivation · setup …) */
  fields?: Record<string, string>
  /** 판정 기준: 칸이 있는 종류(질문 · 수치 계산)는 fields.criterion에, 없는 종류는 시작 기록에 */
  criterion?: string
  stop?: string
  /** 가장 가까운 기존 결과 · 반례 (점 id)와 이번에 더할 것 */
  prior?: string[]
  adds?: string
  /** 걸린 것이 없거나 다 다를 때 왜 새로운지 */
  novel?: string
  /** 선행 찾기에 쓸 글 (없으면 짧은 제목 · 제목 · 설명 칸) */
  query?: string
  /** 일을 한 뒤에 적는 기록 */
  late?: boolean
  by: string
}

/** 선행 찾기의 글: 준 글, 없으면 점의 짧은 제목 · 제목 · 설명 칸 */
export function startQuery(input: Pick<StartInput, 'query' | 'short' | 'title' | 'fields'>, dot?: FlowNode): string {
  if (input.query?.trim()) return input.query.trim()
  const fields = { ...dot?.fields, ...input.fields }
  return [...new Set([input.short ?? dot?.short, input.title ?? dot?.title, fields.question, fields.goal, fields.statement].filter(Boolean))].join(' ')
}

/** 선행 찾기: 흐름의 점 가운데 글이 겹치는 것 (자기 점은 뺀다) */
export function priorSearch(wb: Workbench, query: string, self?: string): FlowSearchReply['rows'] {
  return searchFlow(wb, query, 11).rows.filter((r) => r.id !== self).slice(0, 10)
}

/**
 * 시작 기록을 쓰고 점을 진행으로 연다. 문을 못 지나면 WorkbenchError(400)와 모자란 것.
 * 가장 가까운 점(prior)이나 왜 새로운지(novel) 가운데 하나, 그리고 판정 기준이 있어야 한다
 */
export function startFlow(wb: Workbench, input: StartInput, now = new Date()): { node: FlowNode; hits: FlowSearchReply['rows'] } {
  const old = input.dot ? readFlowNode(wb, input.dot) : undefined
  if (old?.start && !old.start.late) throw new WorkbenchError(400, t(`점 ${old.id}에는 시작 기록이 이미 있습니다 (${old.start.at})`, `Dot ${old.id} already has a start record (${old.start.at})`))
  const kind = old?.kind ?? input.kind
  if (!kind) throw new WorkbenchError(400, t('종류(--kind)를 적으세요', 'Give the kind (--kind)'))
  if (!old && !input.short?.trim()) throw new WorkbenchError(400, t('짧은 제목(--short)을 적으세요', 'Give a short title (--short)'))
  const query = startQuery(input, old)
  const hits = query ? priorSearch(wb, query, old?.id) : []
  const ids = new Set(scanFlow(wb).nodes.map((n) => n.id))
  const prior = [...new Set((input.prior ?? []).map((x) => x.trim()).filter(Boolean))]
  const miss: string[] = []
  const unknown = prior.filter((p) => !ids.has(p) || p === old?.id)
  if (unknown.length) miss.push(t(`없는 점: ${unknown.join(', ')}`, `no such dot: ${unknown.join(', ')}`))
  if (!prior.length && !input.novel?.trim()) {
    miss.push(hits.length
      ? t(`선행 찾기에 ${hits.length}개가 걸렸습니다. 가장 가까운 것을 --prior로 적거나, 왜 다른지 --novel로 적으세요`, `${hits.length} earlier dot(s) matched. Name the closest with --prior, or say how this differs with --novel`)
      : t('걸린 점이 없습니다. 왜 새로운지 --novel로 한 줄 적으세요', 'Nothing matched. Say in one line why this is new (--novel)'))
  }
  if (prior.length && !input.adds?.trim()) miss.push(t('가까운 점에 이번에 더할 것(--adds)', 'what this adds to the closest dot (--adds)'))
  const hasField = FLOW_FIELDS[kind].includes('criterion')
  const criterion = input.criterion?.trim() || (hasField ? (input.fields?.criterion ?? old?.fields.criterion)?.trim() : old?.start?.criterion)
  if (!criterion) miss.push(t('판정 기준(--criterion: 무엇이 나오면 해결 · 반증인가)', 'a criterion (--criterion: what result solves or refutes it)'))
  if (miss.length) throw new WorkbenchError(400, t(`시작하기 전에: ${miss.join(' · ')}`, `Before starting: ${miss.join(' · ')}`))

  const late = input.late || old?.progress === 'done' || undefined
  let node = old ?? createFlowNode(wb, { kind, short: input.short!.trim(), ...(input.title?.trim() && { title: input.title.trim() }), ...(input.topics?.length && { topics: input.topics }), ...(input.from?.length && { from: input.from }), progress: 'active', by: input.by, ...(input.task && { task: input.task }) }, now)
  const fields = { ...node.fields, ...input.fields, ...(hasField && { criterion: criterion! }) }
  const fieldsChanged = Object.entries(fields).some(([k, v]) => node.fields[k] !== v)
  const progress = node.progress === 'open' ? 'active' : undefined
  if (fieldsChanged || progress) node = patchFlowNode(wb, node.id, { baseHash: node.hash, set: { ...(fieldsChanged && { fields }), ...(progress && { progress }) } }, now)
  node = setFlowRecord(wb, node.id, 'start', {
    at: coreStamp('t', now), by: input.by, query, hits: hits.map((h) => h.id), prior, adds: input.adds?.trim(), novel: input.novel?.trim(),
    criterion: hasField ? undefined : criterion, stop: input.stop?.trim(), late,
  }, node.hash)
  return { node, hits }
}

export interface IntegrateInput { dot: string; into?: string; section?: string; skip?: string; by: string }

/** 반영 기록이 지금도 맞는가: 문서가 있고, 절이 있고, 그 안에 점 id가 적혀 있나. 맞으면 null, 아니면 까닭 */
export function integrationProblem(repo: string, id: string, into: string, section?: string): string | null {
  const p = path.join(repo, into)
  if (!isInside(repo, p) || !fs.existsSync(p)) return t(`반영한 문서가 없습니다: ${into}`, `the document it was reflected in is missing: ${into}`)
  const h = evidenceHash(repo, into, section)
  if (h === 'no-section') return t(`반영한 절이 없습니다: ${into} › ${section}`, `the section is missing: ${into} › ${section}`)
  const text = fs.readFileSync(p, 'utf8')
  const mentions = new RegExp(`(^|[^a-z0-9-]|flow-)${id.replace(/-/g, '\\-')}($|[^a-z0-9-])`).test(text)
  if (!mentions) return t(`${into}에 점 id "${id}"가 적혀 있지 않습니다. 반영한 곳에 점을 가리키세요 (예: flow-${id})`, `${into} does not mention the dot id "${id}". Point to the dot where it was reflected (e.g. flow-${id})`)
  return null
}

/** 끝난 점의 반영 기록. into(이해 문서, 점 id를 적어야 한다)나 skip(반영하지 않은 이유) 가운데 하나 */
export function integrateFlow(wb: Workbench, input: IntegrateInput, now = new Date()): FlowNode {
  const node = readFlowNode(wb, input.dot)
  const into = input.into?.trim(), skip = input.skip?.trim()
  if (!!into === !!skip) throw new WorkbenchError(400, t('반영한 문서(--into)나 반영하지 않은 이유(--skip) 가운데 하나를 적으세요', 'Give either the document it was reflected in (--into) or why not (--skip)'))
  if (into) {
    const problem = integrationProblem(wb.repo, node.id, into, input.section?.trim())
    if (problem) throw new WorkbenchError(400, problem)
  }
  return setFlowRecord(wb, node.id, 'integration', { at: coreStamp('t', now), by: input.by, into, section: input.section?.trim(), skip }, node.hash)
}
