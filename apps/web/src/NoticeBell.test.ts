import { describe, expect, it } from 'vitest'
import type { ChatRow } from './api'
import { isUnseenIn, type Seen } from './agentSeen'
import { noticesOf } from './NoticeBell'

const now = Date.parse('2026-11-20T12:00:00Z')
const chat = (id: string, state: ChatRow['state'], o: Partial<ChatRow> = {}) =>
  ({ id, title: id, state, archived: false, updated: '2026-11-20T11:00:00Z', ...o }) as ChatRow

describe('알림 종의 에이전트 알림', () => {
  it('왼쪽 띠의 에이전트 수와 같은 대화를 센다: 기다림 · 오류 · 끝났는데 열어 보지 않은 대화 (11/20 피드백 23:27)', () => {
    const seen: Seen = { since: '2026-11-20T00:00:00Z', ids: { opened: '2026-11-20T11:00:00Z' } }
    const chats = [chat('ask', 'waiting'), chat('broke', 'error'), chat('done', 'idle'), chat('opened', 'idle'), chat('work', 'running'), chat('old', 'idle', { archived: true })]
    const agent = noticesOf(chats, [], [], now, (c) => isUnseenIn(seen, c)).filter((n) => n.kind === 'agent')
    expect(agent.map((n) => n.text).sort()).toEqual(['「ask」 허락 기다림', '「broke」 오류', '「done」 종료 · 아직 열어 보지 않음'])
  })
  it('본 기록을 넘기지 않으면 예전처럼 기다림 · 오류만', () => {
    const agent = noticesOf([chat('ask', 'waiting'), chat('done', 'idle')], [], [], now).filter((n) => n.kind === 'agent')
    expect(agent).toHaveLength(1)
  })
})
