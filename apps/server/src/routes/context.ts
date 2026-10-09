import type { LibraryReadIndex } from '../libraryReadIndex.js'
import type { FSWatcher } from 'chokidar'
import type { AppOptions } from '../app.js'
import type { ConceptIndex } from '../conceptIndex.js'
import type { Registry } from '../registry.js'
import type { WorkbenchEvent } from '../watcher.js'
import type { Workbench } from '../workbench.js'

/** routes/의 파일들이 함께 쓰는 것. app.ts의 buildApp이 만든다 */
export interface RouteContext {
  libraryReads: LibraryReadIndex
  registry: Registry
  opts: AppOptions
  /** 열린 화면들에 실시간 알림을 보낸다 */
  broadcast: (e: WorkbenchEvent) => void
  /** 지금 열려 있는 화면(실시간 알림 연결) 수 */
  clients: () => number
  wbOf: (rid: string) => Workbench
  /** 연구의 파일 감시를 켠다 (등록할 때) */
  ensureWatch: (rid: string) => void
  watchers: Map<string, FSWatcher>
  /** 등록한 연구의 저장소 경로 */
  repoPath: (rid: string) => string
  /** 개념노트 색인 (공유 라이브러리가 없으면 null). 개념노트 화면과 노트 링크가 함께 쓴다 */
  conceptIndex: () => ConceptIndex | null
}
