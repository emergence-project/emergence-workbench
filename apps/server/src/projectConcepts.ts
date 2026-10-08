import fs from 'node:fs'
import YAML from 'yaml'
import { writeAtomic } from './fsutil.js'
import { WorkbenchError, type Workbench } from './workbench.js'
import { t } from './i18n.js'

const ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

/**
 * 프로젝트 전체가 기대는 개념노트를 research.yaml의 concepts:에 넣거나 뺀다.
 * 보조 노트가 없는 프로젝트(메인 노트만 있는 것)도 개념노트에 연결할 수 있게 한다.
 * 다른 칸과 주석은 그대로 둔다. workbench/ 안 파일만 쓴다.
 */
export function setProjectConcept(wb: Workbench, id: unknown, on: unknown): { concepts: string[] } {
  if (typeof id !== 'string' || !ID.test(id)) throw new WorkbenchError(400, t(`개념노트 id가 올바르지 않음: ${String(id)}`, `Invalid concept note id: ${String(id)}`))
  if (typeof on !== 'boolean') throw new WorkbenchError(400, t('on(true·false)이 필요함', 'on (true or false) is required'))
  const text = fs.existsSync(wb.researchPath) ? fs.readFileSync(wb.researchPath, 'utf8') : ''
  const doc = YAML.parseDocument(text)
  if (doc.errors.length) throw new WorkbenchError(409, t('research.yaml을 읽지 못해 고치지 않음', 'Not changed: could not read research.yaml'))
  if (doc.contents != null && !YAML.isMap(doc.contents)) throw new WorkbenchError(409, t('research.yaml 모양이 달라 고치지 않음', 'Not changed: research.yaml has an unexpected shape'))
  const now = wb.readResearch().concepts
  const next = on ? (now.includes(id) ? now : [...now, id]) : now.filter((c) => c !== id)
  if (next.length === now.length && next.every((c, i) => c === now[i])) return { concepts: now }
  if (next.length) doc.set('concepts', doc.createNode(next, { flow: true }))
  else doc.delete('concepts')
  writeAtomic(wb.researchPath, doc.toString())
  return { concepts: wb.readResearch().concepts }
}
