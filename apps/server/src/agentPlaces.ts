/**
 * 명령 판정의 경로를 글자와 실제 자리 둘 다로 본다 (11/27 앱 전체 보안 검토). 판정(commandKind)은 글자로 경로를 읽는데,
 * 프로젝트에 든 링크(notes/k → ~/.ssh/id_ed25519 · h → .git/hooks)는 글자와 다른 곳을 가리킨다.
 * 셸의 cd 와 읽기 도구는 .. 를 글자로 풀고(notes/in/../..), 파일을 여는 커널은 링크를 따라간 뒤 푼다. 그래서 둘 다 안이어야 안이다
 * (실제 자리만 보면 링크 뒤의 .. 로 글자상 밖이 지나갔다: 별도 검토).
 * 무늬(* ?)는 펼치지 않고, 아주 긴 경로와 너무 많은 경로는 보지 않고 밖으로 본다: 판정은 서버에서 바로 돌아 오래 걸리면 앱이 멈춘다.
 * 무늬 · 셸의 다른 꼴로 비켜 가는 것은 OS 격리가 막을 몫이다.
 * noGit: git 내부(.git 아래)는 작업 폴더로 치지 않는다 (훅 · 설정은 git이 실행한다). .git 에 맞을 수 있는 무늬도 그렇게 본다
 */
import fs from 'node:fs'
import path from 'node:path'
import { isInside } from './fsutil.js'

/**
 * 절대 경로 글(.. 를 풀기 전)이 실제로 가리키는 자리: 마디마다 링크를 따라가고 .. 는 지금 실제 자리에서 올라간다.
 * 없는 마디부터는 글자 그대로. 대상이 없는(끊긴) 링크는 어디를 가리킬지 몰라 null
 */
export function realPlace(raw: string): string | null {
  // 너무 긴 글은 보지 않는다(판정은 서버에서 바로 돈다): 어디인지 모르는 것으로
  if (raw.length > MAX_CHARS) return null
  // 윈도우: C:\… 로 시작하고 \ 와 / 를 함께 쓴다
  const drive = /^([A-Za-z]:)[\\/]/.exec(raw)
  const segs = raw.slice(drive?.[0].length ?? 0).split(process.platform === 'win32' ? /[\\/]/ : '/').filter((x) => x && x !== '.')
  if (segs.length > MAX_SEGS) return null
  let cur = drive ? `${drive[1]}${path.sep}` : '/'
  for (const seg of segs) {
    if (seg === '..') { cur = path.dirname(cur); continue }
    const p = cur.endsWith(path.sep) ? cur + seg : cur + path.sep + seg
    let link = false
    try { link = fs.lstatSync(p).isSymbolicLink() } catch { cur = p; continue }
    if (!link) { cur = p; continue }
    try { cur = fs.realpathSync.native(p) } catch { return null }
  }
  return cur
}
const MAX_CHARS = 4096
const MAX_SEGS = 256
/** 한 판정에서 실제 파일로 볼 경로 수의 한도: 넘으면 밖으로 (묻는다) */
const MAX_KEYS = 2000

/** 셸 무늬 한 마디가 .git 에 맞을 수 있는지 (* ? [..]). 다 읽지 못하는 꼴(zsh 의 ( ) · [[:class:]])은 맞을 수 있다고 본다 */
export function globHitsGit(seg: string): boolean {
  if (!/[*?[(]/.test(seg)) return seg.toLowerCase() === '.git'
  // 셸은 점으로 시작하는 이름을 무늬의 첫 글자가 점(이나 [ ] · zsh 의 ( ))일 때만 맞춘다: * · ?git 은 .git 을 펼치지 않는다
  if (!/^[.[(]/.test(seg) || (seg.startsWith('(') && !seg.includes('.'))) return false
  if (/[(]|\[\[:|\\/.test(seg)) return true
  const name = '.git'
  // 낱자 단위 DP: 무늬 길이 × 4 (되짚기 없음)
  let at = new Set([0])
  for (let i = 0; i < seg.length && at.size; i++) {
    const ch = seg[i]!
    const next = new Set<number>()
    if (ch === '*') { const lo = Math.min(...at); for (let j = lo; j <= name.length; j++) next.add(j); at = next; continue }
    let hit: (c: string) => boolean
    if (ch === '?') hit = () => true
    else if (ch === '[' && seg.indexOf(']', i + 2) > 0) {
      const close = seg.indexOf(']', i + 2)
      const body = seg.slice(i + 1, close)
      const neg = /^[!^]/.test(body)
      const set = body.replace(/^[!^]/, '')
      hit = (c) => {
        let inSet = false
        for (let k = 0; k < set.length; k++) {
          if (set[k + 1] === '-' && k + 2 < set.length) { if (c.toLowerCase() >= set[k]!.toLowerCase() && c.toLowerCase() <= set[k + 2]!.toLowerCase()) inSet = true; k += 2 }
          else if (set[k]!.toLowerCase() === c.toLowerCase()) inSet = true
        }
        return inSet !== neg
      }
      i = close
    } else hit = (c) => c.toLowerCase() === ch.toLowerCase()
    for (const j of at) if (j < name.length && hit(name[j]!)) next.add(j + 1)
    at = next
  }
  return at.has(name.length)
}

/**
 * 루트에서 본 상대 경로에 git 내부 마디가 있는지: .git(이나 그에 맞을 수 있는 무늬) 마디이고, 그 자리에 실제로 .git 이 있을 때.
 * (sed 's/.git/x/' 의 s/.git 처럼 .git 이 없는 곳의 글자는 git 내부가 아니다. 맥 · 윈도우는 대소문자를 가리지 않는다)
 */
function inGit(root: string, x: string): boolean {
  const segs = path.relative(root, x).split(path.sep)
  return segs.some((seg, i) => {
    if (!globHitsGit(seg)) return false
    const parent = realPlace(path.join(root, ...segs.slice(0, i)))
    try { return !!parent && !!fs.lstatSync(path.join(parent, '.git')) } catch { return false }
  })
}

/**
 * commandKind 의 inside 로 줄 판정: 글자로 푼 경로와 실제 자리가 모두 roots 안인지 (roots 는 적힌 대로와 실제 경로 둘 다).
 * noGit 이면 .git 아래(그 자리에 있든 없든)는 안으로 치지 않는다. 같은 글은 한 번만 본다
 */
export function placer(roots: string[], o: { noGit?: boolean } = {}): (abs: string, raw?: string) => boolean {
  const literal = roots.map((r) => path.resolve(r))
  const real = literal.map((r) => realPlace(r) ?? r)
  const fits = (set: string[], x: string) => set.some((r) => isInside(r, x) && !(o.noGit && inGit(r, x)))
  const seen = new Map<string, boolean>()
  return (abs, raw) => {
    const key = raw ?? abs
    let v = seen.get(key)
    if (v === undefined) {
      if (seen.size >= MAX_KEYS) return false
      const at = realPlace(key)
      v = fits([...literal, ...real], path.resolve(abs)) && !!at && fits(real, at)
      seen.set(key, v)
    }
    return v
  }
}
