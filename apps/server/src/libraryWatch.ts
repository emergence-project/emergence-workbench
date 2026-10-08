import path from 'node:path'
import chokidar, { type FSWatcher } from 'chokidar'

/**
 * 공용 라이브러리(research-library)를 앱 밖에서 바꿨을 때의 알림.
 * 에이전트가 개념노트를 고치거나 Finder로 그림을 넣어도 열린 화면이 다시 읽게 한다.
 * concepts: 개념노트·참고문헌·분류 (개념노트 화면과 지식 화면이 읽는다), figures: 그림, papers: 논문 목록.
 */
export type LibraryPart = 'concepts' | 'figures' | 'papers'

/** 라이브러리 안의 어떤 자료인지. 알림 대상이 아니면 null (숨김 파일, .git, 서식 등) */
export function libraryPart(lib: string, file: string): LibraryPart | null {
  const rel = path.relative(lib, file).split(path.sep)
  if (!rel[0] || rel[0] === '..' || rel.some((p) => p.startsWith('.'))) return null
  const [top] = rel
  if (rel.length === 1) {
    if (top === 'references.bib' || top === 'subjects.yaml') return 'concepts'
    if (top === 'papers.yaml') return 'papers'
    return null
  }
  if (top === 'concepts') return 'concepts'
  if (top === 'figures') return 'figures'
  if (top === 'papers' || top === 'comments') return 'papers'
  return null
}

/** 감시할 폴더 안인지 (아래로 내려가야 하는 폴더도 참) */
function watched(lib: string, file: string): boolean {
  const rel = path.relative(lib, file)
  if (rel === '') return true
  const [top] = rel.split(path.sep)
  if (!top || top.startsWith('.')) return false
  return ['concepts', 'figures', 'papers', 'comments', 'references.bib', 'subjects.yaml', 'papers.yaml'].includes(top)
}

/**
 * 라이브러리 폴더 하나를 본다. 처음에 없던 figures/ 같은 폴더가 생겨도 잡도록 라이브러리 뿌리를 보고 이름으로 거른다.
 * 쓰기가 끝날 때까지 잠깐 기다린다 (큰 PDF를 복사할 때 반쯤 쓴 파일로 알리지 않게).
 */
export function watchLibrary(lib: string, emit: (part: LibraryPart, file: string) => void): FSWatcher {
  const watcher = chokidar.watch(lib, {
    ignoreInitial: true,
    depth: 3,
    awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
    ignored: (file) => !watched(lib, file),
  })
  watcher.on('all', (event, file) => {
    if (event !== 'add' && event !== 'change' && event !== 'unlink' && event !== 'addDir' && event !== 'unlinkDir') return
    const part = libraryPart(lib, file)
    if (part) emit(part, path.relative(lib, file).split(path.sep).join('/'))
  })
  return watcher
}
