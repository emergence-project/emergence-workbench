import type { TaskAnswer, TaskAsk } from './api'
import { t } from './i18n'

export interface AnswerNoteSaveTicket { id: number; key: string; revision: number; text: string; failed?: boolean }
export interface AnswerNoteDraft { text: string; saved: string; revision?: number; pending?: AnswerNoteSaveTicket; question?: string }
export type AnswerNoteDrafts = Record<string, AnswerNoteDraft>

/** Unique prompts survive reordering. Changed duplicate groups have no reliable positional identity. */
export function answerQuestionKeys(asks: TaskAsk[]): string[] {
  const groups = new Map<string, number[]>()
  asks.forEach((ask, i) => {
    const signature = JSON.stringify([ask.q, ask.options])
    groups.set(signature, [...(groups.get(signature) ?? []), i])
  })
  return asks.map((ask, i) => {
    const positions = groups.get(JSON.stringify([ask.q, ask.options]))!
    return JSON.stringify([ask.q, ask.options, positions.length > 1 ? positions : [], positions.indexOf(i)])
  })
}

const UNASSIGNED = 'unassigned:'
export function unassignedAnswerNotes(drafts: AnswerNoteDrafts): { key: string; question: string; text: string }[] {
  return Object.entries(drafts).filter(([key]) => key.startsWith(UNASSIGNED))
    .map(([key, draft]) => ({ key, question: draft.question ?? t('이전 질문', 'Earlier question'), text: draft.text }))
}

function previousQuestion(key: string): string {
  try { const q: unknown = JSON.parse(key)[0]; if (typeof q === 'string') return q } catch { /* Older or unknown key. */ }
  return t('이전 질문', 'Earlier question')
}

export function editAnswerNote(drafts: AnswerNoteDrafts, key: string, text: string, saved = ''): AnswerNoteDrafts {
  const old = drafts[key]
  return { ...drafts, [key]: { ...old, text, saved: old?.saved ?? saved, revision: (old?.revision ?? 0) + 1 } }
}

export function answerNoteSaveTicket(drafts: AnswerNoteDrafts, key: string, id: number): AnswerNoteSaveTicket {
  const draft = drafts[key]
  return { id, key, revision: draft?.revision ?? 0, text: draft?.text ?? '' }
}

export function beginAnswerNoteSave(drafts: AnswerNoteDrafts, ticket: AnswerNoteSaveTicket): AnswerNoteDrafts {
  const old = drafts[ticket.key] ?? { text: ticket.text, saved: '', revision: ticket.revision }
  return { ...drafts, [ticket.key]: { ...old, pending: ticket } }
}

/** Acknowledge only this request. A failed save stays a draft until a successful retry, even when a refresh matches the old text. */
export function finishAnswerNoteSave(drafts: AnswerNoteDrafts, ticket: AnswerNoteSaveTicket, savedNote?: string): AnswerNoteDrafts {
  const old = drafts[ticket.key]
  if (!old || old.pending?.id !== ticket.id) return drafts
  if (savedNote === undefined) return { ...drafts, [ticket.key]: { ...old, pending: { ...ticket, failed: true } } }
  const { pending: _pending, ...draft } = old
  return { ...drafts, [ticket.key]: { ...draft, text: (old.revision ?? 0) === ticket.revision ? savedNote : old.text, saved: savedNote } }
}

/** Refresh saved answers without replacing a question's edited or not-yet-selected note. */
export function mergeAnswerNotes(drafts: AnswerNoteDrafts, answers: TaskAnswer[], asks: TaskAsk[]): AnswerNoteDrafts {
  const next: AnswerNoteDrafts = { ...drafts }
  const keys = answerQuestionKeys(asks)
  const active = new Set(keys)
  for (const [key, old] of Object.entries(drafts)) {
    if (active.has(key) || key.startsWith(UNASSIGNED)) continue
    if (old.text !== old.saved || old.pending) {
      const base = `${UNASSIGNED}${key}`
      let archive = base
      for (let n = 2; archive in next; n++) archive = `${base}:${n}`
      next[archive] = { ...old, question: previousQuestion(key) }
    }
    delete next[key]
  }
  keys.forEach((key, i) => {
    const old = drafts[key]
    const note = answers.find((a) => a.n === i + 1)?.note ?? ''
    const edited = old && (old.text !== old.saved || old.pending)
    const draft = { ...old, text: edited ? old.text : note, saved: note }
    next[key] = draft
  })
  return next
}
