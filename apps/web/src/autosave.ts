// 편집기의 자동 저장 하나 (블록·진술·원고 장·라이브러리 노트가 함께 쓴다).
// 저장은 한 번에 하나씩 차례로 하고(앞 저장이 받은 hash로 다음 저장), 바깥에서 바뀌면(409) 멈추며,
// 저장하지 않은 고침이 있으면 창을 닫기 전에 브라우저가 묻는다.
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { ConflictError } from './api/http'
import type { WorkbenchEvent } from './api/research'

export type SaveState = 'saved' | 'dirty' | 'saving' | 'conflict' | 'error'
export const AUTOSAVE_MS = 800

export interface AutosaveOptions {
  /** 파일에 쓰고 새 hash를 돌려준다. 바깥에서 바뀌었으면 ConflictError */
  write(text: string, hash: string): Promise<string>
  onState?(state: SaveState): void
  /** 저장이 끝났고 그사이 더 고친 것이 없을 때 */
  onSaved?(text: string): void
  /** 409가 아닌 실패 */
  onError?(e: Error): void
  delay?: number
}

export interface SaveGuard { readonly pending: boolean; flush(): Promise<boolean> }

const closingGroups = new Set<AutosaveGroup>()
/** Reparenting an editor or leaving its project must wait for a close attempt. */
export const hasClosingTabs = () => closingGroups.size > 0

/** Every editor in a tab must settle before the tab can be removed. */
export class AutosaveGroup {
  private savers = new Set<SaveGuard>()
  private closing: Promise<boolean> | null = null

  register(saver: SaveGuard): () => void {
    this.savers.add(saver)
    return () => { this.savers.delete(saver) }
  }

  /** 저장하지 않은 고침이 있거나 저장하는 중인 편집기가 있다 */
  get pending(): boolean { return [...this.savers].some((saver) => saver.pending) }

  prepareClose(): Promise<boolean> {
    if (!this.closing) {
      closingGroups.add(this)
      this.closing = this.savePending().finally(() => { closingGroups.delete(this); this.closing = null })
    }
    return this.closing
  }

  private async savePending(): Promise<boolean> {
    // A successful write can still leave a newer edit (or undo) unsaved.
    while ([...this.savers].some((saver) => saver.pending)) {
      const results = await Promise.all([...this.savers].filter((saver) => saver.pending).map(async (saver) => {
        try { return await saver.flush() } catch { return false }
      }))
      if (results.some((ok) => !ok)) return false
    }
    return true
  }
}

export const AutosaveContext = createContext<AutosaveGroup | null>(null)

/** 바깥 파일 알림을 받았을 때 할 일 */
export type OutsideAction = 'same' | 'gone' | 'reload' | 'stop' | 'wait'

const live = new Set<SaveGuard>()
let unloadHooked = false
function hookUnload() {
  if (unloadHooked || typeof window === 'undefined') return
  unloadHooked = true
  window.addEventListener('beforeunload', (e) => {
    if (![...live].some((a) => a.pending)) return
    e.preventDefault()
    e.returnValue = ''
  })
}
/** 저장하지 않은 고침이 있는 편집기가 있는지 (테스트용) */
export const anyPending = () => [...live].some((a) => a.pending)

/** Manual editors share close protection without changing their save policy. */
export function useSaveGuard(guard: SaveGuard): void {
  const group = useContext(AutosaveContext)
  useEffect(() => {
    live.add(guard)
    hookUnload()
    const unregister = group?.register(guard)
    return () => { unregister?.(); live.delete(guard) }
  }, [guard, group])
}

export class Autosaver {
  /** 편집기의 지금 글 */
  text = ''
  /** 마지막으로 읽거나 쓴 파일의 hash */
  hash = ''
  state: SaveState = 'saved'
  private saved = ''
  private timer: ReturnType<typeof setTimeout> | undefined
  private chain: Promise<unknown> = Promise.resolve()
  private stopped = false
  private running = 0
  private held = false
  /** 화면에서 내려갔다: 저장은 마치되 저장 결과(onSaved·onError)는 화면에 알리지 않는다. 상태(onState)는 계속 알린다 */
  detached = false

  constructor(private readonly o: AutosaveOptions) {}

  /** 저장하지 않은 고침이 있거나 저장하는 중 */
  get pending(): boolean { return this.text !== this.saved || this.running > 0 }

  /** 파일을 (다시) 읽었다: 고침은 버린다 */
  load(text: string, hash: string): void {
    this.clear()
    this.text = this.saved = text
    this.hash = hash
    this.set('saved')
  }

  /** 앱이 서버에서 파일을 고쳐 받은 새 내용 (머리말 고치기 등). 그 전 고침은 먼저 flush해 두어야 한다 */
  adopt(text: string, hash: string): void {
    this.text = this.saved = text
    this.hash = hash
    if (this.state !== 'saving') this.set('saved')
  }

  /** 편집기에서 고쳤다 */
  edit(text: string): void {
    if (this.stopped || text === this.text) return
    this.text = text
    if (this.state === 'conflict') return
    this.set('dirty')
    this.schedule()
  }

  /** 바깥에서 바뀌었다는 것을 다른 길로 알았다 (409 등) */
  conflict(): void {
    this.clear()
    this.set('conflict')
  }

  /** 파일 알림의 hash를 보고 할 일을 정한다. 'stop'이면 이미 저장을 멈췄다 */
  outside(hash: string | null): OutsideAction {
    if (hash === this.hash) return 'same'
    if (hash === null) return 'gone'
    if (this.state === 'saving') return 'wait'
    if (this.state === 'saved') return 'reload'
    if (this.state === 'dirty' || this.state === 'error') { this.conflict(); return 'stop' }
    return 'stop'
  }

  /** 하던 저장이 모두 끝나면 */
  settled(): Promise<unknown> { return this.chain }

  /** 지금 고침을 바로 저장한다. 앞 저장이 있으면 끝난 뒤에. 저장된 상태면 true */
  flush(): Promise<boolean> {
    this.clear()
    // 쉬고 있으면 바로 시작한다(상태가 곧바로 '저장 중'이 된다). 앞 저장이 있으면 그 뒤에
    const start = () => this.writeOnce().finally(() => { this.running-- })
    const run = this.running++ === 0 ? start() : this.chain.then(start)
    this.chain = run.catch(() => undefined)
    return run
  }

  /** 편집기가 내려갈 때: 고치던 것은 저장하고 이 편집기는 더 쓰지 않는다 */
  dispose(): void {
    this.detached = true
    this.clear()
    // 저장이 끝날 때까지는 창을 닫을 때 묻는다
    const done = () => { if (this.detached) live.delete(this) }
    if (this.state === 'dirty' && this.hash) void this.flush().finally(done)
    else if (this.state === 'saving') void this.chain.finally(done)
    else done()
  }

  /** 편집기가 올라올 때 (StrictMode가 내렸다 다시 올려도 같은 저장기를 쓴다) */
  attach(): void {
    this.detached = false
    live.add(this)
    hookUnload()
  }

  /** 잠시 저절로 저장하지 않는다 (지우기 확인 중 등). 고친 것은 남는다 */
  hold(): void {
    this.held = true
    this.clear()
  }
  /** hold를 풀고, 고치던 것이 있으면 다시 예약한다 */
  release(): void {
    this.held = false
    if (this.state === 'dirty') this.schedule()
  }

  /** 지우거나 옮겨 더 저장하면 안 된다 */
  stop(): void {
    this.stopped = true
    this.clear()
    this.saved = this.text
    this.set('saved')
  }

  private async writeOnce(): Promise<boolean> {
    if (this.stopped || this.state === 'conflict') return false
    if (this.text === this.saved) {
      if (this.state !== 'saved') this.set('saved')
      return true
    }
    const text = this.text
    this.set('saving')
    try {
      this.hash = await this.o.write(text, this.hash)
      this.saved = text
      if (this.stopped) return true
      if (this.text === text) {
        this.set('saved')
        if (!this.detached) this.o.onSaved?.(text)
      } else {
        this.set('dirty')
        this.schedule()
      }
      return true
    } catch (e) {
      if (e instanceof ConflictError) this.set('conflict')
      else {
        this.set('error')
        if (!this.detached) this.o.onError?.(e as Error)
      }
      return false
    }
  }

  private schedule() {
    this.clear()
    if (this.held || this.stopped) return
    this.timer = setTimeout(() => { void this.flush() }, this.o.delay ?? AUTOSAVE_MS)
  }

  private clear() {
    if (this.timer !== undefined) clearTimeout(this.timer)
    this.timer = undefined
  }

  private set(state: SaveState) {
    if (this.state === state) return
    this.state = state
    this.o.onState?.(state)
  }
}

/**
 * 파일 알림(에이전트·다른 편집기가 바꿈)을 받았을 때: 고치지 않았으면 다시 읽고, 고치던 중이면 저장을 멈춘다.
 * 저장하는 중이면 그 저장이 끝난 뒤 다시 본다 (이 화면이 쓴 것의 알림이면 hash가 같아 넘어간다).
 */
export function onOutside(saver: Autosaver, hash: string | null, act: { gone(): void; reload(): void }): void {
  const r = saver.outside(hash)
  if (r === 'gone') act.gone()
  else if (r === 'reload') act.reload()
  else if (r === 'wait') void saver.settled().then(() => onOutside(saver, hash, act))
}

/**
 * 화면에서 쓰는 자동 저장. key가 바뀌면(다른 파일) 새 저장기를 만들고, 앞 것은 고치던 것을 그 파일에 저장하고 내려간다.
 * write는 저장기를 만들 때의 것을 쓴다 (key가 바뀐 뒤 앞 파일의 글이 새 파일로 가지 않게).
 */
export function useAutosave(key: string, opts: AutosaveOptions): { saver: Autosaver; state: SaveState } {
  const group = useContext(AutosaveContext)
  const ref = useRef(opts)
  ref.current = opts
  const [state, setState] = useState<SaveState>('saved')
  const saver = useMemo(() => {
    // 만들 때의 것: 내려간 뒤(다른 파일로 바뀐 뒤)에도 이 파일의 것으로 쓰고 알린다
    const { write, onState } = opts
    const a: Autosaver = new Autosaver({
      write,
      onState: (s) => { setState(s); (a.detached ? onState : ref.current.onState)?.(s) },
      onSaved: (t) => ref.current.onSaved?.(t),
      onError: (e) => ref.current.onError?.(e),
      delay: opts.delay,
    })
    return a
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    saver.attach()
    const unregister = group?.register(saver)
    setState(saver.state)
    return () => { unregister?.(); saver.dispose() }
  }, [saver, group])
  void state // 저장기의 상태가 바뀌면 다시 그린다
  return { saver, state: saver.state }
}

/**
 * 앱의 파일 알림(bus의 'rw')에서 이 편집기의 파일 것만 골라 onOutside로 넘긴다.
 * pick은 이 파일의 알림이면 그 hash(지워졌으면 null), 아니면 undefined.
 */
export function useFileEvents(bus: EventTarget | undefined, saver: Autosaver, pick: (e: WorkbenchEvent) => string | null | undefined, act: { gone(): void; reload(): void }): void {
  const ref = useRef({ pick, act })
  ref.current = { pick, act }
  useEffect(() => {
    if (!bus) return
    const on = (ev: Event) => {
      const hash = ref.current.pick((ev as CustomEvent<WorkbenchEvent>).detail)
      if (hash !== undefined) onOutside(saver, hash, { gone: () => ref.current.act.gone(), reload: () => ref.current.act.reload() })
    }
    bus.addEventListener('rw', on)
    return () => bus.removeEventListener('rw', on)
  }, [bus, saver])
}
