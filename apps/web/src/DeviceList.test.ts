import { expect, test } from 'vitest'
import { serverSkew, versionDiffers } from './DeviceList'
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
  expect(serverSkew(list)).toEqual({ name: 'Mac Studio', server: 'aaa1111', here: 'bbb2222' })
  expect(serverSkew([dev('studio', 'bbb2222', { server: true, this: true })])).toBeNull()
  expect(serverSkew(undefined)).toBeNull()
})
