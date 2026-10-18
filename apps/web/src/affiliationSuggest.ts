/**
 * 소속 자동완성 (10/18 시안 5절 "사람 고치기 창"): 다른 사람 · 원고 저자에게 이미 적은 소속에서, 적은 글자가 든 것을 제안한다.
 * 앞에서 맞는 것 먼저, 그다음 여러 번 쓴 것 먼저. 이미 이 사람에게 적은 소속과 적은 글 그대로인 것은 빼고, 글자는 대소문자를 가리지 않는다.
 */
export function affiliationSuggestions(query: string, known: string[], taken: string[], limit = 6): string[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const used = new Map<string, { name: string; n: number }>()
  for (const raw of known) {
    const name = raw.trim()
    if (!name) continue
    const key = name.toLowerCase()
    const cur = used.get(key)
    used.set(key, { name: cur?.name ?? name, n: (cur?.n ?? 0) + 1 })
  }
  const skip = new Set(taken.map((a) => a.trim().toLowerCase()))
  return [...used.entries()]
    .filter(([key]) => key.includes(q) && key !== q && !skip.has(key))
    .sort(([a, x], [b, y]) => Number(b.startsWith(q)) - Number(a.startsWith(q)) || y.n - x.n || a.localeCompare(b))
    .slice(0, limit).map(([, v]) => v.name)
}
