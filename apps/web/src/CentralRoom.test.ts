import { expect, test } from 'vitest'
import { roomOf } from './CentralRoom'

test('an older server sends a room without a log: the screen fills it in', () => {
  const old = JSON.parse('{"host":"claude-code","members":[],"rules":{"hostInvite":true,"defaultPerm":"talk","callMax":2},"asking":[]}')
  expect(roomOf(old)?.log).toEqual({ total: 0, flipped: 0, recent: [] })
  expect(roomOf(undefined)).toBeUndefined()
})
