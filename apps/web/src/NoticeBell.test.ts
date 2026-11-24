import { describe, expect, it } from 'vitest'
import type { ChatRow, FeedbackItem } from './api'
import { isUnseenIn, type Seen } from './agentSeen'
import { needCount, noticesOf, unread } from './NoticeBell'

const now = Date.parse('2026-11-20T12:00:00Z')
const chat = (id: string, state: ChatRow['state'], o: Partial<ChatRow> = {}) =>
  ({ id, title: id, state, archived: false, updated: '2026-11-20T11:00:00Z', ...o }) as ChatRow

describe('알림 종의 에이전트 알림', () => {
  it('레일의 에이전트 수와 같은 대화를 센다: 기다림 · 오류 · 끝났는데 열어 보지 않은 대화 (11/20 피드백 23:27)', () => {
    const seen: Seen = { since: '2026-11-20T00:00:00Z', ids: { opened: '2026-11-20T11:00:00Z' } }
    const chats = [chat('ask', 'waiting'), chat('broke', 'error'), chat('done', 'idle'), chat('opened', 'idle'), chat('work', 'running'), chat('old', 'idle', { archived: true })]
    const agent = noticesOf({ chats, unseen: (c) => isUnseenIn(seen, c) }, now).filter((n) => n.kind === 'chat')
    expect(agent.map((n) => n.text).sort()).toEqual(['「ask」 허락 기다림', '「broke」 오류', '「done」 종료 · 아직 열어 보지 않음'])
  })
  it('본 기록을 넘기지 않으면 예전처럼 기다림 · 오류만', () => {
    const agent = noticesOf({ chats: [chat('ask', 'waiting'), chat('done', 'idle')] }, now).filter((n) => n.kind === 'chat')
    expect(agent).toHaveLength(1)
  })
  it('기다리는 대화는 답할 것, 오류 · 열어 보지 않은 종료는 소식 (11/23 "오류는 소식")', () => {
    const list = noticesOf({ chats: [chat('ask', 'waiting'), chat('broke', 'error'), chat('done', 'idle')], unseen: (c) => c.id === 'done' }, now)
    expect(list.map((n) => [n.text.slice(1, n.text.indexOf('」')), n.need])).toEqual([['ask', true], ['broke', false], ['done', false]])
  })
})

describe('알림 종: 답할 것과 소식 (11/23)', () => {
  const record = (id: string, o = {}) => ({ rid: 'p1', target: 'project', title: 'P', id, kind: '질문' as const, by: 'claude', body: '어느 쪽으로\n할까요?', ...o })
  it('에이전트가 물은 기록은 오래돼도 남고, 소식은 7일이 지나면 빠진다', () => {
    const list = noticesOf({ records: [record('c-20260901-0900-ab')], errors: [{ at: '2026-11-01T00:00:00Z', text: '옛 오류' }, { at: '2026-11-20T10:00:00Z', text: '새 오류' }] }, now)
    expect(list.map((n) => [n.kind, n.need, n.text])).toEqual([['question', true, '어느 쪽으로 할까요?'], ['error', false, '새 오류']])
  })
  it('답할 것이 소식보다 먼저, 그 안에서는 새것이 위 · 때를 모르는 것은 아래', () => {
    const list = noticesOf({
      records: [record('c-20261110-0900-ab'), record('c-20261119-0900-cd', { kind: '지시' as const })],
      issues: { tasks: { p1: 2 }, edits: { p1: 0 }, problems: {} },
      chats: [chat('new', 'error', { updated: '2026-11-20T11:59:00Z' })],
    }, now)
    expect(list.map((n) => n.kind)).toEqual(['order', 'question', 'task', 'chat'])
  })
  it('종의 수는 답할 것만 세고, 한 줄이 여럿이면 그 수만큼', () => {
    const list = noticesOf({ records: [record('c-20261110-0900-ab')], issues: { tasks: { p1: 2 }, edits: {}, problems: { p2: 1 } }, errors: [{ at: '2026-11-20T10:00:00Z', text: 'x' }] }, now)
    expect(needCount(list)).toBe(4)
  })
  it('곳: 기록은 그 프로젝트, 피드백 · 업데이트는 앱 개발, 중앙 대화와 오류는 곳이 없다', () => {
    const list = noticesOf({
      records: [record('c-20261110-0900-ab', { rid: '_library', target: 'concept-x' })],
      chats: [chat('s', 'idle', { shipped: true, pr: { number: 7 } as ChatRow['pr'] }), chat('c', 'waiting', { rid: '_central' })],
      errors: [{ at: '2026-11-20T10:00:00Z', text: 'x' }],
    }, now)
    expect(Object.fromEntries(list.map((n) => [n.kind, n.place]))).toEqual({ question: '_library', chat: undefined, update: '_app', error: undefined })
  })
})

describe('완료로 접는 기록 (11/23)', () => {
  it('끝낸 것과, 에이전트가 물은 것에 내가 답한 것. 내가 물어 답을 받은 것은 아니다', async () => {
    const { isDoneRecord } = await import('./recordsPanelHelpers')
    expect(isDoneRecord({ kind: '메모', state: '끝냄' })).toBe(true)
    expect(isDoneRecord({ kind: '질문', by: 'claude', state: '답함' })).toBe(true)
    expect(isDoneRecord({ kind: '질문', by: 'claude', state: '대기' })).toBe(false)
    expect(isDoneRecord({ kind: '질문', state: '답함' })).toBe(false)
  })
})

describe('알림 종: 수로만 아는 알림 (11/23)', () => {
  it('점검 · 저장소 · 소개는 답할 것으로 세고, 새 추천은 소식. 0이면 없다', () => {
    const list = noticesOf({ counts: [
      { kind: 'check', need: true, place: '_figures', n: 2, text: 'tikz 2' },
      { kind: 'about', need: true, place: '_app', n: 0, text: '소개 0' },
      { kind: 'person', need: false, place: '_network', n: 3, text: '추천 3' },
    ] }, now)
    expect(list.map((n) => [n.kind, n.need, n.key])).toEqual([['check', true, 'count:check:_figures:2'], ['person', false, 'count:person:_network:3']])
    expect(needCount(list)).toBe(2)
  })
  it('완료 기록이 많이 쌓인 곳은 소식으로 정리를 권한다', () => {
    const list = noticesOf({ tidy: [{ rid: 'p1', done: 230, ready: 40 }] })
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ kind: 'archive', need: false, place: 'p1', n: 40 })
  })
})

describe('알림 종: 읽은 소식은 빠진다 (11/23 피드백 "읽고 나서 사라져야")', () => {
  it('읽은 소식은 목록에서 빠지고, 답할 것은 읽어도 남는다', () => {
    const list = noticesOf({
      records: [{ rid: 'p1', target: 'project', title: 'P', id: 'c-20261119-0900-ab', kind: '질문' as const, by: 'claude', body: '물음' }],
      errors: [{ at: '2026-11-20T10:00:00Z', text: '읽은 오류' }, { at: '2026-11-20T11:00:00Z', text: '새 오류' }],
    }, now)
    const seen = [list.find((n) => n.text === '읽은 오류')!.key, list.find((n) => n.need)!.key]
    expect(unread(list, seen).map((n) => n.text)).toEqual(['물음', '새 오류'])
  })
})

describe('알림 종: 피드백은 결정할 것만 답할 것 (11/23 결정 필요 · 확인만)', () => {
  const item = (key: string, o: Partial<FeedbackItem>) => ({ key, n: 1, date: '2026-11-19', time: '09:00', kind: '수정', target: '홈', text: key, ...o }) as FeedbackItem
  it('결정을 묻는 답은 답할 것, 결과를 알린 답(확인만)은 소식: 종의 수가 레일의 피드백 수와 같다', () => {
    const list = noticesOf({ feedback: [
      item('묻는 답', { status: { state: '확인 필요', ask: '폴더까지 지울까요?', handled_at: '2026-11-19T10:00' } }),
      item('알린 답', { status: { state: '반영', handled_at: '2026-11-19T11:00' } }),
      item('처리 전', {}),
    ] }, now)
    expect(list.map((n) => [n.text, n.need])).toEqual([['묻는 답', true], ['알린 답', false]])
    expect(needCount(list)).toBe(1)
  })
})
