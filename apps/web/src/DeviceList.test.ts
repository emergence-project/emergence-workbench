import { expect, test } from 'vitest'
import { serverSkew, versionDiffers, versionGap, versionName } from './DeviceList'
import type { Device } from './api'

const dev = (name: string, version: string | undefined, more: Partial<Device> = {}): Device => ({ name, seen: '2026-11-21T00:00:00.000Z', accounts: [], this: false, online: true, ...(version && { version }), ...more })

test('a device differs only when both versions are known and it is not this one', () => {
  const me = dev('laptop', 'bbb2222', { this: true })
  expect(versionDiffers(dev('studio', 'aaa1111'), me)).toBe(true)
  expect(versionDiffers(dev('studio', 'bbb2222'), me)).toBe(false)
  expect(versionDiffers(dev('studio', undefined), me)).toBe(false)
  expect(versionDiffers(me, me)).toBe(false)
})

test('server skew names the server and both versions', () => {
  const list = [dev('studio', 'aaa1111', { server: true, label: 'Mac Studio' }), dev('laptop', 'bbb2222', { this: true })]
  expect(serverSkew(list)).toEqual({ name: 'Mac Studio', server: 'aaa1111', here: 'bbb2222', gap: '버전 다름' })
  expect(serverSkew([dev('studio', 'bbb2222', { server: true, this: true })])).toBeNull()
  expect(serverSkew(undefined)).toBeNull()
})

test('a version reads as its last update number and time, and the gap as updates behind or ahead', () => {
  const at = new Date(2026, 10, 21, 7, 58).toISOString()
  expect(versionName(dev('mini', 'dc65a0e', { build: { pr: 610, at, behind: 12, ahead: 0 } }))).toBe('#610 · 11/21 07:58')
  expect(versionName(dev('mini', 'dc65a0e', { build: { at, behind: 0, ahead: 0 } }))).toBe('dc65a0e · 11/21 07:58')
  expect(versionName(dev('mini', 'dc65a0e'))).toBe('dc65a0e')
  expect(versionGap(dev('mini', 'x', { build: { at, behind: 12, ahead: 0 } }))).toBe('업데이트 12개 남음')
  expect(versionGap(dev('mini', 'x', { build: { at, behind: 0, ahead: 3 } }))).toBe('업데이트 3개 앞섬')
  expect(versionGap(dev('mini', 'x', { build: { at, behind: 2, ahead: 3 } }))).toBe('버전 다름')
  expect(versionGap(dev('mini', 'x'))).toBe('버전 다름')
})
