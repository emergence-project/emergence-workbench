// 중앙 방 (11/20 사용자 결정 "중앙 = 여럿이 말하는 방", 시안 https://claude.ai/artifact/1e4G2p1cQjgVNSSAZ9RFHr):
// 중앙 머리 아래 방 사람 줄(왕관 = 방장), 방 사람의 답 · 방 소식 줄, 방장 글의 이름, 오른쪽 칸의 방 관리, 입력란 @ 메뉴와 「받는 이」
import { useRef, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ROOM_NAME, routeOf } from '@rw/core'
import { agentChatsApi, type AgentKind, type ChatItem, type RoomMember, type RoomPerm, type RoomState } from './api'
import { AgentLogo } from './agentLogos'
import { MemoText } from './memo'
import { Icon } from './icons'
import { t } from './i18n'
import { qk } from './queries'
import { SideSection } from './SideSection'
import { useDismiss } from './useDismiss'

const AGENTS: AgentKind[] = ['claude-code', 'codex', 'gemini']
/** 사용자 말고 방에 둘 수 있는 수 (§7-3, 서버 ROOM_MAX) */
const ROOM_MAX = 4
export const PERM_NAME: Record<RoomPerm, string> = { read: t('읽기만', 'Read only'), talk: t('발언', 'Talk'), edit: t('수정', 'Edit') }
const PERM_TIP: Record<RoomPerm, string> = {
  read: t('부르면 접힌 요약만 냅니다', 'Gives a folded summary when called'),
  talk: t('부르면 방에서 답합니다. 파일은 고치지 않습니다', 'Answers in the room when called. Does not change files'),
  edit: t('방장: 하위 대화 · 파일 · PR을 맡습니다', 'Host: runs sub-conversations, files and pull requests'),
}
const NEXT_STEP = t('수정 넘기기는 다음 단계입니다. 지금은 방장(Claude)만 수정합니다', 'Handing over edit comes next. For now only the host (Claude) edits')

export const useRoom = (): RoomState | undefined => useQuery({ queryKey: qk.agentCentral, queryFn: () => agentChatsApi.central() }).data?.room

/** 왕관 (방장 = 수정을 가진 사람, 무채색) */
export const Crown = () => <svg className="room-crown" viewBox="0 0 16 12" role="img" aria-label={t('방장', 'Host')}><path d="M1 3l3.5 3L8 1l3.5 5L15 3l-1.5 8h-11z" /></svg>

/** 이름 하나: 로고 · (방장이면 왕관) · 이름 */
export function Who({ agent, host, perm }: { agent: AgentKind; host?: boolean; perm?: RoomPerm }) {
  return <span className="room-who"><AgentLogo agent={agent} />{host && <Crown />}<b>{ROOM_NAME[agent]}</b>{perm && <span className="room-perm" title={PERM_TIP[perm]}>{perm === 'edit' && Icon.pencil}{PERM_NAME[perm]}</span>}</span>
}

function useRoomChange(onError?: (m: string) => void) {
  const client = useQueryClient()
  return async (run: () => Promise<RoomState>) => {
    try { await run(); await client.invalidateQueries({ queryKey: qk.agentChatLists }) } catch (e) { onError?.(e instanceof Error ? e.message : String(e)) }
  }
}

/** 초대 메뉴: 방에 없는 에이전트 (새로 들어올 때 권한은 방 규칙) */
function InviteMenu({ room, onError }: { room: RoomState; onError(m: string): void }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLSpanElement>(null)
  useDismiss(open, box, () => setOpen(false))
  const change = useRoomChange(onError)
  const left = AGENTS.filter((a) => !room.members.some((m) => m.agent === a))
  if (!left.length || room.members.length >= ROOM_MAX) return null
  return (
    <span className="ac-pop" ref={box}>
      <button className="btn sm room-invite" data-ui="방 초대" aria-expanded={open} onClick={() => setOpen(!open)}>{Icon.plus}{t('초대', 'Invite')}</button>
      {open && <div className="menu" role="menu" data-ui="방 초대 메뉴">
        {left.map((a) => <button key={a} role="menuitem" onClick={() => { setOpen(false); void change(() => agentChatsApi.roomInvite(a)) }}><Who agent={a} /> <span className="muted">{PERM_NAME[room.rules.defaultPerm]}</span></button>)}
      </div>}
    </span>
  )
}

/** 중앙 머리 아래 방 사람 줄 */
export function RoomStrip() {
  const room = useRoom()
  const [fail, setFail] = useState<string | null>(null)
  if (!room) return null
  return (
    <div className="room-strip" data-ui="방 사람 줄">
      <span className="muted">{t('방', 'Room')}</span>
      {room.members.map((m) => <span key={m.agent} className={`room-chip${room.asking.includes(m.agent) ? ' asking' : ''}`} data-ui="방 사람" data-ui-item={ROOM_NAME[m.agent]} title={m.reason ?? PERM_TIP[m.perm]}><Who agent={m.agent} host={m.agent === room.host} perm={m.perm} /></span>)}
      <InviteMenu room={room} onError={setFail} />
      {fail && <span className="error-text ac-hint">{fail}</span>}
    </div>
  )
}

function Seg<T extends string | number>({ value, options, name, onPick, ui, disabled }: { value: T; options: { v: T; label: ReactNode; off?: string }[]; name: string; onPick(v: T): void; ui: string; disabled?: string }) {
  return (
    <div className="segmented small" role="radiogroup" aria-label={name} data-ui={ui} title={disabled}>
      {options.map((o) => <button key={o.v} role="radio" aria-checked={value === o.v} className={value === o.v ? 'on' : ''} disabled={!!disabled || !!o.off} title={o.off} onClick={() => value !== o.v && onPick(o.v)}>{o.label}</button>)}
    </div>
  )
}

const sub = (m: RoomMember, host: boolean) => host ? t('방장', 'Host') : m.by === 'host' ? t(`방장이 초대${m.reason ? ` · ${m.reason}` : ''}`, `Invited by the host${m.reason ? ` · ${m.reason}` : ''}`) : t('내가 초대', 'Invited by you')

/** 오른쪽 칸의 방 관리: 사람마다 권한 · 내보내기, 방 규칙 */
export function RoomManage() {
  const room = useRoom()
  const [fail, setFail] = useState<string | null>(null)
  const change = useRoomChange(setFail)
  if (!room) return null
  const perms = (['read', 'talk', 'edit'] as const)
  return (
    <SideSection title={t('방 관리', 'Room')} ui="방 관리" aside={<span className="cb-counts">{t(`${room.members.length}명 · 나 빼고 ${ROOM_MAX}명까지`, `${room.members.length} · up to ${ROOM_MAX} besides you`)}</span>}>
      {room.members.map((m) => {
        const host = m.agent === room.host
        return (
          <div key={m.agent} className="room-row" data-ui="방 관리 사람" data-ui-item={ROOM_NAME[m.agent]}>
            <div className="room-row-top"><Who agent={m.agent} host={host} />
              {!host && <button className="icon-btn sm room-x" data-ui="방에서 내보내기" data-tip={t('방에서 내보내기', 'Remove from the room')} aria-label={t('방에서 내보내기', 'Remove from the room')} onClick={() => void change(() => agentChatsApi.roomRemove(m.agent))}>{Icon.x}</button>}
            </div>
            <span className="muted room-sub">{sub(m, host)}</span>
            <Seg value={m.perm} name={t('권한', 'Permission')} ui="방 사람 권한" disabled={host ? NEXT_STEP : undefined} onPick={(p) => void change(() => agentChatsApi.roomPerm(m.agent, p))}
              options={perms.map((p) => ({ v: p, label: <>{p === 'edit' && Icon.pencil}{PERM_NAME[p]}</>, ...(p === 'edit' && !host && { off: NEXT_STEP }) }))} />
          </div>
        )
      })}
      <div className="room-rules" data-ui="방 규칙">
        <b>{t('방 규칙', 'Room rules')}</b>
        <label className="room-rule"><input type="checkbox" checked={room.rules.hostInvite} onChange={(e) => void change(() => agentChatsApi.roomRules({ hostInvite: e.target.checked }))} />{t('방장이 초대할 수 있음 (읽기만 · 발언까지)', 'The host may invite (read only or talk)')}</label>
        <div className="room-rule"><span>{t('새 사람 기본 권한', 'Default for newcomers')}</span><Seg value={room.rules.defaultPerm} name={t('새 사람 기본 권한', 'Default for newcomers')} ui="방 기본 권한" onPick={(p) => void change(() => agentChatsApi.roomRules({ defaultPerm: p }))} options={(['read', 'talk'] as const).map((p) => ({ v: p, label: PERM_NAME[p] }))} /></div>
        <div className="room-rule"><span>{t('방장이 한 번에 부르는 수', 'Host calls at once')}</span><Seg value={room.rules.callMax} name={t('방장이 한 번에 부르는 수', 'Host calls at once')} ui="방장 부르기 한도" onPick={(n) => void change(() => agentChatsApi.roomRules({ callMax: n }))} options={[1, 2, 3].map((n) => ({ v: n, label: String(n) }))} /></div>
        <span className="muted ac-hint">{t('그냥 말하면 방장만, @이름은 그 사람만, @모두는 모두 받습니다. @모두면 방장이 마지막에 정리합니다', 'A plain message goes to the host, @name only to them, @모두 to everyone; with @모두 the host answers last to sum up')}</span>
      </div>
      <InviteMenu room={room} onError={setFail} />
      {fail && <span className="error-text ac-hint">{fail}</span>}
    </SideSection>
  )
}

/** 방 사람의 답 (사용자가 @로 불렀거나 방장이 물었을 때). 읽기만 사람은 접힌 요약 */
export function MemberItem({ it }: { it: Extract<ChatItem, { kind: 'member' }> }) {
  const room = useRoom()
  const perm = room?.members.find((m) => m.agent === it.by)?.perm
  const body = it.text ? <MemoText text={it.text} /> : it.error ? <span className="error-text">! {it.error}</span> : <span className="muted">{t('답하는 중…', 'Answering…')}</span>
  return (
    <li className="room-member" data-ui="방 사람 답" title={new Date(it.at).toLocaleString()}>
      <div className="room-member-h"><Who agent={it.by} perm={perm} />{it.from === 'host' && <span className="muted">{t('방장이 물음', 'Asked by the host')}{it.q ? ` · ${it.q.split('\n')[0]}` : ''}</span>}</div>
      {it.fold && it.text ? <details><summary className="muted">{t('요약 펼치기', 'Show summary')}</summary>{body}</details> : body}
    </li>
  )
}

/** 방 소식 한 줄: 초대 · 내보내기 · 권한 · 규칙. 방장이 초대한 사람은 ×로 바로 내보낸다 */
export function RoomItem({ it }: { it: Extract<ChatItem, { kind: 'room' }> }) {
  const room = useRoom()
  const change = useRoomChange()
  const actor = it.by === 'host' ? (room ? ROOM_NAME[room.host] : t('방장', 'Host')) : t('내가', 'I')
  const who = it.agent ? ROOM_NAME[it.agent] : ''
  const what = it.act === 'invite' ? t(`${who}를 ${PERM_NAME[it.perm ?? 'talk']}으로 초대`, `invited ${who} (${PERM_NAME[it.perm ?? 'talk']})`)
    : it.act === 'remove' ? t(`${who}를 내보냄`, `removed ${who}`)
      : it.act === 'perm' ? t(`${who}의 권한을 ${PERM_NAME[it.perm ?? 'talk']}으로`, `set ${who} to ${PERM_NAME[it.perm ?? 'talk']}`)
        : t('방 규칙을 바꿈', 'changed the room rules')
  const removable = it.by === 'host' && it.act === 'invite' && it.agent && room?.members.some((m) => m.agent === it.agent && m.by === 'host')
  return (
    <li className="ac-note room-note" data-ui="방 소식" title={new Date(it.at).toLocaleString()}>
      <span>{it.by === 'host' && <Crown />}{t(`${actor}${it.by === 'host' ? '가' : ''} ${what}`, `${actor} ${what}`)}{it.reason && <span className="muted"> · {t('까닭', 'Why')}: {it.reason}</span>}</span>
      {removable && <button className="icon-btn sm" data-ui="방장 초대 빼기" data-tip={t('방에서 내보내기', 'Remove from the room')} aria-label={t('방에서 내보내기', 'Remove from the room')} onClick={() => void change(() => agentChatsApi.roomRemove(it.agent!))}>{Icon.x}</button>}
    </li>
  )
}

/** 방장 글 앞의 이름: 사용자 말 · 방 사람 답 다음 첫 방장 글에만 */
export function HostWho() {
  const room = useRoom()
  return room ? <div className="room-member-h"><Who agent={room.host} host perm="edit" /></div> : null
}
export function hostWhoAt(items: { kind: string; item?: ChatItem }[], i: number): boolean {
  const it = items[i]?.item
  if (it?.kind !== 'text' || it.sub) return false
  for (let j = i - 1; j >= 0; j--) {
    const x = items[j]!.item
    if (!x) continue
    if (x.kind === 'text' && !x.sub) return false
    if (x.kind === 'user' || x.kind === 'member') return true
  }
  return true
}

/** 입력란: @ 메뉴 맨 위의 방 사람과 「모두」, 아래 「받는 이」 */
export type ComposerRoom = { people: { label: string; meta: string }[]; hint(text: string): ReactNode }
export function useComposerRoom(on: boolean): ComposerRoom | undefined {
  const room = useRoom()
  if (!on || !room) return undefined
  const others = room.members.filter((m) => m.agent !== room.host)
  return {
    people: [...room.members.map((m) => ({ label: ROOM_NAME[m.agent], meta: `${m.agent === room.host ? `${t('방장', 'Host')} · ` : ''}${PERM_NAME[m.perm]}` })), ...(others.length ? [{ label: t('모두', 'all'), meta: t('방 전체 · 방장이 마지막에 정리', 'Everyone · host sums up last') }] : [])],
    hint: (text) => {
      const r = routeOf(text, room)
      return <span className="room-to" data-ui="받는 이">{t('받는 이', 'To')}{r.others.map((a) => <Who key={a} agent={a} />)}{r.host && <Who agent={room.host} host />}</span>
    },
  }
}
