/* 이 브라우저에만 남기는 편의 기록. 없어도 화면은 정상으로 동작한다. */
export const store = {
  get<T>(key: string, fallback: T): T {
    try { const v = localStorage.getItem(key); return v === null ? fallback : (JSON.parse(v) as T) } catch { return fallback }
  },
  set(key: string, value: unknown) { try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* 무시 */ } },
}
