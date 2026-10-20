import { useRef, useState } from 'react'
import { commentsApi, ConflictError, type CommentChange, type CommentFile, type CommentState, type NewComment } from './api'
import { bumpPending, keyOf, load, patch } from './Comments'
import { flash } from './flash'

/**
 * 기록 파일(workbench/comments/<대상>.md)에 쓰는 곳을 한데 모은다 (2026-10-20 검토 ③).
 * 쓰고 나면 그 대상을 보는 화면(슬롯)과 기록 모음(qk.records) · 에이전트 함을 새로 한다.
 *
 * 409(그사이 파일이 바뀜)는 두 갈래다.
 * - 화면이 본 판의 hash로 쓰는 것(글 고치기 · 지우기 · 상태 · 적용): 다시 시도하지 않는다. 그사이 붙은 답이나 고친 글을
 *   보지 않은 채 덮거나 지우면 안 되기 때문이다. 다시 읽어 보이고 알린다(useRecordActions).
 * - 화면이 본 판과 상관없는 고침(할 일 끝내기, 기록 속 경로 고치기): 지금 hash를 읽어 쓰고, 그사이 바뀌면 다시 읽어 한 번 더(updateLatest).
 */
export function recordWrites(rid: string) {
  const api = commentsApi(rid)
  const show = (target: string) => (file: CommentFile) => { patch(keyOf(rid, target), { file }); bumpPending(); return file }
  return {
    /** 더하기 (덧붙이기라 hash 없음). 더한 뒤 그 대상을 새로 읽는다 */
    add: async (target: string, c: NewComment) => {
      const r = await api.add(target, c)
      await load(rid, target, true); bumpPending()
      return r
    },
    update: (target: string, id: string, change: CommentChange) => api.update(target, id, change).then(show(target)),
    setState: (target: string, id: string, state: CommentState, baseHash: string) => api.update(target, id, { state, baseHash }).then(show(target)),
    reply: (target: string, id: string, text: string) => api.reply(target, id, text).then(show(target)),
    remove: (target: string, id: string, baseHash: string) => api.remove(target, id, baseHash).then(show(target)),
    apply: (target: string, id: string, answer: number, baseHash: string) => api.apply(target, id, answer, baseHash).then(show(target)),
    /**
     * 지금 판을 읽어 고친다. change가 null이면 쓰지 않고 null. 그사이 바뀌면(409) 다시 읽어 한 번 더 한다
     */
    async updateLatest(target: string, id: string, change: (file: CommentFile) => Omit<CommentChange, 'baseHash'> | null): Promise<CommentFile | null> {
      for (let attempt = 0; ; attempt++) {
        const file = await api.read(target)
        const next = change(file)
        if (!next) return null
        try { return show(target)(await api.update(target, id, { ...next, baseHash: file.hash })) } catch (e) {
          if (!(e instanceof ConflictError) || attempt > 0) throw e
        }
      }
    },
  }
}

export type RecordWrites = ReturnType<typeof recordWrites>

/**
 * 화면의 기록 쓰기: 한 번에 하나(누르는 사이 두 번 쓰지 않게) · busy · 오류 알림.
 * report가 'banner'면 error를 화면이 띄우고, 'flash'면 아래 작은 알림으로.
 * 409면 그 대상을 다시 읽고 conflict 문장으로 알린다(적던 글은 화면에 남는다).
 */
export function useRecordActions(rid: string, { report = 'banner', conflict }: { report?: 'banner' | 'flash'; conflict?: string } = {}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const locked = useRef(false)
  const say = (message: string) => { if (report === 'flash') flash(message); else setError(message) }
  /** target에 쓰는 일 하나. 됐으면 true */
  const run = async (target: string, operation: (writes: RecordWrites) => Promise<unknown>): Promise<boolean> => {
    if (locked.current) return false
    locked.current = true; setBusy(true)
    if (report === 'banner') setError(null)
    try { await operation(recordWrites(rid)); return true } catch (e) {
      if (e instanceof ConflictError) { await load(rid, target, true); bumpPending(); say(conflict ?? e.message) }
      else say((e as Error).message)
      return false
    } finally { locked.current = false; setBusy(false) }
  }
  return { busy, error, setError, run }
}
