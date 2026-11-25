import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ClipboardEvent, type DragEvent, type KeyboardEvent, type ReactNode } from 'react'
import { visibleBox, type Box } from './tipPlace'
import { useQuery } from '@tanstack/react-query'
import { agentChatsApi, api, APP_RID, CENTRAL_RID, notesApi, type Attach, type AttachKind, type ChatEffort, type ChatMessageBody, type ChatMode, type ChatModel, type ChatSettings, type ImageIn } from './api'
import { useCmdEnter } from './cmdEnter'
import { onListKey } from './listInput'
import { t } from './i18n'
import { Icon } from './icons'
import { qk } from './queries'
import { href } from './router'
import { useDismiss } from './useDismiss'
import { ElementPicker, type Picked } from './elementPicker'
import { captureScreen, cropShot } from './screenCapture'
import { placeOf, screenLine } from './screenView'
import { lastRecordSelection } from './RecordContext'
import { uiShown } from './uiNames'
import { accountLabel, useAgentAccounts } from './ClaudeAccountsSettings'
import type { ComposerRoom } from './CentralRoom'
import { AgentLogo } from './agentLogos'
import { AgentChoices, agentOf, agentSwitch, effortsOf, familyName, familyOf, fitEffort, isClaude, modelFamilies, modelName, pickFamily, useModels } from './AgentPick'
import { draftMap } from './unsent'

/**
 * 에이전트 입력란 (AgentChats.tsx의 대화 · 새 대화 · 패널이 함께 쓴다): / 명령 · @ 붙이기 · 그림,
 * 아래 줄 ＋ · 맡기는 정도 ▾ · 모델 · 생각 ▾ · 보내기. 맡기는 정도 · 모델 · 생각의 이름과 노트에서 「에이전트에게」로 붙이기도 여기에 둔다
 */

/** 입력란을 바깥에서 채울 때 (기다리는 지시 고치기). n이 바뀌면 채운다 */
/** 바깥에서 입력란을 채울 것. text가 없으면 쓰던 글은 두고 붙일 것만 더한다 (대화에서 고른 글 「답글」) */
export type Fill = { text?: string; n: number; attach?: Attach[]; images?: ImageIn[] }

// ---------- 권한 · 모델 · 생각 깊이 ----------

/** 권한(예전 이름 맡기는 정도): 읽기 전용(write read) 또는 고치는 대화의 모드 셋 */
export type Trust = 'read' | ChatMode
/** ⇧⇥ 차례: Claude Code처럼 묻고 하기 → 편집 자동 허용 → 자동 → 계획 모드, 그다음 읽기 전용 (10/22 사용자 결정 "Claude Code 방식", 자동은 11/23) */
const TRUSTS: Trust[] = ['ask', 'edit', 'auto', 'plan', 'read']
export const TRUST_NAME: Record<Trust, string> = { read: t('읽기 전용', 'Read only'), ask: t('묻고 하기', 'Ask before edits'), plan: t('계획 모드', 'Plan mode'), edit: t('편집 자동 허용', 'Accept edits'), auto: t('자동', 'Auto') }
/** 앱 고치기 대화의 맡기는 정도 설명 (작업 폴더에서 고치고 시험, 올리기는 앱) */
export const APP_HINT: Record<Trust, string> = {
  read: t('읽기만 합니다', 'Reads only'),
  ask: t('파일을 고치거나 명령을 돌리거나 PR을 올릴 때마다 묻습니다', 'Asks before each file edit, command and before opening the PR'),
  plan: t('계획을 승인한 뒤 파일을 고치고 시험한 뒤 PR을 올립니다', 'Edits, tests and opens the PR after you approve the plan'),
  edit: t('작업 폴더에서 바로 고치고 시험한 뒤 PR을 올립니다', 'Edits and tests in its work folder, then opens the PR'),
  auto: t('읽기 · 작업 폴더의 명령 · 웹을 묻지 않고 고친 뒤 PR까지 올립니다. 지우기 · 밖으로 보내기 · 합치기 · 앱 다시 시작 · 돈 · 계정 · 비밀이 든 곳만 묻습니다', 'Reads, runs commands in its work folder and uses the web without asking, then opens the PR. Asks only for deleting, sending outside, merging, restarting the app, money, accounts and places that hold secrets'),
}

const TRUST_HINT: Record<Trust, string> = {
  read: t('읽고 답만 합니다. 명령은 묻고 돌립니다', 'Reads and answers only. Commands ask first'),
  ask: t('노트 수정과 명령을 하나씩 묻습니다', 'Asks before each note edit and command'),
  plan: t('먼저 계획을 보이고, 승인할 때 이어 갈 방법을 고릅니다', 'Shows a plan first; you choose how to continue when you approve it'),
  edit: t('범위 안 노트를 바로 고칩니다. 명령 · 웹 · 범위 밖은 묻거나 막습니다', 'Edits notes in scope right away. Commands, web and out-of-scope work ask or are blocked'),
  auto: t('어디든 읽고, 폴더 안 명령 · 웹은 묻지 않습니다. 지우기 · 밖으로 보내기 · 돈 · 계정 · 비밀이 든 곳만 묻습니다', 'Reads anywhere; commands in its folder and the web run without asking. Asks only for deleting, sending outside, money, accounts and places that hold secrets'),
}
/** 중앙 대화 (11/20): 명령은 맡기는 정도와 상관없이 같은 판정 — 읽기 명령은 묻지 않고, 바꾸는 일은 하위 대화에 맡긴다 */
const CENTRAL_COMMANDS = t('읽기 명령은 묻지 않고 돌립니다. 바꾸는 일은 하위 대화에 맡깁니다', 'Read commands run without asking. Changes go to a sub-conversation')
const CENTRAL_HINT: Record<Trust, string> = { read: CENTRAL_COMMANDS, ask: CENTRAL_COMMANDS, plan: TRUST_HINT.plan, edit: CENTRAL_COMMANDS, auto: CENTRAL_COMMANDS }
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
/** 권한의 아이콘: 좁은 입력란에서는 이름 대신 이것만 보인다 (11/21 사용자 "아이콘을 두어 글을 생략", 한 줄로) */
const TRUST_ICON: Record<Trust, ReactNode> = { read: Icon.eye, ask: Icon.ask, plan: Icon.list, edit: Icon.pencil, auto: Icon.spark }
/** 생각 깊이: 막대 of개 가운데 level개가 진하다 (글 없이도 깊이가 보이게) */
function EffortGauge({ level, of }: { level: number; of: number }) {
  const w = 14 / of
  return <svg className="ac-gauge" viewBox="0 0 16 16" aria-hidden>{Array.from({ length: of }, (_, i) => { const h = 4 + (9 * (i + 1)) / of; return <rect key={i} className={i < level ? 'on' : ''} x={1 + i * w} y={14.5 - h} width={Math.max(1.4, w - 1.2)} height={h} rx="0.7" /> })}</svg>
}

/** custom = 권한 표의 토글을 하나씩 바꿔 이름이 「직접 정함」, auto = 새 대화에 걸 자동 허용 (설정 › 에이전트에서 바꾼 때만, 11/9) */
export interface Settings { trust: Trust; model: ChatModel; effort: ChatEffort; custom?: boolean; agent: string; auto?: { read: boolean; run: boolean; web: boolean }; /** Claude 계정 (11/16, 열린 대화만) */ account?: string }

// ---------- / 명령 ----------

/** send: 고르면 바로 보낸다 (뒤에 쓸 말이 없는 Claude Code 명령. 일하는 중이면 다음 차례로 줄 선다, 11/19 피드백 22:14) */
const COMMANDS: { cmd: string; label: string; text: string; send?: boolean }[] = [
  { cmd: t('/계산', '/run'), label: t('노트의 계산을 다시 돌리고 확인 절과 맞추기', 'Rerun the note\'s computation and match its checks'), text: t('이 노트의 계산을 다시 돌리고 결과를 확인(Checks) 절과 맞춰 줘. 다르면 고치고 무엇이 달랐는지 알려 줘.', 'Rerun the computation in this note and match the result with its Checks section. If it differs, fix it and tell me what changed.') },
  { cmd: t('/검토', '/review'), label: t('노트의 수식 · 논리 단계 검토', 'Review the note\'s equations and steps'), text: t('이 노트의 수식과 논리 단계를 검토해 줘. 틀리거나 빠진 단계는 그 자리에 기록(질문)으로 남기고, 노트는 고치지 마.', 'Review the equations and logical steps in this note. Leave a record (question) where a step is wrong or missing; do not change the note.') },
  { cmd: t('/기록', '/records'), label: t('답할 차례인 기록에 답하기', 'Answer the records waiting for an agent'), text: t('이 프로젝트에서 에이전트가 답할 차례인 기록에 답해 줘.', 'Answer the records in this project that wait for an agent.') },
  { cmd: t('/문헌', '/papers'), label: t('근거 문헌을 찾아 노트에 잇기', 'Find supporting papers and link them'), text: t('이 노트의 주장마다 근거가 되는 문헌을 라이브러리에서 찾아 이어 줘. 없으면 무엇이 없는지 알려 줘.', 'For each claim in this note, find a supporting paper in the library and link it. Tell me where none exists.') },
  { cmd: t('/흐름', '/flow'), label: t('진행 중인 흐름의 다음 시도 하기', 'Work on the next attempt of an open flow'), text: t('진행 중인 흐름의 이어받기 요약을 읽고, 다음 후보를 시작해서 해 본 뒤 보고해 줘. 진행 중인 흐름이 없으면 알려 줘.', 'Read the brief of the open flow, start the next candidate, do the work and report. Tell me if no flow is open.') },
  { cmd: t('/요약', '/summary'), label: t('오늘 이 프로젝트에서 한 일', 'What happened in this project today'), text: t('오늘 이 프로젝트에서 한 일을 짧게 요약해 줘.', 'Summarize briefly what happened in this project today.') },
  // Claude Code 명령: 그대로 보낸다 (에이전트가 아니라 Claude Code가 처리)
  { cmd: t('/곁', '/btw'), label: t('하던 일을 멈추지 않고 짧게 묻기 (작은 모델이 대화 요약만 보고 답함)', 'Ask a quick side question without interrupting (a small model answers from a summary)'), text: t('/곁 ', '/btw ') },
  { cmd: '/compact', label: t('앞 내용을 요약해 컨텍스트 줄이기', 'Summarize earlier messages to shrink the context'), text: '/compact', send: true },
  { cmd: '/context', label: t('컨텍스트가 무엇에 얼마나 쓰였는지 보기', 'Show what fills the context'), text: '/context', send: true },
]

/** 곁 질문이면 묻는 글 (/곁 · /btw 뒤), 아니면 없음 */
export function sideQuestion(text: string): string | undefined {
  const m = /^\/(곁|btw)\s+([\s\S]+)$/.exec(text.trim())
  return m?.[2]!.trim() || undefined
}

export const ATTACH_NAME: Record<AttachKind, string> = { note: t('노트', 'Note'), topic: t('주제', 'Topic'), file: t('파일', 'File'), selection: t('고른 글', 'Selection'), paper: t('문헌', 'Paper'), record: t('기록', 'Record'), connector: t('커넥터', 'Connector'), element: t('화면 요소', 'Screen element'), terminal: t('터미널', 'Terminal'), screen: t('지금 화면', 'Current screen') }

export { ChatQuoteMenu } from './ChatQuote'

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
// Finder에서 끌어 온 파일은 종류(type)가 비어 올 때가 있어 확장자로도 본다
const EXT_TYPE: Record<string, ImageIn['type']> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' }
const imageType = (f: { type: string; name: string }): ImageIn['type'] | undefined =>
  /^image\/(png|jpeg|gif|webp)$/.test(f.type) ? f.type as ImageIn['type'] : f.type ? undefined : EXT_TYPE[f.name.split('.').pop()?.toLowerCase() ?? '']
function readImage(f: File): Promise<ImageIn & { name: string }> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve({ type: imageType(f)!, data: String(r.result).split(',')[1] ?? '', name: f.name || t('붙여 넣은 그림', 'Pasted image') })
    r.onerror = () => reject(r.error)
    r.readAsDataURL(f)
  })
}

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
/** 보내지 않은 글: 다른 화면을 보고 와도 남게 입력란마다(대화 · 새 대화의 프로젝트) 하나, 보내면 지운다 (화면을 새로 열면 없어진다) */
const unsent = draftMap<string>()

export function Composer({ rid, auto, settings, onSettings, onSubmit, onStop, placeholder, fail: outerFail, fill, autoFocus, agentFixed, lead, room, noTrust, keep }: {
  rid: string
  /** 보내지 않은 글을 둘 이름 (없으면 두지 않는다) */
  keep?: string
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
  /** 중앙 방 (11/20): @ 메뉴 맨 위의 방 사람 · 모두, 입력란 아래 받는 이 */
  room?: ComposerRoom
  /** 맡기는 정도를 고르지 않는 입력란 (중앙 시작, 11/20): 권한 메뉴 · ? · ⇧⇥를 숨긴다 */
  noTrust?: boolean
}) {
  const [text, setText] = useState(() => (keep && unsent.get(keep)) || '')
  const [caret, setCaret] = useState(text.length)
  const kept = useRef(keep)
  useEffect(() => {
    // 같은 입력란이 다른 대화로 바뀌면 그 대화의 글로 바꾼다 (앞 대화의 글은 이미 두었다)
    if (kept.current !== keep) { kept.current = keep; const v = (keep && unsent.get(keep)) || ''; setText(v); setCaret(v.length); return }
    if (!keep) return
    if (text.trim()) unsent.set(keep, text); else unsent.delete(keep)
  }, [keep, text])
  const [attach, setAttach] = useState<Attach[]>([])
  const [images, setImages] = useState<(ImageIn & { name: string })[]>([])
  const [autoOff, setAutoOff] = useState(false)
  const [fail, setFail] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [hi, setHi] = useState(0)
  const [closed, setClosed] = useState<number | null>(null)
  const [picking, setPicking] = useState(false)
  const box = useRef<HTMLTextAreaElement>(null)
  const file = useRef<HTMLInputElement>(null)
  useInbox(rid, (got) => { setAttach((a) => [...a, ...got]); box.current?.focus() })
  const autoKey = auto ? `${auto.kind}:${auto.ref}` : ''
  useEffect(() => setAutoOff(false), [autoKey])
  useEffect(() => {
    if (!fill) return
    if (fill.text !== undefined) { setText(fill.text); setCaret(fill.text.length) }
    // 기다리던 지시를 고칠 때 붙인 것 · 그림도 함께 돌아온다
    if (fill.attach?.length) setAttach((a) => [...a, ...fill.attach!.filter((x) => !a.some((y) => y.kind === x.kind && y.ref === x.ref && y.text === x.text))])
    if (fill.images?.length) setImages((xs) => [...xs, ...fill.images!.map((im, i) => ({ ...im, name: im.name || t(`그림 ${i + 1}`, `Image ${i + 1}`) }))].slice(0, 4))
    box.current?.focus()
  }, [fill?.n]) // eslint-disable-line react-hooks/exhaustive-deps

  const menu = (() => { const m = menuAt(text, caret); return m && m.start !== closed ? m : null })()
  // 앱 고치기 대화는 연구 프로젝트가 아니라 @로 붙일 노트 · 주제가 없다
  const research = rid !== APP_RID && rid !== CENTRAL_RID
  const notes = useQuery({ queryKey: qk.notes(rid), queryFn: () => notesApi(rid).list(), enabled: research && menu?.kind === '@' }).data
  const topics = useQuery({ queryKey: qk.topics(rid), queryFn: () => api.research(rid).topics(), enabled: research && menu?.kind === '@' }).data
  // 맥의 Claude Code 스킬 · 커넥터 (10/21 22:40): / 메뉴 · @ 메뉴에 함께 보인다
  const extras = useQuery({ queryKey: qk.agentExtras, queryFn: () => agentChatsApi.extras(), enabled: !!menu, staleTime: 60_000 }).data
  const tree = useQuery({ queryKey: qk.repoTree(rid), queryFn: () => api.research(rid).repoTree(), enabled: research && menu?.kind === '@' && (menu.query.length >= 2) }).data

  // 화면 요소 붙이기 (11/18): 피드백 모드와 같은 고르기로 한 곳을 누르면 부위 이름 · 글자와 그 둘레 그림을 붙인다
  const pickElement = async (p: Picked) => {
    setPicking(false)
    const text = p.snippet ? `${p.path}\n${p.snippet}` : p.path
    setAttach((a) => [...a, { kind: 'element', ref: location.hash || '#/', label: uiShown(p.path).split(' › ').pop()!.slice(0, 200), text: text.slice(0, 4000) }])
    box.current?.focus()
    if (images.length >= 4) return
    // 고르기 상자가 지워진 뒤 찍는다
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r)))
    const shot = await captureScreen()
    const im = shot && await cropShot(shot, p.rect)
    if (im) setImages((xs) => [...xs, { ...im, name: t('화면 요소', 'Screen element') }].slice(0, 4))
  }

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
      // 고르면 메뉴를 닫는다 (/compact처럼 글이 명령 그대로면 메뉴가 다시 맞아 열려 있었다)
      const fill = (v: string) => { setText(v); setCaret(v.length); setClosed(menu.start); requestAnimationFrame(() => box.current?.focus()) }
      const cmds = [...(room?.commands ?? []), ...COMMANDS].filter((c) => c.cmd.slice(1).toLowerCase().startsWith(q) || c.label.toLowerCase().includes(q))
        .map((c) => ({ key: c.cmd, label: c.cmd, meta: c.label, run: () => { fill(c.text); if (c.send) void submit(c.text) } }))
      // 스킬: 고르면 그 스킬을 쓰라는 글로 시작한다 (에이전트가 Skill 도구로 읽는다)
      const skills = (extras?.skills ?? []).filter((s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q))
        .map((s) => ({ key: `s:${s.name}`, label: s.name, meta: `${t('스킬', 'Skill')}${s.description ? ` · ${s.description}` : ''}`, run: () => fill(t(`「${s.name}」 스킬로 `, `Using the ${s.name} skill, `)) }))
      return [...cmds, ...skills].slice(0, 12)
    }
    const has = (s: string) => s.toLowerCase().includes(q)
    const out: MenuPick[] = []
    // 방 사람과 「모두」는 맨 위 (시안 §7-6): 고르면 @이름을 글에 넣는다. @al처럼 다른 이름(@all)으로 찾으면 그 이름을 넣는다
    for (const p of room?.people ?? []) {
      const name = has(p.label) ? p.label : p.aka && has(p.aka) ? p.aka : undefined
      if (name) out.push({ key: `p:${p.label}`, label: `@${name}`, meta: p.meta, run: () => replaceToken(`@${name} `) })
    }
    // 커넥터는 몇 개뿐이라 앞에 둔다 (노트가 많아도 묻히지 않게)
    for (const c of extras?.connectors ?? []) if (has(c.name)) out.push({ key: `c:${c.name}`, label: c.name, meta: ATTACH_NAME.connector, run: () => addAttach({ kind: 'connector', ref: c.name, label: c.name }) })
    for (const n of notes ?? []) if (has(n.title) || has(n.file)) out.push({ key: `n:${n.file}`, label: n.title, meta: ATTACH_NAME.note, run: () => addAttach({ kind: 'note', ref: n.file, label: n.title }) })
    for (const x of topics ?? []) if (has(x.title) || has(x.id)) out.push({ key: `t:${x.id}`, label: x.title, meta: ATTACH_NAME.topic, run: () => addAttach({ kind: 'topic', ref: x.id, label: x.title }) })
    if (q.length >= 2) for (const f of tree?.files ?? []) if (has(f.path)) out.push({ key: `f:${f.path}`, label: f.path, meta: ATTACH_NAME.file, run: () => addAttach({ kind: 'file', ref: f.path, label: f.path.split('/').pop() ?? f.path }) })
    return out.slice(0, 8)
  })()
  useEffect(() => setHi(0), [menu?.kind, menu?.query])

  const addImages = async (files: File[]) => {
    const ok = files.filter((f) => imageType(f))
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
  const submit = async (value = text) => {
    const v = value.trim()
    if (!v || busy) return
    setBusy(true); setFail(null)
    try {
      const ok = await onSubmit({ text: v, view: screenLine(), ...(all.length && { attach: all }), ...(images.length && { images: images.map(({ type, data, name }) => ({ type, data, name: name.slice(0, 200) })) }) })
      // 새 대화는 보내자마자 그 대화 화면으로 옮겨 가 이 입력란이 먼저 사라진다(setText가 닿지 않는다): 적던 글을 여기서 지운다
      if (ok) { if (keep) unsent.delete(keep); setText(''); setCaret(0); setAttach([]); setImages([]) }
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
    // 목록 줄에서 Enter는 다음 항목, Tab · Shift+Tab은 들여쓰기 · 내어쓰기 (목록 줄이 아니면 Shift+Tab은 허락 단계)
    if (onListKey(e, setText)) { setCaret(e.currentTarget.selectionStart); return }
    if (e.key === 'Tab' && e.shiftKey && !noTrust && !room?.plain) { e.preventDefault(); onSettings({ trust: nextTrust(settings.trust, isClaude(settings.agent)) }); return }
    if (e.key === 'Escape' && onStop && !text) { e.preventDefault(); onStop(); return }
    sendKey.onKeyDown(e)
  }
  // 입력란 밖(모델 · 권한 고르기 등)으로 옮겨 간 뒤에도 ⌘↵로 보낸다 (11/19 피드백 09:04). 입력란 안은 onKey가 받는다
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
  const claudeAccounts = useAgentAccounts('claude').data, codexAccounts = useAgentAccounts('codex').data
  const accounts = ((settings.agent === 'codex' ? codexAccounts : claudeAccounts)?.accounts ?? []).filter((a) => a.login)
  const efforts = effortsOf(settings.model, models)
  const fam = familyOf(settings.model, models)
  // 생각 깊이 고르기: Claude는 effort 칸, Codex는 모델 id 뒤의 깊이(gpt-…/high). 기본 모델이면 실제로 도는 모델의 깊이를 고르면 그 모델로 바뀐다
  const variants = (fam.family?.variants.length ? fam.family : fam.real)?.variants ?? []
  const thinking: { key: string; name: string; on: boolean; pick: Partial<Settings> }[] = variants.length > 1
    ? variants.map((v) => ({ key: v.value, name: effortLabel(v.suffix), on: settings.model !== 'default' && v.value === settings.model, pick: { model: v.value } }))
    : efforts.map((m) => ({ key: m, name: EFFORT_NAME[m], on: settings.effort === m, pick: { effort: m } }))
  const thinkingNow = variants.length > 1 ? (settings.model === 'default' ? t(`${effortLabel(fam.suffix)} (기본)`, `${effortLabel(fam.suffix)} (default)`) : effortLabel(fam.suffix)) : EFFORT_NAME[settings.effort]

  const trustName = settings.custom ? CUSTOM_NAME : TRUST_NAME[settings.trust]

  return (
    <div className="ac-composer" data-ui="에이전트 입력란" onKeyDown={(e) => { if (e.target !== box.current) sendKey.onKeyDown(e) }} onDrop={onDrop} onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) e.preventDefault() }}>
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
      {shownFail && <span className="error-text ac-hint">{shownFail}</span>}{room?.hint(text)}
      {picking && <ElementPicker title={t('화면 요소', 'Screen element')} hint={t('대화에 붙일 화면 한 곳을 누르세요 · Esc 취소', 'Click the part of the screen to attach · Esc to cancel')}
        skip=".ac-composer" onPick={(p) => void pickElement(p)} onCancel={() => setPicking(false)} />}
      <div className="ac-compose-row">
        <PopButton ui="붙이기 버튼" tip={t('붙이기 · 명령 · 그림', 'Attach · commands · images')} label={<span className="ac-pop-ico">{Icon.plus}</span>}>
          {(close) => <>
            <button role="menuitem" onClick={() => { close(); startToken('@') }}>{t('노트 · 주제 · 파일 · 커넥터 붙이기', 'Attach a note, topic, file or connector')}<span className="muted mono ac-key">@</span></button>
            <button role="menuitem" onClick={() => { close(); startToken('/') }}>{t('명령 · 스킬', 'Commands and skills')}<span className="muted mono ac-key">/</span></button>
            <button role="menuitem" onClick={() => { close(); file.current?.click() }}>{t('그림 고르기', 'Choose images')}<span className="muted ac-key">{t('붙여넣기도', 'or paste')}</span></button>
            <button role="menuitem" onClick={() => { close(); setPicking(true) }}>{t('화면 요소 고르기', 'Pick a screen element')}<span className="muted ac-key">{t('그림도', 'with image')}</span></button>
            <button role="menuitem" onClick={() => { close(); addAttach({ kind: 'screen', ref: (location.hash || '#/').slice(0, 400), label: (placeOf(document.title).at(-1) ?? t('첫 화면', 'Start')).slice(0, 200), text: screenLine() }) }}>{t('지금 화면 붙이기', 'Attach current screen')}</button>
            {(() => {
              // 마지막으로 고른 글 (노트 · 보고서와 그 밖의 모든 화면, 선택이 풀리거나 그 화면이 닫혀도 남는다, RecordContext). 없으면 흐리게
              const sel = lastRecordSelection()
              const where = sel && `${!sel.rid || sel.rid === rid ? '' : `${sel.rid}:`}${sel.target}${sel.line ? `:${sel.line}` : ''}`
              return <button role="menuitem" disabled={!sel} data-tip={sel ? undefined : t('화면에서 글을 고르면 붙일 수 있습니다', 'Select some text on a screen first')}
                onClick={() => { close(); if (sel) addAttach({ kind: 'selection', ref: where!.slice(0, 400), label: sel.quote.replace(/\s+/g, ' ').slice(0, 40), text: sel.quote.slice(0, 4000) }) }}>{t('고른 글 붙이기', 'Attach selected text')}</button>
            })()}
          </>}
        </PopButton>
        {lead}
        <input ref={file} type="file" accept="image/png,image/jpeg,image/gif,image/webp" multiple hidden onChange={(e) => { void addImages([...(e.target.files ?? [])]); e.target.value = '' }} />
        {!room?.plain && <>
        {!noTrust && <>
        <PopButton ui="맡기는 정도" tip={t(`권한: ${trustName} (⇧⇥)`, `Permissions: ${trustName} (⇧⇥)`)} wide label={<><span className="ac-pop-ico" aria-hidden>{settings.custom ? Icon.settings : TRUST_ICON[settings.trust]}</span><span className="ac-pop-text">{trustName} ▾</span></>}>
          {(close) => TRUSTS.filter((v) => v !== 'plan' || isClaude(settings.agent)).map((v) => (
            <button key={v} role="menuitemradio" aria-checked={settings.trust === v} className={`ac-pop-item${settings.trust === v ? ' on' : ''}`} onClick={() => { close(); onSettings({ trust: v }) }}>
              <span className="ac-pop-check" aria-hidden>{settings.trust === v ? Icon.check : null}</span>
              <span className="ac-pop-what"><span>{TRUST_NAME[v]}</span><span className="muted">{(rid === APP_RID ? APP_HINT : rid === CENTRAL_RID ? CENTRAL_HINT : TRUST_HINT)[v]}</span></span>
            </button>
          ))}
        </PopButton>
        {/* 권한 설명은 늘 보이는 줄 대신 ? 툴팁 (10/31 시안 6절). 누르면 소개의 그 절 */}
        <a className="icon-btn sm ac-help" href={href({ page: 'about', part: 'agents', anchor: 'conversations' })} data-ui="권한 설명" aria-label={t('권한 설명', 'About permissions')}
          data-tip={settings.custom ? t('직접 정한 권한입니다. 세부 패널 「이 대화의 권한」에서 봅니다', 'Custom permissions; see "Permissions here" in the detail pane') : (rid === APP_RID ? APP_HINT : rid === CENTRAL_RID ? CENTRAL_HINT : TRUST_HINT)[settings.trust]}>{Icon.help}</a>
        </>}
        {/* 모델과 생각 깊이는 따로 (11/9 11:07): 왼쪽에서 모델을 고르고, 그 모델이 받는 깊이를 오른쪽에서 */}
        <span className="ac-compose-model">
        <PopButton ui="모델 고르기" tip={t(`에이전트 · 모델: ${familyName(settings.model, models)}`, `Agent · model: ${familyName(settings.model, models)}`)} label={<><AgentLogo agent={agentOf(settings.agent)} /><span className="ac-pop-text">{familyName(settings.model, models)} ▾</span></>}>
          {(close) => <>
            <AgentChoices agent={settings.agent} fixed={agentFixed} onPick={(a) => { close(); if (a !== settings.agent) onSettings(agentSwitch(a, settings.trust)) }} />
            <div className="ac-pop-h">{t('모델', 'Model')}</div>
            {/* 「기본 모델」은 고르지 않는다 (11/20): 정한 모델로 시작해 여기서 바꾼다 */}
            {modelFamilies(models).filter((f) => f.base !== 'default').map((f) => {
              const on = (fam.family?.base ?? '') === f.base
              const value = pickFamily(f, fam.suffix)
              return <button key={f.base} role="menuitemradio" aria-checked={on} className={on ? 'on' : ''} onClick={() => { close(); onSettings({ model: value, ...fitEffort(settings.effort, effortsOf(value, models)) }) }}><span className="ac-pop-check" aria-hidden>{on ? Icon.check : null}</span>{f.base === 'default' ? modelName('default', models).replace(/ \(.*\)$/, '') : f.name}</button>
            })}
            {/* 계정 (11/16 "계정 전환을 쉽게"): 이 대화만 다른 Claude 계정으로. 다음 차례부터, 일하는 중에는 서버가 막는다 */}
            {settings.account !== undefined && (isClaude(settings.agent) || settings.agent === 'codex') && accounts.length > 1 && <>
              <div className="ac-pop-h">{t('계정', 'Account')}</div>
              {accounts.map((a) => <button key={a.id} role="menuitemradio" aria-checked={settings.account === a.id} className={settings.account === a.id ? 'on' : ''} onClick={() => { close(); if (settings.account !== a.id) onSettings({ account: a.id }) }}><span className="ac-pop-check" aria-hidden>{settings.account === a.id ? Icon.check : null}</span>{accountLabel(a)}</button>)}
            </>}
          </>}
        </PopButton>
        {thinking.length > 0 && (
          <PopButton ui="생각 고르기" tip={t(`생각 깊이: ${thinkingNow}`, `Thinking: ${thinkingNow}`)} label={<><EffortGauge level={thinking.findIndex((o) => o.on) + 1} of={thinking.length} /><span className="ac-pop-text">{thinkingNow} ▾</span></>}>
            {(close) => thinking.map((o) => <button key={o.key} role="menuitemradio" aria-checked={o.on} className={o.on ? 'on' : ''} onClick={() => { close(); onSettings(o.pick) }}><span className="ac-pop-check" aria-hidden>{o.on ? Icon.check : null}</span>{o.name}</button>)}
          </PopButton>
        )}
        </span>
        </>}
        <span className="sp" />
        {stopping
          ? <button className="ac-send stop" data-ui="대화 멈추기" data-tip={t('멈추기 (Esc)', 'Stop (Esc)')} aria-label={t('멈추기', 'Stop')} onClick={onStop}><span className="ac-stop-sq" aria-hidden /></button>
          : <button className="ac-send" data-ui="지시 보내기" data-tip={t('보내기 (⌘↵)', 'Send (⌘↵)')} aria-label={t('보내기', 'Send')} disabled={busy || !text.trim()} onClick={() => void submit()}>{Icon.up}</button>}
      </div>
    </div>
  )
}
