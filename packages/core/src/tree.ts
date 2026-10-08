import { BLOCK_STATUSES, isBlockStatus, type BlockMeta, type BlockStatus } from './block-header.js'

export interface TreeInput {
  /** 파일 이름에서 온 id (정본) */
  id: string
  meta: BlockMeta
}

export type TreeIssue =
  | { kind: 'id-mismatch'; id: string; headerId: string }
  | { kind: 'missing-parent'; id: string; parent: string }
  | { kind: 'missing-alternative'; id: string; alternative: string }
  | { kind: 'cycle'; id: string }
  | { kind: 'bad-status'; id: string; status: string }
  | { kind: 'blocked-without-reason'; id: string }
  | { kind: 'stopped-without-reason'; id: string }

export interface BlockTree {
  roots: string[]
  children: Record<string, string[]>
  parentOf: Record<string, string | null>
  /** 같은 문제의 다른 시도. [작은 id, 큰 id] 쌍, 중복 없음 */
  alternatives: Array<[string, string]>
  /** 나무를 위에서부터 차례로 펼친 순서 (사이드바·나무 보기용) */
  order: Array<{ id: string; depth: number }>
  counts: Record<BlockStatus, number>
  /** 이어서 할 것: 진행 중이면서 아래에 진행 중인 블록이 없는 가지 끝 */
  frontier: string[]
  issues: TreeIssue[]
}

/** 상태가 없거나 잘못된 블록은 진행 중으로 본다 (issues에 기록) */
export function effectiveStatus(meta: BlockMeta): BlockStatus {
  return isBlockStatus(meta.status) ? meta.status : 'in-progress'
}

export function buildTree(blocks: TreeInput[]): BlockTree {
  const ids = new Set(blocks.map((b) => b.id))
  const byId = new Map(blocks.map((b) => [b.id, b]))
  const issues: TreeIssue[] = []
  const parentOf: Record<string, string | null> = {}

  for (const { id, meta } of blocks) {
    if (meta.id && meta.id !== id) issues.push({ kind: 'id-mismatch', id, headerId: meta.id })
    if (meta.status !== undefined && !isBlockStatus(meta.status)) issues.push({ kind: 'bad-status', id, status: meta.status })
    if (meta.status === 'blocked' && (!meta.blockedReason || !meta.resumeCondition)) issues.push({ kind: 'blocked-without-reason', id })
    if (meta.status === 'stopped' && !meta.stoppedReason) issues.push({ kind: 'stopped-without-reason', id })
    const p = meta.parent
    if (p && !ids.has(p)) issues.push({ kind: 'missing-parent', id, parent: p })
    parentOf[id] = p && ids.has(p) && p !== id ? p : null
  }

  // 부모를 따라 올라가다 자기 자신으로 돌아오면 고리. 고리의 한 블록을 뿌리로 끊는다.
  for (const { id } of blocks) {
    const seen = new Set<string>([id])
    let cur = parentOf[id]
    while (cur) {
      if (seen.has(cur)) {
        if (cur === id) {
          issues.push({ kind: 'cycle', id })
          parentOf[id] = null
        }
        break
      }
      seen.add(cur)
      cur = parentOf[cur] ?? null
    }
  }

  const createdOf = (id: string) => byId.get(id)?.meta.created ?? ''
  const sortIds = (a: string, b: string) => createdOf(a).localeCompare(createdOf(b)) || a.localeCompare(b)
  const children: Record<string, string[]> = {}
  for (const { id } of blocks) children[id] = []
  const roots: string[] = []
  for (const { id } of blocks) {
    const p = parentOf[id]
    if (p) children[p]!.push(id)
    else roots.push(id)
  }
  for (const list of Object.values(children)) list.sort(sortIds)
  roots.sort(sortIds)

  const pairs = new Map<string, [string, string]>()
  for (const { id, meta } of blocks) {
    for (const alt of meta.alternatives) {
      if (!ids.has(alt)) { issues.push({ kind: 'missing-alternative', id, alternative: alt }); continue }
      if (alt === id) continue
      const pair: [string, string] = id < alt ? [id, alt] : [alt, id]
      pairs.set(pair.join('\u0000'), pair)
    }
  }

  const order: Array<{ id: string; depth: number }> = []
  const walk = (id: string, depth: number) => {
    order.push({ id, depth })
    for (const c of children[id] ?? []) walk(c, depth + 1)
  }
  for (const r of roots) walk(r, 0)

  const counts = Object.fromEntries(BLOCK_STATUSES.map((s) => [s, 0])) as Record<BlockStatus, number>
  const status = (id: string) => effectiveStatus(byId.get(id)!.meta)
  for (const { id } of blocks) counts[status(id)]++

  const hasActiveBelow = (id: string): boolean =>
    (children[id] ?? []).some((c) => status(c) === 'in-progress' || hasActiveBelow(c))
  const frontier = order.map((o) => o.id).filter((id) => status(id) === 'in-progress' && !hasActiveBelow(id))

  return { roots, children, parentOf, alternatives: [...pairs.values()], order, counts, frontier, issues }
}
