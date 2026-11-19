// 중앙 대화 (11/16 "중앙 에이전트"): 읽기만 하는 중앙이 하위 대화를 열고 · 보내고 · 닫으며, 사용자의 말 앞에 하위 대화 요약을 붙인다
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { APP_LIVE_MAX, CENTRAL_BRIEF, CentralChats, digestOf, KID_REPORT_MAX, kidReport, lastReport } from './agentCentral.js'
import { judge, type AgentRunner, type PolicyCtx, type RunEvent, type RunInput } from './agentChats.js'
import { sampleAppWork } from './appWorktree.js'
import { ClaudeAccounts } from './claudeAccounts.js'

const W = 'mcp__workbench__'
const ctx = (o: Partial<PolicyCtx> = {}): PolicyCtx => ({ rid: '_central', write: 'read', mode: 'edit', planOk: false, scope: { kind: 'all' }, repo: '/w/app', readable: [], claimedBy: () => undefined, ...o })

describe('중앙 대화의 허락 규칙', () => {
  it('읽기 · 하위 대화 도구는 허락하고, 고치기 · 명령 · 기록 쓰기 · 앱 올리기는 하위 대화에 맡기라고 막는다', () => {
    for (const tool of ['read_note', 'project_status', 'chat_open', 'chat_send', 'chat_list', 'chat_close']) expect(judge(ctx(), `${W}${tool}`, {}).kind, tool).toBe('allow')
    expect(judge(ctx(), 'Read', { file_path: '/w/app/CLAUDE.md' }).kind).toBe('allow')
    for (const [tool, input] of [['Bash', { command: 'npm i' }], ['Bash', { command: 'ls > a.txt' }], ['Edit', { file_path: '/w/app/a.ts' }], [`${W}edit_note`, {}], [`${W}add_record`, {}], [`${W}add_journal`, {}], [`${W}app_submit`, {}], [`${W}feedback_answer`, {}]] as const) {
      const v = judge(ctx(), tool, input)
      expect(v.kind, tool).toBe('deny')
      expect(v.kind === 'deny' && v.message).toContain('chat_open')
    }
  })
})

describe('하위 대화 요약', () => {
  it('마지막 에이전트 글을 줄이고, 보관한 것은 빼고 한 줄씩', () => {
    expect(lastReport([{ kind: 'text', at: '', text: '처음' }, { kind: 'text', at: '', text: '하위 에이전트', sub: true }, { kind: 'text', at: '', text: `끝 ${'가'.repeat(400)}` }])).toMatch(/^끝 가+…$/)
    expect(lastReport([{ kind: 'user', at: '', text: '말' }])).toBeUndefined()
    const d = digestOf([
      { id: 'a', rid: '_app', title: '그림 안 보임', state: 'running', archived: false, pr: { number: 7, url: 'u' }, report: '고치는 중', updated: '' },
      { id: 'b', rid: 'chiral', title: '2절', state: 'waiting', wait: 'plan', archived: false, updated: '' },
      { id: 'c', rid: 'chiral', title: '끝난 것', state: 'idle', archived: true, updated: '' },
    ])
    expect(d).toContain('a · app · "그림 안 보임" · working · PR #7 · last: 고치는 중')
    expect(d).toContain('waiting for plan approval')
    expect(d).not.toContain('끝난 것')
    expect(digestOf([])).toContain('none open')
  })
})

describe('하위 대화의 보고 (11/19)', () => {
  const report = '끝났습니다.\n\n## 보고\n- 바꾼 것: 목록이 이어짐\n- 위치: PR #9\n- 판단: 없음\n- 남은 일: 없음'
  it('마지막 글의 「## 보고」 절을 줄바꿈 그대로 꺼낸다', () => {
    expect(kidReport([{ kind: 'text', at: '', text: report }])).toBe('- 바꾼 것: 목록이 이어짐\n- 위치: PR #9\n- 판단: 없음\n- 남은 일: 없음')
    expect(kidReport([{ kind: 'text', at: '', text: '**보고:**\n- 바꾼 것: 가' }])).toBe('- 바꾼 것: 가')
    expect(kidReport([{ kind: 'text', at: '', text: '보고만 하고 절은 없음' }])).toBeUndefined()
  })
  it('앱이 덧붙인 글(합침 알림)에 가리지 않고, 그 뒤에 사용자가 말했으면 지난 보고는 쓰지 않는다. 상한에서 자른다', () => {
    const merged = { kind: 'text' as const, at: '', text: 'Merged PR #9. The app picks up the new version and restarts when idle.' }
    expect(kidReport([{ kind: 'text', at: '', text: report }, merged])).toContain('- 위치: PR #9')
    expect(kidReport([{ kind: 'text', at: '', text: report }, { kind: 'user', at: '', text: '더 고쳐' }, merged])).toBeUndefined()
    expect(kidReport([{ kind: 'text', at: '', text: `## 보고\n${'가'.repeat(KID_REPORT_MAX + 10)}` }])).toHaveLength(KID_REPORT_MAX + 1)
  })
  it('요약 줄에는 보고를 한 줄로 줄여 싣는다', () => {
    const d = digestOf([{ id: 'a', rid: '_app', title: '목록', state: 'idle', archived: false, report: '- 바꾼 것: 가\n- 위치: 나', reported: true, updated: '' }])
    expect(d).toContain('· done with its turn · report: - 바꾼 것: 가 - 위치: 나')
  })
})

describe('중앙과 하위 대화', () => {
  const dirs: string[] = []
  const seen: RunInput[] = []
  const fake: AgentRunner = async function* (input): AsyncIterable<RunEvent> {
    seen.push(input)
    yield { type: 'session', id: `s${seen.length}` }
    yield { type: 'text', text: `받음: ${input.prompt.split('\n').at(-1)}` }
    yield { type: 'result', ok: true }
  }
  const make = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-central-'))
    dirs.push(dir)
    return new CentralChats({ dir, runner: fake, limit: 4, project: (rid) => ({ repo: dir, title: rid }), readable: () => [], extraDirs: () => [], notify: () => {}, app: sampleAppWork(path.join(dir, 'wt')) })
  }
  afterEach(() => { for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }); seen.length = 0 })

  it('처음 말하면 중앙을 Opus · 읽기만으로 열고 안내를 붙인다. 하위 대화를 열면 다음 말 앞에 그 요약이 붙는다', async () => {
    const chats = make()
    expect(chats.centralState()).toEqual({ kids: [], app: true })
    const c = chats.talk('앱 그림이 안 보여')
    expect(c).toMatchObject({ rid: '_central', write: 'read', model: 'opus', scope: { kind: 'all' } })
    await vi.waitFor(() => expect(chats.get(c.id).state).toBe('idle'))
    expect(seen[0]!.central).toBe(true)
    expect(seen[0]!.appChat).toBeUndefined()
    expect(seen[0]!.prompt).toContain(CENTRAL_BRIEF.split('\n')[0])
    // 화면에 보이는 것은 사용자의 말뿐
    expect(chats.get(c.id).items[0]).toMatchObject({ kind: 'user', text: '앱 그림이 안 보여' })

    const kid = await chats.openKid({ role: 'app', title: '그림 안 보임', task: '앱 그림이 안 보여' })
    expect(kid).toMatchObject({ rid: '_app', title: '그림 안 보임' })
    expect(chats.get(kid.id).parent).toBe(c.id)
    await vi.waitFor(() => expect(chats.get(kid.id).state).toBe('idle'))
    expect(seen.at(-1)!.appChat).toBe(kid.id)
    expect(chats.centralState().kids.map((k) => k.id)).toEqual([kid.id])
    expect(chats.centralState().kids[0]!.report).toBe('받음: 앱 그림이 안 보여')

    chats.talk('어떻게 됐어?')
    await vi.waitFor(() => expect(chats.get(c.id).state).toBe('idle'))
    const p = seen.filter((s) => s.central).at(-1)!.prompt
    expect(p).toContain(`${kid.id} · app · "그림 안 보임" · done with its turn`)
    expect(p).not.toContain(CENTRAL_BRIEF.split('\n')[0]) // 세션이 이어지면 안내는 한 번만
    expect(p.endsWith('어떻게 됐어?')).toBe(true)
    chats.stopAll()
  })

  it('프로젝트 작성 · 이어 보내기 · 닫기, 그리고 중앙이 아닌 대화와 일하는 대화는 막는다', async () => {
    const chats = make()
    const c = chats.talk('노트 다듬어 줘')
    await vi.waitFor(() => expect(chats.get(c.id).state).toBe('idle'))
    await expect(chats.openKid({ role: 'project', title: 'x', task: 'y' })).rejects.toThrow(/project/)
    const kid = await chats.openKid({ role: 'project', project: 'chiral', title: '2절 다듬기', task: '노트 다듬어 줘' })
    expect(chats.get(kid.id)).toMatchObject({ rid: 'chiral', write: 'notes', scope: { kind: 'project' }, parent: c.id })
    expect(() => chats.closeKid(kid.id, '끝')).toThrow(/일하는 중|working/)
    await vi.waitFor(() => expect(chats.get(kid.id).state).toBe('idle'))
    chats.sendKid(kid.id, '3절도')
    await vi.waitFor(() => expect(seen.at(-1)!.prompt).toContain('3절도'))
    await vi.waitFor(() => expect(chats.get(kid.id).state).toBe('idle'))
    const closed = chats.closeKid(kid.id, '2 · 3절을 다듬음\n수정 검토에 있음\n남은 일 없음')
    expect(closed).toMatchObject({ archived: true, summary: expect.stringContaining('수정 검토') })
    expect(digestOf(chats.centralState().kids)).toContain('none open')
    // 중앙이 열지 않은 대화
    const other = chats.create({ rid: 'chiral', text: '혼자 연 대화' })
    expect(() => chats.sendKid(other.id, '이어')).toThrow(/하위 대화|sub-conversation/)
    chats.stopAll()
  })

  it(`앱 고치기 대화는 동시에 ${APP_LIVE_MAX}개까지`, async () => {
    let release!: () => void
    const hold = new Promise<void>((r) => { release = r })
    const slow: AgentRunner = async function* (input): AsyncIterable<RunEvent> {
      seen.push(input)
      yield { type: 'session', id: `s${seen.length}` }
      if (input.appChat) await hold
      yield { type: 'result', ok: true }
    }
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-central-'))
    dirs.push(dir)
    const chats = new CentralChats({ dir, runner: slow, limit: 5, project: () => ({ repo: dir, title: 'p' }), readable: () => [], extraDirs: () => [], notify: () => {}, app: sampleAppWork(path.join(dir, 'wt')) })
    const c = chats.talk('셋 다 고쳐')
    await vi.waitFor(() => expect(chats.get(c.id).state).toBe('idle'))
    for (let i = 0; i < APP_LIVE_MAX; i++) await chats.openKid({ role: 'app', title: `고침 ${i}`, task: '고쳐' })
    await expect(chats.openKid({ role: 'app', title: '하나 더', task: '고쳐' })).rejects.toThrow(/chat_send|이어 보내/)
    release()
    chats.stopAll()
  })
})

describe('중앙의 계정과 피드백 수', () => {
  const FIX = path.resolve(import.meta.dirname, '../../../fixtures/sandbox-feedback')
  it('중앙은 고른 계정 폴더로 돌고, 상태 줄에 맡을 피드백 수를 붙이되 스스로 열지 않는다', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-central-'))
    const seen: RunInput[] = []
    const fake: AgentRunner = async function* (input): AsyncIterable<RunEvent> { seen.push(input); yield { type: 'session', id: 's' }; yield { type: 'result', ok: true } }
    const fb = path.join(dir, 'feedback')
    fs.cpSync(FIX, fb, { recursive: true })
    const accounts = new ClaudeAccounts(path.join(dir, 'config'), { cli: () => '/bin/true', home: path.join(dir, 'home') })
    const pro = accounts.add('Pro').accounts[1]!.id
    const chats = new CentralChats({ dir, runner: fake, limit: 4, project: (rid) => ({ repo: dir, title: rid }), readable: () => [], extraDirs: () => [], notify: () => {}, accounts, feedback: { dir: fb } })
    const waiting = chats.feedbackTurns().items.filter((i) => !i.taken && !i.chat).length
    expect(waiting).toBeGreaterThan(0)
    const c = chats.talk('안녕')
    await vi.waitFor(() => expect(chats.get(c.id).state).toBe('idle'))
    expect(chats.get(c.id).account).toBe(pro)
    expect(seen[0]!.env).toEqual({ CLAUDE_CONFIG_DIR: accounts.dirOf(pro) })
    expect(seen[0]!.prompt).toContain(`[Feedback waiting for the agent: ${waiting}.`)
    expect(seen[0]!.prompt).toContain('Feedback is always handled by feedback sub-conversations, never by you')
    expect(chats.centralState().kids).toEqual([])
    chats.stopAll()
    fs.rmSync(dir, { recursive: true, force: true })
  })
})
