import fs from 'node:fs'
import path from 'node:path'

export const REFRESH_MS = 1000

/** 읽기 전용 파생 자료. 삭제·재생성도 감지하며 원본을 절대 쓰지 않는다. */
export function fileCache<T>(parse: (text: string, file: string, stat: fs.Stats) => T): (file: string) => T {
  const cache = new Map<string, { stamp: string; value: T }>()
  return (file) => {
    let stat: fs.Stats
    try { stat = fs.statSync(file) } catch (e) { cache.delete(file); throw e }
    const stamp = `${stat.mtimeMs}:${stat.size}:${stat.ctimeMs}:${stat.ino}`
    const hit = cache.get(file)
    if (hit?.stamp === stamp) return hit.value
    const value = parse(fs.readFileSync(file, 'utf8'), file, stat)
    cache.set(file, { stamp, value })
    return value
  }
}

/**
 * 내용은 읽지 않고 폴더 추가·삭제와 파일 교체를 감지한다. 숨김·빌드 폴더는 제외.
 * skip: 빼는 경로(절대). dirStats: false면 폴더는 이름만 적는다 — 빼 둔 파일을 바꿔 써도(rename) 부모 폴더의 mtime 때문에 바뀐 것으로 보지 않게.
 * 폴더 안 항목의 추가·삭제는 항목 이름으로 잡힌다.
 */
export function treeStamp(roots: string[], opts: { skip?: string[]; dirStats?: boolean } = {}): string {
  const parts: string[] = []
  const seen = new Set<string>(opts.skip)
  const dirStats = opts.dirStats ?? true
  const walk = (file: string) => {
    if (seen.has(file)) return
    seen.add(file)
    try {
      const s = fs.statSync(file)
      parts.push(s.isDirectory() && !dirStats ? `${file}/` : `${file}:${s.mtimeMs}:${s.size}:${s.ctimeMs}:${s.ino}:${s.blocks}`)
      if (s.isDirectory()) {
        // 디렉터리 심볼릭 링크는 순환하지 않는다. 파일 심볼릭 링크는 stat으로 바뀜을 감지한다.
        for (const e of fs.readdirSync(file, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
          if ((e.name.startsWith('.') && !e.name.endsWith('.icloud')) || ['node_modules', 'build', 'dist'].includes(e.name)) continue
          if (e.isSymbolicLink()) {
            try { if (fs.statSync(path.join(file, e.name)).isDirectory()) continue } catch { continue }
          }
          walk(path.join(file, e.name))
        }
      }
    } catch { parts.push(`${file}:missing`) }
  }
  roots.forEach(walk)
  return parts.join('\n')
}

/** 최대 1초 간격으로 의존 파일의 mtime/size를 점검하고, 바뀌었을 때만 다시 계산한다. */
export class DerivedCache<T> {
  private stamp: string | undefined
  private checked = -Infinity
  private value: T | undefined
  invalidate(): void { this.checked = -Infinity }
  get(dependencies: () => string, build: () => T): T {
    const now = Date.now()
    if (this.stamp !== undefined && now - this.checked < REFRESH_MS) return this.value!
    const stamp = dependencies()
    if (stamp !== this.stamp) {
      const value = build()
      this.value = value
      this.stamp = stamp
    }
    this.checked = Date.now()
    return this.value!
  }
}
