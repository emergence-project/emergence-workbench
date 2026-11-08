// 내려받은 앱을 처음 켤 때 (11/8 "GitHub도 에이전트도 모르는 친구가 처음부터 쉽게"):
// 공유 라이브러리와 논문 PDF 폴더를 문서 폴더에 저절로 만들어, 설정을 몰라도 바로 논문을 넣고 읽게 한다.
//   <문서>/EmergenceWorkbench/library   공유 라이브러리 (templates/shared-library 틀)
//   <문서>/EmergenceWorkbench/papers    논문 PDF 폴더
//   <문서>/EmergenceWorkbench/<프로젝트> 「새로 만들기」의 기본 자리 (clone.ts defaultCloneDir)
// 라이브러리를 이미 정했거나(없어진 경로 포함) 프로젝트가 하나라도 있으면 아무것도 하지 않는다: 쓰던 사람의 설정은 건드리지 않는다.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { isLatexSafePath } from './fsutil.js'
import type { Registry } from './registry.js'

/** 내려받은 앱이 쓰는 기본 폴더: 문서 폴더(없으면 집 폴더) 안 EmergenceWorkbench */
export function starterFolder(home = os.homedir()): string {
  const docs = path.join(home, 'Documents')
  return path.join(fs.existsSync(docs) ? docs : home, 'EmergenceWorkbench')
}

/** 처음 켠 때만 라이브러리 · PDF 폴더를 만들고 설정에 적는다. 만든 라이브러리 경로, 하지 않았으면 null */
export function prepareStarter(registry: Registry, template: string, home = os.homedir()): string | null {
  if (registry.librarySet !== undefined || registry.list().length > 0) return null
  const base = starterFolder(home)
  // 라이브러리 경로는 LaTeX가 읽으므로 공백 등이 있으면 쓸 수 없다: 그때는 설정 › 라이브러리 관리에서 고르게 둔다
  if (!isLatexSafePath(base)) return null
  const library = path.join(base, 'library')
  const papers = path.join(base, 'papers')
  if (!fs.existsSync(library)) fs.cpSync(template, library, { recursive: true })
  fs.mkdirSync(papers, { recursive: true })
  registry.setLibrary(library)
  if (registry.pdfFoldersSet.length === 0) registry.setPdfFolders([papers])
  return library
}
