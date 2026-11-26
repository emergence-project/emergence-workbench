// 끝까지 읽은 명령만 묻지 않고 지나가기 (11/26 사용자 결정): 판정이 허락한 줄도 끝까지 읽지 못했으면 한 번 묻는다. 묻거나 막는 판정은 그대로다
import { describe, expect, it } from 'vitest'
import { judge, type PolicyCtx } from './agentPolicy.js'

const base = { planOk: false, readable: [] as string[], claimedBy: () => undefined }
const auto: PolicyCtx = { ...base, rid: 'p', write: 'notes', mode: 'auto', scope: { kind: 'project' }, repo: '/w/p' }
const appEdit: PolicyCtx = { ...base, rid: '_app', write: 'notes', mode: 'edit', scope: { kind: 'app' }, repo: '/w/wt' }
const manualRunOn: PolicyCtx = { ...base, rid: 'p', write: 'notes', mode: 'ask', scope: { kind: 'project' }, repo: '/w/p', auto: () => ({ read: true, run: true, web: false }) }
const bash = (ctx: PolicyCtx, command: string) => judge(ctx, 'Bash', { command })

describe('끝까지 읽은 명령만 묻지 않고 지나간다', () => {
  it('읽은 줄은 전처럼 묻지 않는다 (자동 · 앱 고치기의 편집 자동 수락 · 실행을 켠 수동)', () => {
    for (const ctx of [auto, appEdit, manualRunOn]) {
      for (const c of ['pnpm test', 'git status && git diff', 'CI=1 pnpm vitest run x', `git commit -m "$(cat <<'EOF'\nIt's (fine)\nEOF\n)"`]) {
        expect(bash(ctx, c).kind, `${ctx.mode} ${c}`).toBe('allow')
      }
    }
  })
  it('모르는 프로그램은 실행 묻기로 (「늘」 있음, 열쇠 run:<프로그램>)', () => {
    for (const ctx of [auto, appEdit, manualRunOn]) expect(bash(ctx, 'zzfoo a'), ctx.mode).toMatchObject({ kind: 'ask', key: 'run:zzfoo', does: 'run' })
    expect(bash(auto, 'zzfoo a')).not.toHaveProperty('once')
    // 「늘」로 허락하면 묻지 않는다
    expect(bash({ ...auto, always: (k) => k === 'run:zzfoo' }, 'zzfoo a').kind).toBe('allow')
  })
  it('그 밖의 읽지 못한 줄은 까닭과 함께 「늘」 없이 한 번 묻는다', () => {
    for (const [c, label] of [['eval "$x"', '모르는 문법 eval'], ['$cmd a', '변수로 정한 프로그램'], ['cp a "$dest"', '값을 모르는 변수'], ['GIT_PAGER=cat git log', '환경 변수 GIT_PAGER'], ['ls ${(f)x}', '모르는 문법']] as const) {
      for (const ctx of [auto, appEdit]) {
        const v = bash(ctx, c)
        expect(v, c).toMatchObject({ kind: 'ask', key: `unread:${c}`, does: 'run', once: true })
        expect(v.kind === 'ask' && v.label, c).toContain(label)
      }
    }
  })
  it('묻거나 막는 판정은 그대로다 (가벼워지지도 바뀌지도 않는다)', () => {
    // 삭제 · 외부는 전처럼 그 이름으로 묻는다 (읽지 못한 조각이 함께 있어도)
    expect(bash(auto, 'rm -rf x; eval y')).toMatchObject({ kind: 'ask', does: 'delete' })
    expect(bash(auto, 'curl -X POST x; zzfoo')).toMatchObject({ kind: 'ask', does: 'outside' })
    // 읽기 전용은 막는다
    expect(bash({ ...auto, write: 'read', mode: 'ask' }, 'rm x').kind).toBe('deny')
    // 실행을 끈 수동은 전처럼 실행 묻기
    expect(bash({ ...manualRunOn, auto: () => ({ read: true, run: false, web: false }) }, 'make x')).toMatchObject({ kind: 'ask', key: 'run:make x' })
  })
})
