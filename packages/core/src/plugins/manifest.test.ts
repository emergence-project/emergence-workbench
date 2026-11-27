import { describe, expect, it } from 'vitest'
import { changePlugin, normalizePluginStates, pluginInstalled, requiredBy, type PluginManifest } from './manifest.js'

const text = { ko: '가', en: 'a' }
const m = (id: string, more: Partial<PluginManifest> = {}): PluginManifest => ({ id, name: text, summary: text, stage: 'experiment', installedByDefault: true, ...more })
const room = m('group-room')
const debate = m('debate', { requires: ['group-room'] })
const flow = m('flow', { installedByDefault: false })
const list = [room, debate, flow]
const now = '2026-11-27T06:00:00.000Z'

describe('내장 플러그인 설치 상태', () => {
  it('config.yaml의 틀린 줄은 버리고, 적지 않은 것은 이름표의 기본값', () => {
    const states = normalizePluginStates({ flow: { installed: true, at: now }, Bad: { installed: true, at: now }, debate: { installed: 'no', at: now }, room: { installed: false } })
    expect(states).toEqual({ flow: { installed: true, at: now } })
    expect(normalizePluginStates(['flow'])).toEqual({})
    expect(pluginInstalled(flow, states)).toBe(true)
    expect(pluginInstalled(room, {})).toBe(true)
    expect(pluginInstalled(flow, {})).toBe(false)
  })

  it('설치된 다른 플러그인이 쓰는 것은 제거하지 않는다', () => {
    expect(requiredBy(list, {}, 'group-room')).toEqual(['debate'])
    expect(changePlugin(list, {}, 'group-room', false, now)).toEqual({ ok: false, reason: 'required', id: 'group-room', by: ['debate'] })
    const off = changePlugin(list, {}, 'debate', false, now)
    expect(off.ok && off.states).toEqual({ debate: { installed: false, at: now } })
    const roomOff = off.ok ? changePlugin(list, off.states, 'group-room', false, now) : off
    expect(roomOff.ok).toBe(true)
  })

  it('설치하면 필요한 플러그인도 설치하고, 모르는 id는 거절', () => {
    const states = { 'group-room': { installed: false, at: now }, debate: { installed: false, at: now } }
    const r = changePlugin(list, states, 'debate', true, '2026-11-28T00:00:00.000Z')
    expect(r.ok && r.changed.sort()).toEqual(['debate', 'group-room'])
    expect(r.ok && r.states['group-room']).toEqual({ installed: true, at: '2026-11-28T00:00:00.000Z' })
    expect(changePlugin(list, {}, 'nope', true, now)).toEqual({ ok: false, reason: 'unknown', id: 'nope' })
  })
})
