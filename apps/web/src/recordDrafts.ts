import type { PaintColor } from './api'
import type { RecordDraft } from './RecordContext'

export const RECORD_KINDS = ['자동', '메모', '할 일', '질문'] as const
export interface ComposerDraft { text: string; kind: typeof RECORD_KINDS[number]; attachment: RecordDraft; color: PaintColor }
/** Merely reopening the composer must not remove a quote; only the explicit x does that. */
export function attachRecordDraft(draft: ComposerDraft, attachment: RecordDraft, defaultColor: PaintColor): ComposerDraft {
  return Object.values(attachment).some((value) => value !== undefined)
    ? { ...draft, attachment, color: attachment.color ?? defaultColor }
    : draft
}
interface DraftState { draft: ComposerDraft; pending: number | null; error: string | null }
interface SaveTicket { id: number; draft: ComposerDraft }
const emptyDraft = (color: PaintColor): ComposerDraft => ({ text: '', kind: '자동', attachment: {}, color })

/** One pending write per target, even when the pane unmounts and mounts during the request. */
export function createRecordDraftStore() {
  const states = new Map<string, DraftState>()
  const listeners = new Map<string, Set<() => void>>()
  let serial = 0
  const read = (key: string, color: PaintColor): DraftState => {
    if (!states.has(key)) states.set(key, { draft: emptyDraft(color), pending: null, error: null })
    return states.get(key)!
  }
  const put = (key: string, state: DraftState) => { states.set(key, state); listeners.get(key)?.forEach((f) => f()) }
  return {
    read,
    subscribe(key: string, listener: () => void) {
      const group = listeners.get(key) ?? new Set<() => void>()
      group.add(listener); listeners.set(key, group)
      return () => { group.delete(listener) }
    },
    write(key: string, draft: ComposerDraft) {
      const state = read(key, draft.color)
      if (state.pending !== null) return
      put(key, { ...state, draft })
    },
    begin(key: string, color: PaintColor): SaveTicket | null {
      const state = read(key, color)
      if (state.pending !== null || !state.draft.text.trim()) return null
      const ticket = { id: ++serial, draft: state.draft }
      put(key, { ...state, pending: ticket.id, error: null })
      return ticket
    },
    finish(key: string, ticket: SaveTicket, color: PaintColor, error: string | null) {
      const state = read(key, color)
      if (state.pending !== ticket.id) return
      put(key, { draft: error ? state.draft : emptyDraft(color), pending: null, error })
    },
  }
}
export const recordDrafts = createRecordDraftStore()
