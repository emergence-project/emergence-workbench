import { WorkbenchError, type Workbench } from './workbench.js'
import { t } from './i18n.js'
import { editResearchYaml } from './researchYaml.js'

const ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

/**
 * 프로젝트 전체가 기대는 개념노트를 research.yaml의 concepts:에 넣거나 뺀다.
 * 보조 노트가 없는 프로젝트(메인 노트만 있는 것)도 개념노트에 연결할 수 있게 한다.
 * 다른 칸과 주석은 그대로 둔다. workbench/ 안 파일만 쓴다.
 */
export function setProjectConcept(wb: Workbench, id: unknown, on: unknown): { concepts: string[] } {
  if (typeof id !== 'string' || !ID.test(id)) throw new WorkbenchError(400, t(`개념노트 id가 올바르지 않음: ${String(id)}`, `Invalid concept note id: ${String(id)}`))
  if (typeof on !== 'boolean') throw new WorkbenchError(400, t('on(true·false)이 필요함', 'on (true or false) is required'))
  editResearchYaml(wb, (doc) => {
    const now = wb.readResearch().concepts
    const next = on ? (now.includes(id) ? now : [...now, id]) : now.filter((c) => c !== id)
    if (next.length === now.length && next.every((c, i) => c === now[i])) return false
    if (next.length) doc.set('concepts', doc.createNode(next, { flow: true }))
    else doc.delete('concepts')
  })
  return { concepts: wb.readResearch().concepts }
}
