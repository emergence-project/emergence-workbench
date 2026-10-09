import fs from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'
import { parseCardFigureRef } from '@rw/core'
import { WorkbenchError, type Workbench } from './workbench.js'
import { t } from './i18n.js'
import { editResearchYaml, researchHash } from './researchYaml.js'

/** 앱에서 바로 고칠 수 있는 프로젝트 정보 (workbench/research.yaml의 맨 위 칸) */
export interface InfoPatch { title?: unknown; question?: unknown; started?: unknown; image?: unknown }

/** 프로젝트 카드 그림으로 쓸 수 있는 파일 */
export const PROJECT_IMAGE_EXT = /\.(svg|png|jpe?g|webp|gif)$/i

const oneLine = (v: string) => v.replace(/\s+/g, ' ').trim()

/**
 * research.yaml의 title·question·started·image만 바꾼다. 다른 칸(sources 등)과 주석은 그대로 둔다.
 * workbench/ 안 파일만 쓰므로 저장소의 원고·문서는 건드리지 않는다.
 */
export function setResearchInfo(wb: Workbench, patch: InfoPatch, baseHash: unknown): { ok: true; hash: string } | { ok: false; currentHash: string } {
  const next: Record<string, string> = {}
  if (patch.title !== undefined) {
    if (typeof patch.title !== 'string' || !oneLine(patch.title)) throw new WorkbenchError(400, t('제목이 비어 있음', 'The title is empty'))
    next.title = oneLine(patch.title)
  }
  if (patch.question !== undefined) {
    if (typeof patch.question !== 'string') throw new WorkbenchError(400, t('설명은 글이어야 함', 'The description must be text'))
    next.question = patch.question.trim()
  }
  if (patch.started !== undefined) {
    if (typeof patch.started !== 'string' || (patch.started.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(patch.started.trim()))) throw new WorkbenchError(400, t('시작일은 YYYY-MM-DD', 'The start date must be YYYY-MM-DD'))
    next.started = patch.started.trim()
  }
  if (patch.image !== undefined) {
    // 라이브러리 참조는 라우트에서 범위·존재를 확인한다. 예전 저장소 기준 경로도 계속 받는다
    if (typeof patch.image !== 'string') throw new WorkbenchError(400, t('그림은 라이브러리 참조 또는 저장소 기준 경로', 'The picture must be a library reference or a path in the repository'))
    const rel = patch.image.trim()
    if (rel && !parseCardFigureRef(rel)) {
      const repo = wb.repo
      const abs = path.resolve(repo, rel)
      if (!abs.startsWith(repo + path.sep) || !PROJECT_IMAGE_EXT.test(rel) || !fs.existsSync(abs)) throw new WorkbenchError(400, t(`저장소 안의 그림 파일(svg·png·jpg)이 아님: ${rel}`, `Not a picture file (svg, png, jpg) in the repository: ${rel}`))
    }
    next.image = rel
  }
  if (!Object.keys(next).length) throw new WorkbenchError(400, t('바꿀 칸이 없음', 'Nothing to change'))

  const current = researchHash(wb)
  if (baseHash !== current) return { ok: false, currentHash: current }
  const rest = (j: Record<string, unknown>) => JSON.stringify(Object.fromEntries(Object.entries(j).filter(([k]) => !(k in next))))
  // 다른 칸의 모양(흐름 목록 [a] · 긴 줄)을 바꾸지 않게 주제 저장(topics.ts)과 같은 설정으로 쓴다
  const toString = { flowCollectionPadding: false, lineWidth: 0 }
  editResearchYaml(wb, (doc) => {
    const before = (doc.toJS() ?? {}) as Record<string, unknown>
    for (const [k, v] of Object.entries(next)) {
      if (k === 'image' && !v) doc.delete(k)
      else doc.set(k, v)
    }
    // 고친 칸 말고는 그대로인지 확인 (쓰기 전에)
    const after = (YAML.parse(doc.toString(toString)) ?? {}) as Record<string, unknown>
    if (rest(after) !== rest(before) || Object.entries(next).some(([k, v]) => String(after[k] ?? '') !== v)) {
      throw new WorkbenchError(409, t('research.yaml을 안전하게 고치지 못해 그대로 둠', 'Left as is: research.yaml could not be changed safely'))
    }
  }, toString)
  return { ok: true, hash: researchHash(wb) }
}
