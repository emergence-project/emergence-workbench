import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConflictError } from './api/http'
import { anyPending, AutosaveGroup, Autosaver, onOutside, type SaveState } from './autosave'

/** 서버 흉내: 받은 hash가 지금 것과 다르면 409 */
function server(initial = 'a') {
  const file = { text: initial, hash: 'h0', n: 0 }
  const calls: { text: string; hash: string }[] = []
  let gate: Promise<void> | null = null
  const write = vi.fn(async (text: string, hash: string) => {
    calls.push({ text, hash })
    if (gate) await gate
    if (hash !== file.hash) throw new ConflictError(file.hash)
    file.text = text
    file.hash = `h${++file.n}`
    return file.hash
  })
  return {
    file, calls, write,
    hold() { let open!: () => void; gate = new Promise((r) => { open = () => { gate = null; r() } }); return () => open() },
    outsideEdit(text: string) { file.text = text; file.hash = `x${++file.n}` },
  }
}

function make(s: ReturnType<typeof server>) {
  const states: SaveState[] = []
  const saved: string[] = []
  const errors: string[] = []
  const a = new Autosaver({ write: s.write, onState: (x) => states.push(x), onSaved: (t) => saved.push(t), onError: (e) => errors.push(e.message) })
  a.load(s.file.text, s.file.hash)
  return { a, states, saved, errors }
}

describe('자동 저장', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('손을 멈추면 한 번 저장한다', async () => {
    const s = server()
    const { a, saved } = make(s)
    a.edit('ab'); a.edit('abc')
    await vi.advanceTimersByTimeAsync(800)
    expect(s.calls).toEqual([{ text: 'abc', hash: 'h0' }])
    expect(a.state).toBe('saved')
    expect(saved).toEqual(['abc'])
  })

  it('저장 중에 또 고치면 앞 저장이 끝난 뒤 새 hash로 이어 저장한다 (두 저장이 겹쳐 409가 나지 않는다)', async () => {
    const s = server()
    const { a } = make(s)
    a.edit('ab')
    const open = s.hold()
    void a.flush()
    a.edit('abc')
    const second = a.flush() // 단축키로 바로 저장
    await Promise.resolve()
    expect(s.calls).toHaveLength(1)
    open()
    expect(await second).toBe(true)
    expect(s.calls).toEqual([{ text: 'ab', hash: 'h0' }, { text: 'abc', hash: 'h1' }])
    expect(s.file.text).toBe('abc')
    expect(a.state).toBe('saved')
  })

  it('저장하는 동안 고친 것은 저장이 끝나면 고치는 중으로 남고 다시 예약된다', async () => {
    const s = server()
    const { a } = make(s)
    a.edit('ab')
    const open = s.hold()
    const first = a.flush()
    a.edit('abc')
    open()
    await first
    expect(a.state).toBe('dirty')
    await vi.advanceTimersByTimeAsync(800)
    expect(s.file.text).toBe('abc')
    expect(a.state).toBe('saved')
  })

  it('바깥에서 바뀌었으면 덮지 않고 멈춘다. 멈춘 뒤의 고침도 저장하지 않는다', async () => {
    const s = server()
    const { a } = make(s)
    s.outsideEdit('에이전트')
    a.edit('ab')
    expect(await a.flush()).toBe(false)
    expect(a.state).toBe('conflict')
    a.edit('abc')
    await vi.advanceTimersByTimeAsync(2000)
    expect(s.file.text).toBe('에이전트')
    expect(s.calls).toHaveLength(1)
  })

  it('파일 알림: 고치지 않았으면 다시 읽고, 고치던 중이면 멈추고, 저장 중이면 끝난 뒤 다시 보라 한다', async () => {
    const s = server()
    const { a } = make(s)
    expect(a.outside('h0')).toBe('same')
    expect(a.outside('x9')).toBe('reload')
    expect(a.outside(null)).toBe('gone')
    a.edit('ab')
    const open = s.hold()
    const run = a.flush()
    expect(a.outside('x9')).toBe('wait')
    open(); await run
    expect(a.outside(a.hash)).toBe('same')
    a.edit('abc')
    expect(a.outside('x9')).toBe('stop')
    expect(a.state).toBe('conflict')
    await vi.advanceTimersByTimeAsync(2000)
    expect(s.file.text).toBe('ab')
  })

  it('저장 실패(409 말고)는 오류로 두고, 다시 저장하면 이어진다', async () => {
    const s = server()
    const { a, errors } = make(s)
    s.write.mockRejectedValueOnce(new Error('서버가 꺼짐'))
    a.edit('ab')
    expect(await a.flush()).toBe(false)
    expect(a.state).toBe('error')
    expect(errors).toEqual(['서버가 꺼짐'])
    expect(await a.flush()).toBe(true)
    expect(s.file.text).toBe('ab')
  })

  it('편집기가 내려가면 고치던 것을 저장하고, 끝날 때까지 창 닫기를 묻는다', async () => {
    const s = server()
    const { a, states, saved } = make(s)
    a.attach()
    a.edit('ab')
    expect(anyPending()).toBe(true)
    const open = s.hold()
    a.dispose()
    expect(anyPending()).toBe(true)
    open()
    await vi.advanceTimersByTimeAsync(0)
    expect(s.file.text).toBe('ab')
    expect(anyPending()).toBe(false)
    expect(states.at(-1)).toBe('saved') // 원고 장의 '고치는 중' 표시가 저장이 끝나면 지워지게 상태는 계속 알린다
    expect(saved).toEqual([]) // 저장 결과는 내려간 화면에 알리지 않는다
  })

  it('지운 뒤에는 저장하지 않는다', async () => {
    const s = server()
    const { a } = make(s)
    a.edit('ab')
    a.stop()
    a.edit('abc')
    expect(await a.flush()).toBe(false)
    await vi.advanceTimersByTimeAsync(2000)
    expect(s.calls).toHaveLength(0)
  })

  it('앱이 고친 새 내용을 받으면 그 hash로 이어 저장한다', async () => {
    const s = server()
    const { a } = make(s)
    s.outsideEdit('a\nstatus: done') // 앱 서버가 머리말을 고침
    a.adopt(s.file.text, s.file.hash)
    a.edit('a\nstatus: done\nb')
    expect(await a.flush()).toBe(true)
    expect(s.file.text).toBe('a\nstatus: done\nb')
  })
})

describe('파일 알림 처리', () => {
  it('저장 중에 온 알림은 저장이 끝난 뒤 다시 본다: 이 화면이 쓴 것이면 넘어간다', async () => {
    const s = server()
    const { a } = make(s)
    a.edit('ab')
    const open = s.hold()
    const run = a.flush()
    const act = { gone: vi.fn(), reload: vi.fn() }
    onOutside(a, 'h1', act) // 이 저장이 만들 hash
    open(); await run; await a.settled(); await Promise.resolve()
    expect(act.reload).not.toHaveBeenCalled()
    expect(a.state).toBe('saved')
  })
})

describe('잠시 멈춤', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })
  it('멈춘 동안 고친 것은 저절로 저장하지 않고, 풀면 이어 저장한다', async () => {
    const s = server()
    const { a } = make(s)
    a.hold()
    a.edit('ab')
    await vi.advanceTimersByTimeAsync(2000)
    expect(s.calls).toHaveLength(0)
    a.release()
    await vi.advanceTimersByTimeAsync(800)
    expect(s.file.text).toBe('ab')
  })
})


describe('unsaved drafts when closing', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

  it.each(['error', 'conflict'] as const)('keeps an unsaved %s draft pending', async (failure) => {
    const s = server()
    const { a } = make(s)
    a.attach()
    a.edit('draft')
    s.write.mockRejectedValueOnce(failure === 'conflict' ? new ConflictError('outside') : new Error('offline'))
    expect(await a.flush()).toBe(false)
    expect(a.state).toBe(failure)
    expect(a.text).toBe('draft')
    try { expect(anyPending()).toBe(true) } finally { a.stop(); a.dispose() }
  })

  it('has no unsaved draft after undoing to the last saved text', () => {
    const s = server()
    const { a } = make(s)
    a.edit('draft')
    a.edit('a')
    try { expect(a.pending).toBe(false) } finally { a.stop(); a.dispose() }
  })

  it('still guards a running write after undoing, then saves the undo', async () => {
    const s = server()
    const { a } = make(s)
    a.edit('draft')
    const open = s.hold()
    const run = a.flush()
    a.edit('a')
    expect(a.pending).toBe(true)
    open(); await run
    expect(a.pending).toBe(true) // disk now contains the draft, editor contains the undo
    await a.flush()
    expect(s.file.text).toBe('a')
    expect(a.pending).toBe(false)
  })

  it('warns on window close after error and conflict until the draft is resolved', async () => {
    const surface = new EventTarget()
    vi.stubGlobal('window', surface)
    for (const failure of ['error', 'conflict'] as const) {
      const s = server()
      const { a } = make(s)
      a.attach(); a.edit('draft')
      s.write.mockRejectedValueOnce(failure === 'conflict' ? new ConflictError('outside') : new Error('offline'))
      await a.flush()
      try {
        const event = new Event('beforeunload', { cancelable: true })
        surface.dispatchEvent(event)
        expect(event.defaultPrevented).toBe(true)
        a.load(s.file.text, s.file.hash)
        const resolved = new Event('beforeunload', { cancelable: true })
        surface.dispatchEvent(resolved)
        expect(resolved.defaultPrevented).toBe(false)
      } finally { a.stop(); a.dispose() }
    }
  })
})


describe('saving a tab before closing', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it.each(['error', 'conflict'] as const)('refuses to close a tab with a %s draft', async (failure) => {
    const s = server()
    const { a } = make(s)
    const tab = new AutosaveGroup()
    tab.register(a)
    a.edit('draft')
    s.write.mockRejectedValueOnce(failure === 'conflict' ? new ConflictError('outside') : new Error('offline'))
    expect(await tab.prepareClose()).toBe(false)
    expect(a.text).toBe('draft')
    expect(a.pending).toBe(true)
    expect(s.file.text).toBe('a')
    if (failure === 'error') {
      expect(await tab.prepareClose()).toBe(true)
      expect(s.file.text).toBe('draft')
    } else {
      expect(await tab.prepareClose()).toBe(false)
      expect(s.write).toHaveBeenCalledTimes(1)
      a.load('outside', 'outside')
      expect(await tab.prepareClose()).toBe(true)
    }
    a.stop()
  })

  it('shares repeated close requests and drains edits made during the write', async () => {
    const s = server()
    const { a } = make(s)
    const tab = new AutosaveGroup()
    tab.register(a)
    a.edit('first')
    const open = s.hold()
    const closing = tab.prepareClose()
    expect(tab.prepareClose()).toBe(closing)
    a.edit('last')
    open()
    expect(await closing).toBe(true)
    expect(s.calls).toEqual([{ text: 'first', hash: 'h0' }, { text: 'last', hash: 'h1' }])
    expect(s.file.text).toBe('last')
    expect(a.pending).toBe(false)
  })

  it('saves an undo after a write that was already running', async () => {
    const s = server()
    const { a } = make(s)
    const tab = new AutosaveGroup()
    tab.register(a)
    a.edit('draft')
    const open = s.hold()
    const running = a.flush()
    a.edit('a')
    const closing = tab.prepareClose()
    open(); await running
    expect(await closing).toBe(true)
    expect(s.file.text).toBe('a')
    expect(a.pending).toBe(false)
  })

  it('keeps every registered editor protected and isolates other tabs', async () => {
    const one = make(server()), two = make(server()), other = make(server())
    const tab = new AutosaveGroup(), separate = new AutosaveGroup()
    const unregister = tab.register(one.a)
    tab.register(two.a); separate.register(other.a)
    one.a.edit('one'); two.a.edit('two'); two.a.conflict(); other.a.edit('other')
    unregister()
    expect(await tab.prepareClose()).toBe(false)
    expect(await separate.prepareClose()).toBe(true)
    one.a.stop(); two.a.stop(); other.a.stop()
  })

  it('registers again after StrictMode cleanup without losing the guard', async () => {
    const { a } = make(server())
    const tab = new AutosaveGroup()
    tab.register(a)()
    tab.register(a)
    a.edit('draft'); a.conflict()
    expect(await tab.prepareClose()).toBe(false)
    a.stop()
  })
})


describe('manual editor in a tab', () => {
  it('keeps a manual draft open without starting an automatic save', async () => {
    let dirty = true
    const flush = vi.fn(async () => !dirty)
    const tab = new AutosaveGroup()
    tab.register({ get pending() { return dirty }, flush })
    expect(await tab.prepareClose()).toBe(false)
    dirty = false // The editor's explicit save or discard resolved its draft.
    expect(await tab.prepareClose()).toBe(true)
    expect(flush).toHaveBeenCalledTimes(1)
  })
})
