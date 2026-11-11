// 시도가 가리키는 파일의 지문 (11/11 "옛 흐름 없애기" 나): 판정할 때 파일마다 해시를 적어 두고, 읽을 때 지금 해시와 견줘 "판정 후 변경"을 알린다.
// 보고할 때의 커밋도 여기서 읽는다(git을 부르지 않고 .git의 파일만 읽어, 서버 없이 도는 명령에서도 같다).
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { isInside } from './fsutil.js'

/** 없는 파일 · 저장소 밖 경로의 지문 */
export const MISSING = '-'
/** 폴더는 이 수까지만 훑는다. 넘으면 지문을 적지 않는다(견주지 않음) */
const DIR_MAX = 300
const cache = new Map<string, { mtimeMs: number; size: number; hash: string }>()

function fileHash(abs: string, st: fs.Stats): string {
  const hit = cache.get(abs)
  if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size) return hit.hash
  const hash = crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex').slice(0, 12)
  cache.set(abs, { mtimeMs: st.mtimeMs, size: st.size, hash })
  return hash
}

function walk(dir: string, out: string[]): boolean {
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === '__pycache__') continue
    const abs = path.join(dir, e.name)
    if (e.isDirectory()) { if (!walk(abs, out)) return false } else if (e.isFile()) { out.push(abs); if (out.length > DIR_MAX) return false }
  }
  return true
}

/** 저장소 기준 경로 하나의 지문: 파일은 내용 해시, 폴더는 그 안 파일들의 해시를 모은 해시, 없으면 '-', 너무 큰 폴더는 undefined */
export function fingerprint(repo: string, rel: string): string | undefined {
  const abs = path.resolve(repo, rel)
  if (!isInside(repo, abs)) return MISSING
  let st: fs.Stats
  try { st = fs.statSync(abs) } catch { return MISSING }
  if (st.isFile()) return fileHash(abs, st)
  if (!st.isDirectory()) return MISSING
  const files: string[] = []
  if (!walk(abs, files)) return undefined
  const h = crypto.createHash('sha256')
  for (const f of files) h.update(`${path.relative(abs, f)}\0${fileHash(f, fs.statSync(f))}\n`)
  return h.digest('hex').slice(0, 12)
}

/** 판정할 때 적는 지문 표 (견줄 수 없는 큰 폴더는 뺀다) */
export function fingerprints(repo: string, files: string[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const f of files) { const h = fingerprint(repo, f); if (h !== undefined) out[f] = h }
  return out
}

/** 적어 둔 지문과 지금이 다른 파일 */
export const changedSince = (repo: string, marks: Record<string, string>): string[] => Object.entries(marks).filter(([f, h]) => fingerprint(repo, f) !== h).map(([f]) => f)

/** 지금 HEAD 커밋의 앞 12자. git 저장소의 맨 위 폴더가 아니거나 읽지 못하면 undefined */
export function headCommit(from: string): string | undefined {
  try {
    // 저장소 맨 위에 .git이 있을 때만: 다른 저장소 안에 든 예제 폴더는 바깥 저장소의 커밋을 적지 않는다
    const top = from
    let dir = path.join(top, '.git')
    if (fs.statSync(dir).isFile()) { const m = /^gitdir: (.+)$/m.exec(fs.readFileSync(dir, 'utf8')); if (!m) return undefined; dir = path.resolve(top, m[1]!.trim()) }
    const sha = (s: string) => (/^[0-9a-f]{40}$/.test(s) ? s.slice(0, 12) : undefined)
    const head = fs.readFileSync(path.join(dir, 'HEAD'), 'utf8').trim()
    const ref = /^ref: (.+)$/.exec(head)?.[1]
    if (!ref) return sha(head)
    const common = fs.existsSync(path.join(dir, 'commondir')) ? path.resolve(dir, fs.readFileSync(path.join(dir, 'commondir'), 'utf8').trim()) : dir
    for (const d of [dir, common]) { try { const s = sha(fs.readFileSync(path.join(d, ref), 'utf8').trim()); if (s) return s } catch { /* 다음 자리 */ } }
    const packed = fs.readFileSync(path.join(common, 'packed-refs'), 'utf8').split('\n').find((l) => l.endsWith(` ${ref}`))
    return packed ? sha(packed.slice(0, 40)) : undefined
  } catch { return undefined }
}
