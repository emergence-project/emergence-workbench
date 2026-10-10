import { describe, expect, it } from 'vitest'
import { feedbackConversation, feedbackThread, lockedBefore, reworked, splitThread, summaryRows } from './feedbackThread'

const status = { state: '반영' as const, note: '처리한 글', commit: 'abc1234' }

describe('feedbackThread', () => {
  it('승인·반려가 없으면 처리 하나', () => {
    expect(feedbackThread({ status })).toEqual([{ who: 'Claude', kind: '처리', note: '처리한 글', commit: 'abc1234' }])
    expect(feedbackThread({})).toEqual([])
  })

  it('반려 뒤 다시 처리 전이면 끝에 대기', () => {
    const e = { status, review: { verdict: '반려' as const, at: '2026-10-04T14:00', note: '좁다' } }
    const t = feedbackThread(e)
    expect(t.map((s) => s.kind)).toEqual(['처리', '반려', '대기'])
    expect(t[0]).toMatchObject({ note: '처리한 글' })
    expect(reworked(e)).toBe(false)
  })

  it('다시 처리했으면 지금의 처리 글은 그 반려 뒤로 가고, 다시 정할 차례가 된다', () => {
    const e = { status: { ...status, rework: '2026-10-04T14:00' }, review: { verdict: '반려' as const, at: '2026-10-04T14:00', note: '좁다' } }
    expect(feedbackThread(e)).toEqual([
      { who: 'Claude', kind: '처리' },
      { who: '나', kind: '반려', at: '2026-10-04T14:00', note: '좁다' },
      { who: 'Claude', kind: '다시 처리', note: '처리한 글', commit: 'abc1234' },
    ])
    expect(reworked(e)).toBe(true)
  })

  it('진행도 반려처럼 다시 처리를 기다리고, 다시 처리하면 그 뒤에 놓인다 (10/9)', () => {
    const asked = { state: '확인 필요' as const, ask: '지울까요?', note: '아직 안 고침' }
    expect(feedbackThread({ status: asked, review: { verdict: '진행' as const, at: '2026-10-04T14:00' } }).map((s) => s.kind)).toEqual(['처리', '진행', '대기'])
    const done = { status: { ...status, rework: '2026-10-04T14:00' }, review: { verdict: '진행' as const, at: '2026-10-04T14:00', note: '휴지통으로' } }
    expect(feedbackThread(done).map((s) => s.kind)).toEqual(['처리', '진행', '다시 처리'])
    expect(reworked(done)).toBe(true)
    expect(feedbackThread({ status: asked, review: { verdict: '중단' as const, at: '2026-10-04T14:00' } }).map((s) => s.kind)).toEqual(['처리', '중단'])
  })

  it('history의 반려들과 최신 승인을 시각순으로', () => {
    const e = {
      status: { ...status, rework: '2026-10-04T15:00' },
      review: { verdict: '승인' as const, at: '2026-10-04T16:00', history: [{ verdict: '반려' as const, at: '2026-10-04T14:00' }, { verdict: '반려' as const, at: '2026-10-04T15:00', note: '아직' }] },
    }
    expect(feedbackThread(e).map((s) => s.kind)).toEqual(['처리', '반려', '반려', '다시 처리', '승인'])
    expect(reworked(e)).toBe(false)
  })

  it('revised가 있으면 처리마다 그때의 글과 고친 칸을 보이고, 마지막 주고받음만 펼친다 (10/8 11:28)', () => {
    const e = {
      status: {
        state: '반영' as const, understood: '제목만 키운다', cause: '같음', note: '셋째', commit: 'c3', rework: 'T2',
        revised: [{ at: 'T1', understood: '모두 키운다', cause: '같음', note: '첫째', commit: 'c1' }, { at: 'T2', understood: '제목만 키운다', cause: '같음', note: '둘째', commit: 'c2' }],
      },
      review: { verdict: '반려' as const, at: 'T2', note: '옅다', history: [{ verdict: '반려' as const, at: 'T1', note: '제목만' }] },
    }
    const steps = feedbackThread(e)
    expect(steps).toEqual([
      { who: 'Claude', kind: '처리', note: '첫째', commit: 'c1' },
      { who: '나', kind: '반려', at: 'T1', note: '제목만' },
      { who: 'Claude', kind: '다시 처리', note: '둘째', commit: 'c2', changes: [{ field: 'understood', from: '모두 키운다', to: '제목만 키운다' }] },
      { who: '나', kind: '반려', at: 'T2', note: '옅다' },
      { who: 'Claude', kind: '다시 처리', note: '셋째', commit: 'c3', changes: [] },
    ])
    expect(reworked(e)).toBe(true)
    expect(splitThread(steps)).toMatchObject({ folded: 2, latest: [{ kind: '반려', at: 'T2' }, { kind: '다시 처리', note: '셋째' }] })
  })

  it('반려 하나뿐이면 접지 않고, 새 반려를 다시 처리하기 전이면 대기', () => {
    const one = { status: { state: '반영' as const, note: '지금', rework: 'T1', revised: [{ at: 'T1', note: '처음' }] }, review: { verdict: '반려' as const, at: 'T1' } }
    const steps = feedbackThread(one)
    expect(steps.map((s) => s.kind)).toEqual(['처리', '반려', '다시 처리'])
    expect(splitThread(steps).folded).toBe(0)
    const again = { ...one, review: { verdict: '반려' as const, at: 'T9', history: [{ verdict: '반려' as const, at: 'T1' }] } }
    expect(feedbackThread(again).map((s) => s.kind)).toEqual(['처리', '반려', '다시 처리', '반려', '대기'])
  })
})

describe('feedbackConversation (10/8 대화 화면)', () => {
  it('코멘트와 그 답을 시각순으로 끼우고, 시각이 없는 처리는 앞 글 바로 뒤에 둔다', () => {
    const e = {
      status: { state: '답변' as const, note: '다시 답함', rework: '2026-10-04T12:10', handled_at: '2026-10-04T12:20', by: 'claude', replies: [{ at: '2026-10-04T13:05', to: '2026-10-04T12:40', note: '네', by: 'codex' }] },
      review: { verdict: '승인' as const, at: '2026-10-04T12:30', history: [{ verdict: '반려' as const, at: '2026-10-04T12:10', note: '더' }] },
      comments: [{ at: '2026-10-04T12:40', note: '넓힐 수 있어?' }, { at: '2026-10-04T12:15', note: '처리 전에 덧붙임' }],
    }
    const t = feedbackConversation(e)
    expect(t.map((s) => `${s.who} ${s.kind}`)).toEqual(['Claude 처리', '나 반려', '나 코멘트', 'Claude 다시 처리', '나 승인', '나 코멘트', 'Claude 답'])
    expect(t[3]).toMatchObject({ at: '2026-10-04T12:20', by: 'claude' })
    expect(t[6]).toMatchObject({ note: '네', by: 'codex' })
  })

  it('코멘트가 없으면 예전 주고받음 그대로, 다시 처리 대기는 늘 끝', () => {
    const e = { status, review: { verdict: '반려' as const, at: '2026-10-04T14:00' }, comments: [{ at: '2026-10-04T15:00', note: '그리고' }] }
    expect(feedbackConversation({ status }).map((s) => s.kind)).toEqual(['처리'])
    expect(feedbackConversation(e).map((s) => s.kind)).toEqual(['처리', '반려', '코멘트', '대기'])
  })
})

describe('summaryRows', () => {
  it('세 칸마다 그 글이 마지막으로 바뀐 처리의 시각', () => {
    const rows = summaryRows({
      state: '반영', understood: '제목만 키운다', cause: '옅은 회색', note: '진하게', handled_at: '2026-10-04T11:20',
      revised: [
        { at: '2026-10-04T10:00', understood: '모두 키운다', note: '모두 키움', handled_at: '2026-10-04T09:50' },
        { at: '2026-10-04T10:40', understood: '제목만 키운다', note: '제목만 키움', handled_at: '2026-10-04T10:20' },
      ],
    })
    expect(rows).toEqual([
      { field: 'understood', text: '제목만 키운다', at: '2026-10-04T10:20' },
      { field: 'cause', text: '옅은 회색', at: '2026-10-04T11:20' },
      { field: 'note', text: '진하게', at: '2026-10-04T11:20' },
    ])
    expect(summaryRows({ state: '답변', note: '답' })).toEqual([{ field: 'note', text: '답' }])
  })
})

describe('lockedBefore', () => {
  it('Claude가 처리하거나 답한 앞의 내 글은 잠그고, 그 뒤의 글만 고친다', () => {
    const steps = feedbackConversation({
      status: { ...status, handled_at: '2026-10-04T10:00', replies: [{ at: '2026-10-04T12:00', to: '2026-10-04T11:00', note: '답' }] },
      comments: [{ at: '2026-10-04T11:00', note: '물음' }, { at: '2026-10-04T13:00', note: '또 물음' }],
    })
    const n = lockedBefore(steps)
    expect(steps.map((s, i) => (s.who === '나' ? `${s.note}:${i < n ? '잠김' : '고침'}` : s.kind))).toEqual(['처리', '물음:잠김', '답', '또 물음:고침'])
  })
  it('다시 처리 대기는 답이 아니다', () => {
    const steps = feedbackThread({ status, review: { verdict: '반려', at: '2026-10-04T11:00', note: '다시' } })
    expect(steps.at(-1)?.kind).toBe('대기')
    expect(lockedBefore(steps)).toBe(0)
  })
})
