import type { SubjectCount } from './api/subjects'
import { t } from './i18n'
/** 분류 경로마다 하위 분류를 묶는다. count는 자기 노트와 모든 자손의 합이다. */
export interface SubjNode { name: string; path: string; count: number; kids: SubjNode[]; model?: 'ids' }
export function subjectTree(list: SubjectCount[]): SubjNode[] {
  if (list.some((s) => s.model === 'ids')) {
    const nodes = new Map(list.map((s) => [s.subject, { name: s.name ?? s.subject, path: s.subject, count: s.count, kids: [] as SubjNode[], model: 'ids' as const }]))
    const roots: SubjNode[] = []
    for (const s of list) { const node = nodes.get(s.subject)!; const parent = s.parent ? nodes.get(s.parent) : undefined; if (parent) parent.kids.push(node); else roots.push(node) }
    return roots
  }
  const root: SubjNode = { name: '', path: '', count: 0, kids: [] }
  for (const { subject, count } of list) {
    let node = root
    const parts = subject ? subject.split(' › ') : [t('분류 없음', 'No subject')]
    parts.forEach((part, i) => {
      const path = subject ? parts.slice(0, i + 1).join(' › ') : ''
      let kid = node.kids.find((k) => k.path === path)
      if (!kid) { kid = { name: part, path, count: 0, kids: [] }; node.kids.push(kid) }
      kid.count += count
      node = kid
    })
  }
  return root.kids
}
export function findSubject(nodes: SubjNode[], path: string): SubjNode | undefined {
  for (const node of nodes) {
    if (node.path === path) return node
    if (path.startsWith(`${node.path}${node.model === 'ids' ? '/' : ' › '}`)) return findSubject(node.kids, path)
  }
}
export function subjectBelow(subject: string, prefix?: string): string {
  if (prefix === undefined) return subject
  if (subject === prefix) return ''
  return subject.startsWith(`${prefix} › `) ? subject.slice(prefix.length + 3) : subject
}
