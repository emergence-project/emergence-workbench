import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ClipboardEvent, type DragEvent, type KeyboardEvent, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { agentChatsApi, api, APP_RID, notesApi, type Attach, type AttachKind, type ChatEffort, type ChatMessageBody, type ChatMode, type ChatModel, type ChatSettings, type ImageIn } from './api'
import { useCmdEnter } from './cmdEnter'
import { t } from './i18n'
import { Icon } from './icons'
import { qk } from './queries'
import { href } from './router'
import { useDismiss } from './useDismiss'
import { AgentChip, AgentChoices, agentSwitch, effortsOf, familyName, familyOf, fitEffort, isClaude, modelFamilies, modelName, pickFamily, useModels } from './AgentPick'

/**
 * 에이전트 입력란 (AgentChats.tsx의 대화 · 새 대화 · 패널이 함께 쓴다): / 명령 · @ 붙이기 · 그림,
 * 아래 줄 ＋ · 맡기는 정도 ▾ · 모델 · 생각 ▾ · 보내기. 맡기는 정도 · 모델 · 생각의 이름과 노트에서 「에이전트에게」로 붙이기도 여기에 둔다
 */

/** 입력란을 바깥에서 채울 때 (기다리는 지시 고치기). n이 바뀌면 채운다 */
export type Fill = { text: string; n: number; attach?: Attach[]; images?: ImageIn[] }

// ---------- 권한 · 모델 · 생각 깊이 ----------

/** 권한(예전 이름 맡기는 정도): 읽기 전용(write read) 또는 고치는 대화의 모드 셋 */
export type Trust = 'read' | ChatMode
/** ⇧⇥ 차례: Claude Code처럼 묻고 하기 → 편집 자동 허용 → 계획 모드, 그다음 읽기 전용 (10/22 사용자 결정 "Claude Code 방식") */
const TRUSTS: Trust[] = ['ask', 'edit', 'plan', 'read']
export const TRUST_NAME: Record<Trust, string> = { read: t('읽기 전용', 'Read only'), ask: t('묻고 하기', 'Ask before edits'), plan: t('계획 모드', 'Plan mode'), edit: t('편집 자동 허용', 'Accept edits') }
/** 앱 고치기 대화의 맡기는 정도 설명 (작업 폴더에서 고치고 시험, 올리기는 앱) */
export const APP_HINT: Record<Trust, string> = {
  read: t('읽기만 합니다', 'Reads only'),
  ask: t('파일을 고치거나 명령을 돌리거나 PR을 올릴 때마다 묻습니다', 'Asks before each file edit, command and before opening the PR'),
  plan: t('계획을 승인한 뒤 파일을 고치고 시험한 뒤 PR을 올립니다', 'Edits, tests and opens the PR after you approve the plan'),
  edit: t('작업 폴더에서 바로 고치고 시험한 뒤 PR을 올립니다', 'Edits and tests in its work folder, then opens the PR'),
}

const TRUST_HINT: Record<Trust, string> = {
  read: t('읽고 답만 합니다. 명령은 묻고 돌립니다', 'Reads and answers only. Commands ask first'),
  ask: t('노트 수정과 명령을 하나씩 묻습니다', 'Asks before each note edit and command'),
  plan: t('먼저 계획을 보이고, 승인할 때 이어 갈 방법을 고릅니다', 'Shows a plan first; you choose how to continue when you approve it'),
  edit: t('범위 안 노트를 바로 고칩니다. 명령 · 웹 · 범위 밖은 묻거나 막습니다', 'Edits notes in scope right away. Commands, web and out-of-scope work ask or are blocked'),
}
export const trustOf = (c: { write: string; mode: ChatMode }): Trust => (c.write === 'read' ? 'read' : c.mode)
export const settingsOf = (v: Trust): ChatSettings => (v === 'read' ? { write: 'read' } : { write: 'notes', mode: v })
/** ⇧⇥: 다음 맡기는 정도 */
export const nextTrust = (v: Trust, claude = true): Trust => { const n = TRUSTS[(TRUSTS.indexOf(v) + 1) % TRUSTS.length]!; return n === 'plan' && !claude ? nextTrust(n) : n }
export const EFFORT_NAME: Record<ChatEffort, string> = { low: t('생각 얕게', 'Think less'), medium: t('생각 보통', 'Think normally'), high: t('생각 깊게', 'Think more'), xhigh: t('생각 더 깊게', 'Think much more'), max: t('생각 가장 깊게', 'Think hardest') }
/** 입력란 아래 줄의 짧은 이름 (좁은 패널에서도 한 줄) */
/** Codex 모델 id 뒤의 깊이 이름 (모르는 깊이는 그대로) */
export const effortLabel = (suffix: string) => Object.entries(EFFORT_NAME).find(([k]) => k === suffix)?.[1] ?? (suffix ? t(`생각 ${suffix}`, `Think ${suffix}`) : t('생각 기본', 'Default thinking'))
/** 하나씩 바꿔 권한 이름의 기본값과 다를 때의 이름 */
export const CUSTOM_NAME = t('직접 정함', 'Custom')

/** custom = 권한 표의 토글을 하나씩 바꿔 이름이 「직접 정함」, auto = 새 대화에 걸 자동 허용 (설정 › 에이전트에서 바꾼 때만, 11/9) */
export interface Settings { trust: Trust; model: ChatModel; effort: ChatEffort; custom?: boolean; agent: string; auto?: { read: boolean; run: boolean; web: boolean } }

// ---------- / 명령 ----------

const COMMANDS: { cmd: string; label: string; text: string }[] = [
  { cmd: t('/계산', '/run'), label: t('노트의 계산을 다시 돌리고 확인 절과 맞추기', 'Rerun the note\'s computation and match its checks'), text: t('이 노트의 계산을 다시 돌리고 결과를 확인(Checks) 절과 맞춰 줘. 다르면 고치고 무엇이 달랐는지 알려 줘.', 'Rerun the computation in this note and match the result with its Checks section. If it differs, fix it and tell me what changed.') },
  { cmd: t('/검토', '/review'), label: t('노트의 수식 · 논리 단계 검토', 'Review the note\'s equations and steps'), text: t('이 노트의 수식과 논리 단계를 검토해 줘. 틀리거나 빠진 단계는 그 자리에 기록(질문)으로 남기고, 노트는 고치지 마.', 'Review the equations and logical steps in this note. Leave a record (question) where a step is wrong or missing; do not change the note.') },
  { cmd: t('/기록', '/records'), label: t('답할 차례인 기록에 답하기', 'Answer the records waiting for an agent'), text: t('이 프로젝트에서 에이전트가 답할 차례인 기록에 답해 줘.', 'Answer the records in this project that wait for an agent.') },
  { cmd: t('/문헌', '/papers'), label: t('근거 문헌을 찾아 노트에 잇기', 'Find supporting papers and link them'), text: t('이 노트의 주장마다 근거가 되는 문헌을 라이브러리에서 찾아 이어 줘. 없으면 무엇이 없는지 알려 줘.', 'For each claim in this note, find a supporting paper in the library and link it. Tell me where none exists.') },
  { cmd: t('/흐름', '/flow'), label: t('한 일을 흐름 점으로 정리', 'Turn the work into flow dots'), text: t('이번에 한 일을 흐름 점으로 정리해 줘 (한 일 하나에 점 하나).', 'Add the work done here to the flow (one dot per piece of work).') },
  { cmd: t('/요약', '/summary'), label: t('오늘 이 프로젝트에서 한 일', 'What happened in this project today'), text: t('오늘 이 프로젝트에서 한 일을 짧게 요약해 줘.', 'Summarize briefly what happened in this project today.') },
  // Claude Code 명령: 그대로 보낸다 (에이전트가 아니라 Claude Code가 처리)
  { cmd: t('/곁', '/btw'), label: t('하던 일을 멈추지 않고 짧게 묻기 (작은 모델이 대화 요약만 보고 답함)', 'Ask a quick side question without interrupting (a small model answers from a summary)'), text: t('/곁 ', '/btw ') },
  { cmd: '/compact', label: t('앞 내용을 요약해 맥락 줄이기', 'Summarize earlier messages to shrink the context'), text: '/compact' },
  { cmd: '/context', label: t('맥락이 무엇에 얼마나 쓰였는지 보기', 'Show what fills the context'), text: '/context' },
]

/** 곁 질문이면 묻는 글 (/곁 · /btw 뒤), 아니면 없음 */
export function sideQuestion(text: string): string | undefined {
  const m = /^\/(곁|btw)\s+([\s\S]+)$/.exec(text.trim())
  return m?.[2]!.trim() || undefined
}

export const ATTACH_NAME: Record<AttachKind, string> = { note: t('노트', 'Note'), topic: t('주제', 'Topic'), file: t('파일', 'File'), selection: t('고른 글', 'Selection'), paper: t('문헌', 'Paper'), record: t('기록', 'Record'), connector: t('커넥터', 'Connector') }

// ---------- 노트에서 「에이전트에게」 (고른 글 메뉴) ----------

/** 상단바 패널을 열라는 알림 (App.tsx가 듣는다) */
export const AGENT_OPEN = 'rw-agent-open'
const inbox = new Map<string, Attach[]>()
let inboxTick = 0
const inboxListeners = new Set<() => void>()
/** 고른 글 · 노트를 지금 프로젝트의 에이전트 입력란에 붙이고 패널을 연다 */
export function sendToAgent(rid: string, a: Attach) {
  inbox.set(rid, [...(inbox.get(rid) ?? []), a])
  inboxTick++
  inboxListeners.forEach((f) => f())
  window.dispatchEvent(new CustomEvent(AGENT_OPEN))
}
function useInbox(rid: string, take: (a: Attach[]) => void) {
  const tick = useSyncExternalStore((f) => { inboxListeners.add(f); return () => { inboxListeners.delete(f) } }, () => inboxTick)
  const ref = useRef(take)
  ref.current = take
  useEffect(() => {
    const got = inbox.get(rid)
    if (got?.length) { inbox.delete(rid); ref.current(got) }
  }, [rid, tick])
}

// ---------- 입력란 ----------

type Menu = { kind: '/' | '@'; start: number; query: string }
type MenuPick = { key: string; label: string; meta?: string; run(): void }

/** 커서 앞의 / 명령(맨 앞에서만) · @ 붙이기 낱말 */
export function menuAt(text: string, caret: number): Menu | null {
  const before = text.slice(0, caret)
  const m = /(^|\s)([/@])([^\s/@]*)$/.exec(before)
  if (!m) return null
  const start = before.length - m[3]!.length - 1
  if (m[2] === '/' && before.slice(0, start).trim()) return null
  return { kind: m[2] as '/' | '@', start, query: m[3]! }
}

const MAX_IMAGE = 5 * 1024 * 1024
function readImage(f: File): Promise<ImageIn & { name: string }> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve({ type: f.type as ImageIn['type'], data: String(r.result).split(',')[1] ?? '', name: f.name || t('붙여 넣은 그림', 'Pasted image') })
    r.onerror = () => reject(r.error)
    r.readAsDataURL(f)
  })
}

type Box = { top: number; bottom: number; left: number; right: number }
/**
 * 메뉴 자리: 바라는 쪽(위, down이면 아래)에 안 들어가고 반대쪽이 더 넓으면 뒤집고, 들어갈 높이를 넘으면 그 높이까지(스크롤).
 * 가로는 단추 왼쪽(down이면 오른쪽)에 맞추되 보이는 칸(box) 안으로 민다. x = 단추 왼쪽에서 메뉴 왼쪽까지
 */
export function fitMenu(menu: { width: number; height: number }, btn: Box, box: Box, down = false, gap = 4): { down: boolean; x: number; max?: number } {
  const above = btn.top - box.top - gap
  const below = box.bottom - btn.bottom - gap
  const flip = down ? menu.height > below && above > below : menu.height > above && below > above
  const d = down !== flip
  const room = Math.floor(d ? below : above)
  const want = down ? btn.right - menu.width : btn.left
  const left = Math.max(box.left + gap, Math.min(want, box.right - gap - menu.width))
  return { down: d, x: left - btn.left, ...(menu.height > room && { max: Math.max(room, 0) }) }
}

/** 메뉴가 보이는 칸: 창과, 넘친 것을 자르는 조상(패널 등)이 겹치는 곳 */
function visibleBox(el: Element): Box {
  const b: Box = { top: 0, left: 0, bottom: window.innerHeight, right: window.innerWidth }
  for (let p = el.parentElement; p; p = p.parentElement) {
    const s = getComputedStyle(p)
    if (s.overflowX === 'visible' && s.overflowY === 'visible') continue
    const r = p.getBoundingClientRect()
    b.top = Math.max(b.top, r.top); b.left = Math.max(b.left, r.left); b.bottom = Math.min(b.bottom, r.bottom); b.right = Math.min(b.right, r.right)
  }
  return b
}

/** 입력란 아래 줄의 작은 메뉴 버튼 (＋ · 맡기는 정도 · 모델과 생각). 메뉴는 패널 · 창 끝에서 잘리지 않게 뒤집거나 민다 (fitMenu) */
export function PopButton({ label, ui, tip, children, wide, down, icon, pill }: { label: ReactNode; ui: string; tip: string; children(close: () => void): ReactNode; wide?: boolean; down?: boolean; icon?: boolean; pill?: boolean }) {
  const [open, setOpen] = useState(false)
  const [place, setPlace] = useState<ReturnType<typeof fitMenu> | null>(null)
  const box = useRef<HTMLSpanElement>(null)
  const pop = useRef<HTMLDivElement>(null)
  useDismiss(open, box, () => setOpen(false))
  useLayoutEffect(() => {
    if (!open) { setPlace(null); return }
    const btn = box.current?.firstElementChild
    const m = pop.current
    if (btn && m) setPlace(fitMenu({ width: m.offsetWidth, height: m.scrollHeight }, btn.getBoundingClientRect(), visibleBox(m), down))
  }, [open, down])
  const d = place ? place.down : down
  return (
    <span className="ac-pop" ref={box}>
      <button className={`${icon ? 'icon-btn sm' : 'ac-pop-btn'}${pill ? ' pill' : ''}${open ? ' on' : ''}`} data-ui={ui} data-tip={open ? undefined : tip} aria-label={icon ? tip : undefined} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>{label}</button>
      {open && <div ref={pop} className={`menu ac-pop-menu${wide ? ' wide' : ''}${d ? ' down' : ''}`} role="menu" data-ui={`${ui} 항목`}
        style={place ? { left: place.x, right: 'auto', ...(place.max !== undefined && { maxHeight: place.max, overflowY: 'auto' }) } : { visibility: 'hidden' }}>{children(() => setOpen(false))}</div>}
    </span>
  )
}

/**
 * 에이전트 입력란: 붙인 것(지금 보는 노트는 저절로) · 글 칸(/ 명령 · @ 붙이기 · 그림 붙여넣기),
 * 아래 줄 ＋ · 맡기는 정도 ▾ · 모델 · 생각 ▾ · 보내기(도는 중이고 글이 없으면 멈추기). ⇧⇥로 맡기는 정도를 바꾼다.
 * 대화 중에 바꾼 설정은 다음 차례부터 (onSettings)
 */
export function Composer({ rid, auto, settings, onSettings, onSubmit, onStop, placeholder, fail: outerFail, fill, autoFocus, agentFixed, lead }: {
  rid: string
  /** 아래 줄 ＋ 다음에 둘 것 (새 대화의 프로젝트 고르기) */
  lead?: ReactNode
  auto?: Attach
  settings: Settings
  onSettings(s: Partial<Settings>): void
  onSubmit(m: ChatMessageBody): Promise<boolean>
  /** 도는 중이면 멈추기 (글이 비었을 때 보내기 자리) */
  onStop?(): void
  placeholder: string
  fail?: string | null
  /** 바깥에서 글 칸을 채울 때 (기다리는 지시 고치기). n이 바뀌면 채운다 */
  fill?: Fill
  autoFocus?: boolean
  /** 이미 시작한 대화: 에이전트를 바꾸지 못한다 */
  agentFixed?: boolean
}) {
  const [text, setText] = useState('')
  const [caret, setCaret] = useState(0)
  const [attach, setAttach] = useState<Attach[]>([])
  const [images, setImages] = useState<(ImageIn & { name: string })[]>([])
  const [autoOff, setAutoOff] = useState(false)
  const [fail, setFail] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [hi, setHi] = useState(0)
  const [closed, setClosed] = useState<number | null>(null)
  const box = useRef<HTMLTextAreaElement>(null)
  const file = useRef<HTMLInputElement>(null)
  useInbox(rid, (got) => { setAttach((a) => [...a, ...got]); box.current?.focus() })
  const autoKey = auto ? `${auto.kind}:${auto.ref}` : ''
  useEffect(() => setAutoOff(false), [autoKey])
  useEffect(() => {
    if (!fill) return
    setText(fill.text); setCaret(fill.text.length)
    // 기다리던 지시를 고칠 때 붙인 것 · 그림도 함께 돌아온다
    if (fill.attach?.length) setAttach((a) => [...a, ...fill.attach!])
    if (fill.images?.length) setImages((xs) => [...xs, ...fill.images!.map((im, i) => ({ ...im, name: t(`그림 ${i + 1}`, `Image ${i + 1}`) }))].slice(0, 4))
    box.current?.focus()
  }, [fill?.n]) // eslint-disable-line react-hooks/exhaustive-deps

  const menu = (() => { const m = menuAt(text, caret); return m && m.start !== closed ? m : null })()
  // 앱 고치기 대화는 연구 프로젝트가 아니라 @로 붙일 노트 · 주제가 없다
  const research = rid !== APP_RID
  const notes = useQuery({ queryKey: qk.notes(rid), queryFn: () => notesApi(rid).list(), enabled: research && menu?.kind === '@' }).data
  const topics = useQuery({ queryKey: qk.topics(rid), queryFn: () => api.research(rid).topics(), enabled: research && menu?.kind === '@' }).data
  // 맥의 Claude Code 스킬 · 커넥터 (10/21 22:40): / 메뉴 · @ 메뉴에 함께 보인다
  const extras = useQuery({ queryKey: qk.agentExtras, queryFn: () => agentChatsApi.extras(), enabled: !!menu, staleTime: 60_000 }).data
  const tree = useQuery({ queryKey: qk.repoTree(rid), queryFn: () => api.research(rid).repoTree(), enabled: research && menu?.kind === '@' && (menu.query.length >= 2) }).data

  const focusAt = (at: number) => requestAnimationFrame(() => { box.current?.focus(); box.current?.setSelectionRange(at, at) })
  const replaceToken = (insert: string) => {
    if (!menu) return
    const v = text.slice(0, menu.start) + insert + text.slice(caret)
    setText(v)
    const at = menu.start + insert.length
    setCaret(at)
    focusAt(at)
  }
  const addAttach = (a: Attach) => { setAttach((xs) => (xs.some((x) => x.kind === a.kind && x.ref === a.ref && !x.text) ? xs : [...xs, a])); replaceToken('') }

  const picks: MenuPick[] = (() => {
    if (!menu) return []
    const q = menu.query.toLowerCase()
    if (menu.kind === '/') {
      const fill = (v: string) => { setText(v); setCaret(v.length); requestAnimationFrame(() => box.current?.focus()) }
      const cmds = COMMANDS.filter((c) => c.cmd.slice(1).toLowerCase().startsWith(q) || c.label.toLowerCase().includes(q))
        .map((c) => ({ key: c.cmd, label: c.cmd, meta: c.label, run: () => fill(c.text) }))
      // 스킬: 고르면 그 스킬을 쓰라는 글로 시작한다 (에이전트가 Skill 도구로 읽는다)
      const skills = (extras?.skills ?? []).filter((s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q))
        .map((s) => ({ key: `s:${s.name}`, label: s.name, meta: `${t('스킬', 'Skill')}${s.description ? ` · ${s.description}` : ''}`, run: () => fill(t(`「${s.name}」 스킬로 `, `Using the ${s.name} skill, `)) }))
      return [...cmds, ...skills].slice(0, 12)
    }
    const has = (s: string) => s.toLowerCase().includes(q)
    const out: MenuPick[] = []
    // 커넥터는 몇 개뿐이라 앞에 둔다 (노트가 많아도 묻히지 않게)
    for (const c of extras?.connectors ?? []) if (has(c.name)) out.push({ key: `c:${c.name}`, label: c.name, meta: ATTACH_NAME.connector, run: () => addAttach({ kind: 'connector', ref: c.name, label: c.name }) })
    for (const n of notes ?? []) if (has(n.title) || has(n.file)) out.push({ key: `n:${n.file}`, label: n.title, meta: ATTACH_NAME.note, run: () => addAttach({ kind: 'note', ref: n.file, label: n.title }) })
    for (const x of topics ?? []) if (has(x.title) || has(x.id)) out.push({ key: `t:${x.id}`, label: x.title, meta: ATTACH_NAME.topic, run: () => addAttach({ kind: 'topic', ref: x.id, label: x.title }) })
    if (q.length >= 2) for (const f of tree?.files ?? []) if (has(f.path)) out.push({ key: `f:${f.path}`, label: f.path, meta: ATTACH_NAME.file, run: () => addAttach({ kind: 'file', ref: f.path, label: f.path.split('/').pop() ?? f.path }) })
    return out.slice(0, 8)
  })()
  useEffect(() => setHi(0), [menu?.kind, menu?.query])

  const addImages = async (files: File[]) => {
    const ok = files.filter((f) => /^image\/(png|jpeg|gif|webp)$/.test(f.type))
    if (!ok.length) return false
    if (ok.some((f) => f.size > MAX_IMAGE)) { setFail(t('그림은 한 장에 5MB까지입니다', 'Images can be up to 5 MB each')); return true }
    const read = await Promise.all(ok.map(readImage))
    setImages((xs) => [...xs, ...read].slice(0, 4))
    return true
  }
  const onPaste = (e: ClipboardEvent) => {
    const files = [...e.clipboardData.files]
    if (files.some((f) => f.type.startsWith('image/'))) { e.preventDefault(); void addImages(files) }
  }
  const onDrop = (e: DragEvent) => {
    const files = [...e.dataTransfer.files]
    if (!files.length) return
    e.preventDefault()
    // 그림이 아닌 파일은 조용히 사라지지 않게 알린다
    void addImages(files).then((ok) => { if (!ok) setFail(research ? t('그림만 끌어 놓을 수 있습니다. 노트 · 파일은 @로 붙이세요', 'Only images can be dropped. Attach notes and files with @') : t('그림만 끌어 놓을 수 있습니다', 'Only images can be dropped')) })
  }

  const all = [...(auto && !autoOff ? [auto] : []), ...attach]
  const submit = async () => {
    const v = text.trim()
    if (!v || busy) return
    setBusy(true); setFail(null)
    try {
      const ok = await onSubmit({ text: v, ...(all.length && { attach: all }), ...(images.length && { images: images.map(({ type, data }) => ({ type, data })) }) })
      if (ok) { setText(''); setCaret(0); setAttach([]); setImages([]) }
    } catch (e) { setFail((e as Error).message) } finally { setBusy(false) }
  }
  const sendKey = useCmdEnter(() => void submit())
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) { if (!menu) sendKey.onKeyDown(e); return }
    if (menu && picks.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setHi((hi + 1) % picks.length); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setHi((hi - 1 + picks.length) % picks.length); return }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); picks[hi]?.run(); return }
    }
    if (menu && e.key === 'Escape') { e.preventDefault(); setClosed(menu.start); return }
    if (e.key === 'Tab' && e.shiftKey) { e.preventDefault(); onSettings({ trust: nextTrust(settings.trust, isClaude(settings.agent)) }); return }
    if (e.key === 'Escape' && onStop && !text) { e.preventDefault(); onStop(); return }
    sendKey.onKeyDown(e)
  }
  const startToken = (ch: '@' | '/') => {
    if (ch === '/') { setText('/'); setCaret(1); setClosed(null); focusAt(1); return }
    const at = box.current?.selectionStart ?? text.length
    const pre = text.slice(0, at)
    const insert = `${pre && !/\s$/.test(pre) ? ' ' : ''}@`
    setText(pre + insert + text.slice(at)); setClosed(null)
    setCaret(at + insert.length)
    focusAt(at + insert.length)
  }
  const stopping = !!onStop && !text.trim()
  const shownFail = fail ?? outerFail
  const models = useModels(settings.agent)
  const efforts = effortsOf(settings.model, models)
  const fam = familyOf(settings.model, models)
  // 생각 깊이 고르기: Claude는 effort 칸, Codex는 모델 id 뒤의 깊이(gpt-…/high). 기본 모델이면 실제로 도는 모델의 깊이를 고르면 그 모델로 바뀐다
  const variants = (fam.family?.variants.length ? fam.family : fam.real)?.variants ?? []
  const thinking: { key: string; name: string; on: boolean; pick: Partial<Settings> }[] = variants.length > 1
    ? variants.map((v) => ({ key: v.value, name: effortLabel(v.suffix), on: settings.model !== 'default' && v.value === settings.model, pick: { model: v.value } }))
    : efforts.map((m) => ({ key: m, name: EFFORT_NAME[m], on: settings.effort === m, pick: { effort: m } }))
  const thinkingNow = variants.length > 1 ? (settings.model === 'default' ? t(`${effortLabel(fam.suffix)} (기본)`, `${effortLabel(fam.suffix)} (default)`) : effortLabel(fam.suffix)) : EFFORT_NAME[settings.effort]

  return (
    <div className="ac-composer" data-ui="에이전트 입력란" onDrop={onDrop} onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) e.preventDefault() }}>
      {(all.length > 0 || images.length > 0) && (
        <div className="ac-chips">
          {auto && !autoOff && <span className="tag ac-chip" title={auto.ref}>{ATTACH_NAME[auto.kind]} · {auto.label}<button className="ac-chip-x" aria-label={t('제거', 'Remove')} onClick={() => setAutoOff(true)}>{Icon.x}</button></span>}
          {attach.map((a, i) => <span key={i} className="tag ac-chip" title={a.text ?? a.ref}>{ATTACH_NAME[a.kind]} · {a.label}<button className="ac-chip-x" aria-label={t('제거', 'Remove')} onClick={() => setAttach((xs) => xs.filter((_, j) => j !== i))}>{Icon.x}</button></span>)}
          {images.map((im, i) => <span key={`i${i}`} className="tag ac-chip" title={im.name}>{t('그림', 'Image')} · {im.name}<button className="ac-chip-x" aria-label={t('제거', 'Remove')} onClick={() => setImages((xs) => xs.filter((_, j) => j !== i))}>{Icon.x}</button></span>)}
        </div>
      )}
      <div className="ac-input">
        <textarea ref={box} rows={2} value={text} placeholder={placeholder} aria-label={placeholder} autoFocus={autoFocus}
          onChange={(e) => { setText(e.target.value); setCaret(e.target.selectionStart); setClosed(null) }}
          onSelect={(e) => setCaret(e.currentTarget.selectionStart)} onKeyDown={onKey} onCompositionEnd={sendKey.onCompositionEnd} onPaste={onPaste} />
        {menu && (
          <div className={`ac-menu${(box.current?.getBoundingClientRect().top ?? 999) < 320 ? ' down' : ''}`} role="listbox" data-ui={menu.kind === '/' ? '명령 메뉴' : '붙이기 메뉴'}>
            {picks.length
              ? picks.map((p, i) => (
                <button key={p.key} role="option" aria-selected={i === hi} className={`ac-menu-item${i === hi ? ' on' : ''}`} onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setHi(i)} onClick={() => p.run()}>
                  <span className={menu.kind === '/' ? 'mono ac-menu-cmd' : 'ac-menu-label'}>{p.label}</span>
                  {p.meta && <span className="muted ac-menu-meta">{p.meta}</span>}
                </button>
              ))
              : <div className="muted ac-menu-none">{menu.kind === '@' ? (menu.query ? t('맞는 것이 없습니다', 'Nothing matches') : t('노트 · 주제 · 커넥터 이름을 쓰세요 (파일은 두 글자부터)', 'Type a note, topic or connector name (files from two letters)')) : t('맞는 명령이 없습니다', 'No matching command')}</div>}
          </div>
        )}
      </div>
      {shownFail && <span className="error-text ac-hint">{shownFail}</span>}
      <div className="ac-compose-row">
        <PopButton ui="붙이기 버튼" tip={t('붙이기 · 명령 · 그림', 'Attach · commands · images')} label={<span className="ac-pop-ico">{Icon.plus}</span>}>
          {(close) => <>
            <button role="menuitem" onClick={() => { close(); startToken('@') }}>{t('노트 · 주제 · 파일 · 커넥터 붙이기', 'Attach a note, topic, file or connector')}<span className="muted mono ac-key">@</span></button>
            <button role="menuitem" onClick={() => { close(); startToken('/') }}>{t('명령 · 스킬', 'Commands and skills')}<span className="muted mono ac-key">/</span></button>
            <button role="menuitem" onClick={() => { close(); file.current?.click() }}>{t('그림 고르기', 'Choose images')}<span className="muted ac-key">{t('붙여넣기도', 'or paste')}</span></button>
          </>}
        </PopButton>
        {lead}
        <input ref={file} type="file" accept="image/png,image/jpeg,image/gif,image/webp" multiple hidden onChange={(e) => { void addImages([...(e.target.files ?? [])]); e.target.value = '' }} />
        <PopButton ui="맡기는 정도" tip={t('권한 (⇧⇥)', 'Permissions (⇧⇥)')} wide label={<>{settings.custom ? CUSTOM_NAME : TRUST_NAME[settings.trust]} ▾</>}>
          {(close) => TRUSTS.filter((v) => v !== 'plan' || isClaude(settings.agent)).map((v) => (
            <button key={v} role="menuitemradio" aria-checked={settings.trust === v} className={`ac-pop-item${settings.trust === v ? ' on' : ''}`} onClick={() => { close(); onSettings({ trust: v }) }}>
              <span className="ac-pop-check" aria-hidden>{settings.trust === v ? Icon.check : null}</span>
              <span className="ac-pop-what"><span>{TRUST_NAME[v]}</span><span className="muted">{(rid === APP_RID ? APP_HINT : TRUST_HINT)[v]}</span></span>
            </button>
          ))}
        </PopButton>
        {/* 권한 설명은 늘 보이는 줄 대신 ? 툴팁 (10/31 시안 6절). 누르면 소개의 그 절 */}
        <a className="icon-btn sm ac-help" href={href({ page: 'about', part: 'agents', anchor: 'conversations' })} data-ui="권한 설명" aria-label={t('권한 설명', 'About permissions')}
          data-tip={settings.custom ? t('직접 정한 권한입니다. 세부 패널 「이 대화의 권한」에서 봅니다', 'Custom permissions; see "Permissions here" in the detail pane') : (rid === APP_RID ? APP_HINT : TRUST_HINT)[settings.trust]}>{Icon.help}</a>
        {/* 모델과 생각 깊이는 따로 (11/9 11:07): 왼쪽에서 모델을 고르고, 그 모델이 받는 깊이를 오른쪽에서 */}
        <PopButton ui="모델 고르기" tip={t('에이전트 · 모델', 'Agent · model')} label={<>{!isClaude(settings.agent) && <><AgentChip agent={settings.agent} /> </>}{familyName(settings.model, models)} ▾</>}>
          {(close) => <>
            <AgentChoices agent={settings.agent} fixed={agentFixed} onPick={(a) => { close(); if (a !== settings.agent) onSettings(agentSwitch(a, settings.trust)) }} />
            <div className="ac-pop-h">{t('모델', 'Model')}</div>
            {modelFamilies(models).map((f) => {
              const on = (fam.family?.base ?? '') === f.base
              const value = pickFamily(f, fam.suffix)
              return <button key={f.base} role="menuitemradio" aria-checked={on} className={on ? 'on' : ''} onClick={() => { close(); onSettings({ model: value, ...fitEffort(settings.effort, effortsOf(value, models)) }) }}><span className="ac-pop-check" aria-hidden>{on ? Icon.check : null}</span>{f.base === 'default' ? modelName('default', models).replace(/ \(.*\)$/, '') : f.name}</button>
            })}
          </>}
        </PopButton>
        {thinking.length > 0 && (
          <PopButton ui="생각 고르기" tip={t('생각 깊이', 'Thinking')} label={<>{thinkingNow} ▾</>}>
            {(close) => thinking.map((o) => <button key={o.key} role="menuitemradio" aria-checked={o.on} className={o.on ? 'on' : ''} onClick={() => { close(); onSettings(o.pick) }}><span className="ac-pop-check" aria-hidden>{o.on ? Icon.check : null}</span>{o.name}</button>)}
          </PopButton>
        )}
        <span className="sp" />
        {stopping
          ? <button className="ac-send stop" data-ui="대화 멈추기" data-tip={t('멈추기 (Esc)', 'Stop (Esc)')} aria-label={t('멈추기', 'Stop')} onClick={onStop}><span className="ac-stop-sq" aria-hidden /></button>
          : <button className="ac-send" data-ui="지시 보내기" data-tip={t('보내기 (⌘↵)', 'Send (⌘↵)')} aria-label={t('보내기', 'Send')} disabled={busy || !text.trim()} onClick={() => void submit()}>{Icon.up}</button>}
      </div>
    </div>
  )
}
