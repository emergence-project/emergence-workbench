import { createHash, randomBytes } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

/** path.relative·normalize가 준 상대 경로가 기준 폴더 밖인지. `..notes` 같은 이름은 안이다 */
export const isOutside = (rel: string): boolean => rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)
/** file이 dir 자신이거나 그 안인지 (둘 다 절대 경로) */
export const isInside = (dir: string, file: string): boolean => file === dir || file.startsWith(dir + path.sep)

export function hashOf(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex').slice(0, 16)
}

/**
 * 같은 폴더에 임시 파일을 쓰고 이름을 바꾼다.
 * 저장 도중 끊겨도 원래 파일이 반쯤 쓰인 채로 남지 않는다.
 * 심볼릭 링크는 따라가지 않는다: 링크 자리에 새 파일을 두고 링크가 가리키던 파일은 건드리지 않는다
 * (남이 만든 저장소의 STATUS.md → ~/.zshrc 같은 링크로 저장소 밖 파일을 고치지 않게).
 * 링크를 따라가야 하는 곳(Zotero 자동 내보내기 references.bib)은 followLink로 가리키는 곳을 좁게 허락한다.
 */
export function writeAtomic(file: string, content: string | Uint8Array, opts: { followLink?: (real: string) => boolean } = {}): void {
  if (opts.followLink) {
    try {
      if (fs.lstatSync(file).isSymbolicLink()) {
        const real = fs.realpathSync(file)
        if (opts.followLink(real)) file = real
      }
    } catch { /* 없는 파일·끊긴 링크: 그 자리에 쓴다 */ }
  }
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${randomBytes(4).toString('hex')}.tmp`)
  if (typeof content === 'string') fs.writeFileSync(tmp, content, 'utf8')
  else fs.writeFileSync(tmp, content)
  fs.renameSync(tmp, file)
}

/** 있으면 건드리지 않고, 없을 때만 만든다 */
export function writeIfMissing(file: string, content: string): boolean {
  if (fs.existsSync(file)) return false
  writeAtomic(file, content)
  return true
}

export function localDate(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function localTime(d = new Date()): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** LaTeX \input에서 깨지는 문자(공백 등)가 경로에 있는지 */
export function isLatexSafePath(p: string): boolean {
  return !/[\s{}%\\#~$^&]/.test(p)
}

/** 백업 동기화가 양쪽에서 고친 파일의 GitHub 쪽을 남긴 사본: `이름.github-YYYYMMDD.확장자` (backup.ts) */
export const isBackupCopy = (name: string): boolean => /\.github-\d{8}(?:\.[^./]+)?$/.test(name)
