import fs from 'node:fs'
import YAML from 'yaml'
import { hashOf, writeAtomic } from './fsutil.js'
import { t } from './i18n.js'
import { WorkbenchError, type Workbench } from './workbench.js'

/** research.yaml 글 (없으면 빈 글) */
export const researchText = (wb: Workbench): string => (fs.existsSync(wb.researchPath) ? fs.readFileSync(wb.researchPath, 'utf8') : '')
/** research.yaml의 해시. 그 파일을 고치는 요청이 baseHash로 보낸다 (주제·메인 노트·프로젝트 정보가 함께 쓴다) */
export const researchHash = (wb: Workbench): string => hashOf(researchText(wb))

/**
 * research.yaml을 YAML 문서로 읽어 edit로 고치고, 글이 바뀌었으면 쓴다. 다른 칸과 주석은 그대로 둔다.
 * 읽지 못하거나 맨 위가 맵이 아니면 고치지 않고 409. edit가 false를 돌리면 쓰지 않는다.
 * toString: 쓸 때의 YAML 설정 (사람이 쓴 모양을 지키는 설정은 곳마다 다르다)
 */
export function editResearchYaml(wb: Workbench, edit: (doc: YAML.Document, text: string) => void | false, toString?: YAML.ToStringOptions): { text: string; out: string } {
  const text = researchText(wb)
  const doc = YAML.parseDocument(text)
  if (doc.errors.length) throw new WorkbenchError(409, t('research.yaml을 읽지 못해 고치지 않음', 'Not changed: could not read research.yaml'))
  if (doc.contents != null && !YAML.isMap(doc.contents)) throw new WorkbenchError(409, t('research.yaml 모양이 달라 고치지 않음', 'Not changed: research.yaml has an unexpected shape'))
  if (edit(doc, text) === false) return { text, out: text }
  const out = doc.toString(toString)
  if (out !== text) writeAtomic(wb.researchPath, out)
  return { text, out }
}
