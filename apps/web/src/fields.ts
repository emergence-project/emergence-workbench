/**
 * 연구 분야 목록 (10/4 대화 "태그는 지정된 것 중에서, 개념노트와 같은 인덱스로").
 * 개념노트 분류(subject: "Mathematics › Graphs › Coloring › Map Coloring", 예전 것은 ">")의 각 단계를 하나의 분야로 본다.
 * 사람의 주 연구 분야는 이 목록에서만 고른다. 목록을 바꾸려면 개념노트 분류를 고친다.
 */
export interface FieldOption { name: string; path: string; count: number }

/** 분류 이름 앞의 정렬용 번호("01_Foundations")를 뗀다 */
const clean = (s: string) => s.trim().replace(/^\d+[_.\s-]+/, '').trim()

export function fieldOptions(subjects: { subject: string; count: number; name?: string; model?: 'ids' }[]): FieldOption[] {
  if (subjects.some((s) => s.model === 'ids')) return subjects.filter((s) => s.subject).map((s) => ({ name: s.name ?? s.subject, count: s.count, path: s.subject.split('/').map((_, i, parts) => subjects.find((x) => x.subject === parts.slice(0, i + 1).join('/'))?.name ?? '').join(' › ') })).sort((a, b) => a.path.localeCompare(b.path))
  const by = new Map<string, FieldOption>()
  for (const { subject, count } of subjects) {
    const parts = subject.split(/[>›]/).map(clean)
    parts.forEach((name, i) => {
      if (!name) return
      const path = parts.slice(0, i + 1).filter(Boolean).join(' › ')
      const cur = by.get(name.toLowerCase())
      if (cur) cur.count += count
      else by.set(name.toLowerCase(), { name, path, count })
    })
  }
  return [...by.values()].sort((a, b) => a.path.localeCompare(b.path))
}

/**
 * 분야 더하기 칸 (10/4 18:53 "전체를 펼쳐버리면 찾기가 너무 힘들어"): 적은 글자로 먼저 찾는다.
 * 빈 칸이면 다른 사람에게 자주 붙인 분야(used)와 개념노트가 많은 분야를 몇 개만, 적으면 이름이나 분류 경로에 그 글자가 든 분야만.
 * 이름이 그 글자로 시작하는 것을 앞에 둔다.
 */
export function matchFields(query: string, options: FieldOption[], used: Map<string, number> = new Map(), limit = 8): FieldOption[] {
  const q = query.trim().toLowerCase()
  const usedOf = (f: FieldOption) => used.get(f.name.toLowerCase()) ?? 0
  if (!q) {
    return [...options].sort((a, b) => usedOf(b) - usedOf(a) || b.count - a.count || a.name.localeCompare(b.name)).slice(0, limit)
  }
  const rank = (f: FieldOption) => (f.name.toLowerCase().startsWith(q) ? 0 : f.name.toLowerCase().includes(q) ? 1 : 2)
  return options.filter((f) => f.path.toLowerCase().includes(q))
    .sort((a, b) => rank(a) - rank(b) || usedOf(b) - usedOf(a) || a.path.localeCompare(b.path))
    .slice(0, limit)
}

export interface FieldIndexRow {
  /** 분류의 맨 위 단계 (예: "Mathematics"). 목록에 없는 이름표는 "" */
  root: string
  fields: { name: string; rest: string; count: number }[]
}

/**
 * 분야별로 묶을 때의 분야 차례 (10/4 19:20 "분야 탐색은 어떻게"): 사람에게 붙은 분야를 개념노트 분류의 맨 위 단계로 모으고,
 * 그 안에서는 분류 순서대로. rest는 맨 위 단계 뒤의 경로 ("Graphs › Map Coloring"). 목록에 없는 이름표는 끝에 따로.
 */
export function fieldIndex(counts: Map<string, number>, options: FieldOption[]): FieldIndexRow[] {
  const by = new Map(options.map((o) => [o.name.toLowerCase(), o]))
  const rows = new Map<string, FieldIndexRow['fields']>()
  const items = [...counts.entries()].map(([name, count]) => ({ name, count, path: by.get(name.toLowerCase())?.path }))
  items.sort((a, b) => (a.path === undefined ? 1 : 0) - (b.path === undefined ? 1 : 0) || (a.path ?? a.name).localeCompare(b.path ?? b.name))
  for (const it of items) {
    const parts = it.path?.split(' › ') ?? []
    const root = parts[0] ?? ''
    const rest = parts.slice(1).join(' › ')
    rows.set(root, [...(rows.get(root) ?? []), { name: it.name, rest, count: it.count }])
  }
  return [...rows.entries()].map(([root, fields]) => ({ root, fields }))
    .sort((a, b) => (a.root ? 0 : 1) - (b.root ? 0 : 1) || a.root.localeCompare(b.root))
}
