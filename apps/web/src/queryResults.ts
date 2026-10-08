export interface QueryResults<T> { query: string; status: 'idle' | 'pending' | 'ready' | 'error'; items: T[] }

/** An old response must never become selectable under another query, even before effects run. */
export function resultsForQuery<T>(state: QueryResults<T>, query: string, enabled: boolean): QueryResults<T> {
  if (!query || !enabled) return { query, status: 'idle', items: [] }
  return state.query === query ? state : { query, status: 'pending', items: [] }
}
