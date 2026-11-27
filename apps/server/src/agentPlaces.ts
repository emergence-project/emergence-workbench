/**
 * 명령 판정의 경로를 실제 파일 시스템에서 본다 (11/27 앱 전체 보안 검토). 판정(commandKind)은 글자로 경로를 읽는데,
 * 프로젝트에 든 링크(notes/k → ~/.ssh/id_ed25519 · h → .git/hooks)와 무늬(.g* · h*)는 글자와 다른 곳을 가리킨다.
 * 그래서 inside 에 주는 판정을 여기서 만든다: 링크는 따라가고, 링크 뒤의 .. 는 링크가 가리키는 곳에서 올라가며, 무늬는 셸처럼 펼쳐 본다.
 * 펼친 것이 너무 많으면 자리를 모르는 것으로(밖으로) 본다. noGit: git 내부(.git 아래)는 작업 폴더로 치지 않는다 (훅 · 설정은 git이 실행한다)
 */
import fs from 'node:fs'
import path from 'node:path'
import { isInside } from './fsutil.js'

const GLOB = /[*?[]/
/** 무늬 하나를 펼칠 때 볼 자리 수의 한도 */
const MAX = 2000

/** 있는 자리면 실제 경로, 없으면 글자 그대로 (그 아래는 링크일 수 없다) */
function step(dir: string, name: string): string {
  const p = path.join(dir, name)
  try { return fs.realpathSync.native(p) } catch { return p }
}

/** 셸 무늬 한 마디 → 정규식 (* ? [abc] [!abc]) */
function globRe(seg: string): RegExp | null {
  let re = ''
  for (let i = 0; i < seg.length; i++) {
    const ch = seg[i]!
    const close = ch === '[' ? seg.indexOf(']', i + 2) : -1
    if (ch === '*') re += '.*'
    else if (ch === '?') re += '.'
    else if (close > 0) { re += `[${seg.slice(i + 1, close).replace(/^[!^]/, '^').replace(/\\/g, '\\\\')}]`; i = close }
    else re += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }
  try { return new RegExp(`^${re}$`, 's') } catch { return null }
}

/** dir 과 그 아래 폴더들 (zsh의 ** : 점으로 시작하는 폴더와 링크는 따라가지 않는다). 너무 많으면 null */
function below(dir: string, budget: { n: number }): string[] | null {
  const out = [dir]
  for (let i = 0; i < out.length; i++) {
    let ents: fs.Dirent[]
    try { ents = fs.readdirSync(out[i]!, { withFileTypes: true }) } catch { continue }
    for (const e of ents) {
      if (!e.isDirectory() || e.name.startsWith('.')) continue
      out.push(path.join(out[i]!, e.name))
      if (--budget.n < 0) return null
    }
  }
  return out
}

/**
 * 절대 경로 글(.. 를 풀기 전)이 실제로 가리키는 자리들. 무늬가 맞는 것이 없으면 글자 그대로(bash). 자리를 다 셀 수 없으면 null
 */
export function places(raw: string): string[] | null {
  // 윈도우: C:\… 로 시작하고 \ 와 / 를 함께 쓴다
  const drive = /^([A-Za-z]:)[\\/]/.exec(raw)
  let cur = [drive ? `${drive[1]}${path.sep}` : '/']
  const budget = { n: MAX }
  for (const seg of raw.slice(drive?.[0].length ?? 0).split(process.platform === 'win32' ? /[\\/]/ : '/')) {
    if (!seg || seg === '.') continue
    if (seg === '..') { cur = cur.map((c) => path.dirname(c)); continue }
    if (seg === '**') {
      const all: string[] = []
      for (const c of cur) { const d = below(c, budget); if (!d) return null; all.push(...d) }
      cur = all
      continue
    }
    if (!GLOB.test(seg)) { cur = cur.map((c) => step(c, seg)); continue }
    const re = globRe(seg)
    if (!re) return null
    const next: string[] = []
    for (const c of cur) {
      let names: string[]
      try { names = fs.readdirSync(c) } catch { continue }
      for (const n of names) {
        // 점으로 시작하는 이름은 무늬도 점으로 시작할 때만 맞는다 (셸의 기본)
        if (!re.test(n) || (n.startsWith('.') && !seg.startsWith('.'))) continue
        next.push(step(c, n))
        if (--budget.n < 0) return null
      }
    }
    cur = next.length ? next : cur.map((c) => path.join(c, seg))
  }
  return cur
}

/**
 * commandKind 의 inside 로 줄 판정: 경로가 가리키는 자리가 모두 roots 안인지 (roots 도 실제 경로로).
 * noGit 이면 .git 아래(그 자리에 있든 없든)는 안으로 치지 않는다. 같은 글은 한 번만 본다
 */
export function placer(roots: string[], o: { noGit?: boolean } = {}): (abs: string, raw?: string) => boolean {
  const real = roots.map((r) => places(path.resolve(r))?.[0] ?? path.resolve(r))
  const seen = new Map<string, boolean>()
  const fits = (x: string) => real.some((r) => isInside(r, x) && !(o.noGit && path.relative(r, x).split(path.sep).includes('.git')))
  return (abs, raw) => {
    const key = raw ?? abs
    let v = seen.get(key)
    if (v === undefined) {
      const all = places(key)
      v = !!all && all.every(fits)
      seen.set(key, v)
    }
    return v
  }
}
