import { describe, expect, it } from 'vitest'
import { commandKind } from './chat-auto.js'
import { gitOutside, pathWords } from './chat-place.js'

describe('새 자리와 주고받는 git (11/27 보안 검토)', () => {
  it('받기의 저장소 자리가 이름이 아니면 새 자리', () => {
    for (const rest of [['https://x.example/r'], ['--depth', '1', 'https://x.example/r'], ['git@host:x/y'], ['../other'], ['/abs/repo'], ['--', 'file:///r'], ['-j', '4', 'ext::sh']]) expect(gitOutside('fetch', rest), rest.join(' ')).toBe(true)
    for (const rest of [[], ['origin'], ['--all'], ['--prune', 'origin'], ['--depth', '1', 'origin'], ['origin', 'main:main'], ['my.fork', 'feature/x']]) expect(gitOutside('pull', rest), rest.join(' ')).toBe(false)
    expect(gitOutside('remote', ['add', 'o', 'u'])).toBe(true)
    expect(gitOutside('remote', ['-v'])).toBe(false)
    expect(gitOutside('push', ['https://x'])).toBe(false)
    // 줄여 쓴 긴 옵션 · 이름 뒤의 주소 · 프로그램을 돌리는 옵션
    expect(gitOutside('fetch', ['--dep', '1', 'host:r'])).toBe(true)
    expect(gitOutside('fetch', ['origin', 'https://x.example/r'])).toBe(true)
    expect(gitOutside('fetch', ['--upl=sh', 'origin'])).toBe(true)
    expect(gitOutside('pull', ['--recurse-submodules', 'origin', 'main'])).toBe(false)
    expect(gitOutside('remote', ['show', 'https://x.example/r'])).toBe(true)
    expect(gitOutside('remote', ['show', 'origin'])).toBe(false)
    expect(gitOutside('ls-remote', ['https://x.example/r'])).toBe(true)
    expect(gitOutside('ls-remote', ['origin'])).toBe(false)
    // 이 저장소의 설정 쓰기는 원격 주소 · 훅 폴더 · 돌릴 프로그램을 바꿀 수 있다
    expect(gitOutside('config', ['core.hooksPath', 'x'])).toBe(true)
    expect(gitOutside('config', ['remote.origin.url', 'https://x'])).toBe(true)
    expect(gitOutside('config', ['--get', 'user.name'])).toBe(false)
    expect(gitOutside('config', ['user.name'])).toBe(false)
  })
  it('commandKind: 새 주소로 받기는 밖, 이름으로 받기는 편집', () => {
    const k = (c: string) => commandKind(c, { cwd: '/w/p', inside: (a) => a === '/w/p' || a.startsWith('/w/p/') })
    expect(k('git fetch "https://attacker.example/x"')).toBe('outside')
    expect(k('git -C . pull ../other main')).toBe('outside')
    expect(k('git fetch origin')).toBe('edit')
  })
})

describe('경로로 볼 낱말', () => {
  it('slashes: / 가 든 낱말도 본다. 주소 · 거르는 무늬 값은 넓히지 않는다', () => {
    expect(pathWords(['x', 'h/y', '-o.git/config', 'https://x.example/a'], true)).toEqual(['h/y', '.git/config'])
    expect(pathWords(['.', '-not', '-path', './.git/*', '-name', 'a/b'], true)).toEqual([])
    expect(pathWords(['--exclude-dir=.git', '--exclude=./.git/*', '-r', 'foo', '.'], true)).toEqual([])
    // 무늬 값도 경로 모양이면 전처럼 본다
    expect(pathWords(['-path', '../../x'], true)).toEqual(['../../x'])
    // slashes 가 아니면 경로 모양(/ ~ ..)만: 전과 같다
    expect(pathWords(['h/y', '/etc/x', '-f/etc/y'])).toEqual(['/etc/x', '/etc/y'])
  })
  it('commandKind: slashes 낱말은 inside 에 .. 를 풀기 전의 글과 함께 묻는다', () => {
    const seen: string[] = []
    const kind = commandKind('cp x h/y', { cwd: '/w/p', slashes: true, inside: (abs, raw) => { seen.push(raw ?? abs); return !(raw ?? abs).includes('/h/') } })
    expect(kind).toBe('outside')
    expect(seen).toContain('/w/p/h/y')
  })
})
