/**
 * 다른 컴퓨터의 대화 보기와 이 컴퓨터에서 이어 하기 (11/20 사용자 결정 "읽기만 보이게" + 「요약으로 이어 하기」).
 *
 * 대화 기록은 컴퓨터마다 앱 설정 폴더(agent-chats/)에 있어, 맥미니에서 돌린 대화가 맥북 보관함에 보이지 않았다.
 * - 올리기: 맞추기(routes/backup.ts)가 이 컴퓨터의 대화를 개인 저장소 _chats/<컴퓨터>/<id>.json으로 올린다. 줄은 내 지시 · 에이전트 글 ·
 *   고친 파일(+n −n) · 오류만 담는다(도구 줄 · 생각 · 허락 카드 · 고친 내용은 빼서 작게). 중앙 대화도 올린다(11/20: 서버로 중앙을 하나로 모으면서 맥마다 돌던 예전 중앙도 다른 맥에서 읽기만 보이게).
 * - 보기: 다른 컴퓨터의 대화는 목록에 그 컴퓨터 이름(machine)을 달고 보관함에 읽기 전용으로 보인다(꺼내기 · 지우기 · 보내기 없음).
 * - 이어 하기: 「이 맥에서 이어 하기」를 누르면 같은 프로젝트 · 범위 · 설정으로 이 컴퓨터의 새 대화를 만들고 앞 줄을 그대로 옮긴다.
 *   Claude 세션 파일은 옮기지 않는다(컴퓨터마다 경로가 다르고 크다): 첫 지시에 앞 대화의 요약(carryText)을 붙여 넘긴다.
 *   같은 대화를 두 번 이어 오면 처음 만든 대화를 연다.
 * - 보관 요청 (11/20 사용자 "대화를 여는 권한도 있으니 닫을 권한도"): 중앙의 chat_archive가 다른 컴퓨터의 대화를 고르면 이 컴퓨터는 바꿀 수 없으니
 *   요청을 _chats/<이 컴퓨터>/_archive.json으로 올린다. 대상 컴퓨터는 맞추기 뒤 자기 앞으로 온 요청을 읽어, 그 대화가 일하는 중이 아니고
 *   요청 뒤에 다시 쓰지 않았으면 보관한다(applyArchiveAsks). 요청은 대상이 보관됐거나 · 요청 뒤에 다시 쓰였거나 · 없어지면 다음 올리기에서 빠진다.
 *   끝난 대화 복구(chat_unarchive, 11/20 사용자 "종료된 대화를 복구하는 것도")는 같은 길로 undo 요청을 보낸다. 지우기는 중앙에게 없다(사용자만).
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { CENTRAL_RID, ChatItem, ChatRow, type CentralArchived, type Chat } from '@rw/core/contract/agentChats'
import { AgentChats, LIVE, rowOf, type Stored } from './agentChats.js'
import { packFile } from './agentTidy.js'
import { machineName } from './backup.js'
import { t } from './i18n.js'
import { WorkbenchError } from './workbench.js'

/** 개인 저장소 안 대화 폴더 */
export const SHARE_ROOT = '_chats'
/** 다른 컴퓨터의 대화 하나 */
export interface ForeignChat { machine: string; row: ChatRow; items: ChatItem[]; /** 그 컴퓨터에서 보관했는가 (row.archived는 여기서 늘 true) */ archived: boolean }
/** 다른 컴퓨터에 보내는 보관 요청 (중앙의 chat_archive). machine = 그 대화가 있는 컴퓨터, undo = 보관함에서 꺼내기 (chat_unarchive) */
export interface ArchiveAsk { machine: string; id: string; title: string; reason: string; at: string; undo?: boolean }
/** _chats/<컴퓨터>/ 안 보관 요청 파일 이름 (대화 파일과 섞이지 않게 _로 시작) */
export const ARCHIVE_ASKS = '_archive'
/** 이 컴퓨터가 보낸 보관 요청을 두는 파일 (대화 폴더 안. .json으로 끝나지 않아 대화로 읽히지 않는다) */
const ASKS_FILE = 'archive-asks.jsonl'
/** 이어 올 때 첫 지시에 붙이는 앞 대화의 길이 (글자) */
export const CARRY_MAX = 12_000

/** 올릴 줄: 내 지시 · 에이전트 글(하위 에이전트 빼고) · 고친 파일(내용 빼고) · 오류 */
export function shareItems(items: ChatItem[]): ChatItem[] {
  const out: ChatItem[] = []
  for (const it of items) {
    if (it.kind === 'user' && !it.auto) out.push({ kind: 'user', at: it.at, text: it.text, ...(it.attach?.length && { attach: it.attach }) })
    else if (it.kind === 'text' && !it.sub) out.push({ kind: 'text', at: it.at, text: it.text })
    else if (it.kind === 'edit') out.push({ kind: 'edit', at: it.at, file: it.file, parts: [], added: it.added, removed: it.removed, ...(it.via && { via: it.via }) })
    else if (it.kind === 'error') out.push({ kind: 'error', at: it.at, text: it.text })
  }
  return out
}

/** 보관하며 압축해 둔 줄까지 (대화를 메모리에 다시 풀지 않고 읽는다) */
function itemsOf(dir: string, c: Stored): ChatItem[] {
  if (!c.packed) return c.items
  try {
    const items: unknown = JSON.parse(zlib.gunzipSync(fs.readFileSync(packFile(dir, c.id))).toString('utf8'))
    return Array.isArray(items) ? items.flatMap((x) => { const r = ChatItem.safeParse(x); return r.success ? [r.data] : [] }) : []
  } catch { return [] }
}

/** 다른 컴퓨터가 올린 대화. 파일이 바뀌지 않았으면 읽어 둔 것을 쓴다 */
const cache = new Map<string, { mtime: number; chat: ForeignChat | null }>()
export function otherMachineChats(dir: string | undefined, machine = machineName()): ForeignChat[] {
  if (!dir) return []
  const root = path.join(dir, SHARE_ROOT)
  let names: string[] = []
  try { names = fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory() && d.name !== machine).map((d) => d.name).sort() } catch { return [] }
  const out: ForeignChat[] = []
  for (const m of names) {
    let files: string[] = []
    try { files = fs.readdirSync(path.join(root, m)).filter((f) => f.endsWith('.json') && !f.startsWith('_')) } catch { continue }
    for (const f of files) {
      const file = path.join(root, m, f)
      let mtime = 0
      try { mtime = fs.statSync(file).mtimeMs } catch { continue }
      const hit = cache.get(file)
      const chat = hit && hit.mtime === mtime ? hit.chat : readForeign(file, m)
      cache.set(file, { mtime, chat })
      if (chat) out.push(chat)
    }
  }
  return out
}

function readForeign(file: string, machine: string): ForeignChat | null {
  let raw: unknown
  try { raw = JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return null }
  if (!raw || typeof raw !== 'object' || !('row' in raw) || !('items' in raw)) return null
  // 다른 판의 앱이 올린 칸은 버리고 아는 칸만 읽는다
  const row = ChatRow.strip().safeParse(raw.row)
  if (!row.success) return null
  const items = Array.isArray(raw.items) ? raw.items.flatMap((x) => { const r = ChatItem.safeParse(x); return r.success ? [r.data] : [] }) : []
  // 이 컴퓨터에서는 돌지 않는다: 보관함에서 읽기만 (상태는 끝남으로, 잡은 파일 · 차례 표시 · 수정 검토로 가는 고친 파일 목록은 뺀다)
  const { live: _l, tasks: _t, compacting: _c, draft: _d, queue: _q, since: _s, wait: _w, ...rest } = row.data
  return { machine, row: { ...rest, state: 'idle', claims: [], changed: [], archived: true, machine }, items, archived: row.data.archived }
}

/** 앞 대화를 이어 받는 첫 지시 머리 (줄이 길면 앞을 자른다) */
export function carryText(f: ForeignChat): string {
  const lines = f.items.flatMap((it) => it.kind === 'user' ? [`User: ${it.text}`] : it.kind === 'text' ? [`Agent: ${it.text}`] : it.kind === 'edit' ? [`(edited ${it.file} +${it.added} −${it.removed})`] : [])
  let body = lines.join('\n\n')
  if (body.length > CARRY_MAX) body = `…\n${body.slice(body.length - CARRY_MAX)}`
  return [
    `[This conversation continues one that ran on another computer (${f.machine}). You do not have its session; here is what was said. Files it read are not in your context: read them again if you need them.]`,
    body,
    '[End of the earlier conversation. The new message follows.]',
  ].join('\n\n')
}

function isAsk(x: unknown): x is ArchiveAsk {
  if (!x || typeof x !== 'object') return false
  const o = Object.fromEntries(Object.entries(x))
  return ['machine', 'id', 'title', 'reason', 'at'].every((k) => typeof o[k] === 'string') && (o.undo === undefined || typeof o.undo === 'boolean')
}

/** 다른 컴퓨터에서 이어 온 대화의 원래 대화 */
function fromOf(c: object): { machine: string; id: string } | undefined {
  if (!('from' in c) || !c.from || typeof c.from !== 'object' || !('machine' in c.from) || !('id' in c.from)) return undefined
  const { machine, id } = c.from
  return typeof machine === 'string' && typeof id === 'string' ? { machine, id } : undefined
}

/** 대화 목록 · 올리기 · 이어 하기 (FeedbackChats · CentralChats가 잇는다) */
export class SharedChats extends AgentChats {
  /** 다른 컴퓨터의 대화를 읽을 개인 저장소 사본 (routes/agentChats.ts가 정한다. 없으면 이 컴퓨터 것만) */
  shareDir?: string

  /** 개인 저장소에 올릴 파일: 대화 id → 내용 (예전 중앙과 다른 컴퓨터에서 이어 온 앞 줄도 함께, 이 컴퓨터 것으로) */
  sharedFiles(): Record<string, string> {
    const out: Record<string, string> = {}
    for (const c of this.chats.values()) {
      const row = rowOf(c)
      out[c.id] = JSON.stringify({ row: { ...row, state: LIVE.has(row.state) ? 'idle' : row.state }, items: shareItems(itemsOf(this.deps.dir, c)) })
    }
    const asks = this.pendingAsks()
    if (asks.length) out[ARCHIVE_ASKS] = JSON.stringify(asks)
    return out
  }

  /** 이 컴퓨터가 보낸 보관 요청 가운데 아직 적용되지 않은 것 (적용됐거나 · 요청 뒤에 다시 쓰였거나 · 대화가 없어진 것은 버린다) */
  private pendingAsks(): ArchiveAsk[] {
    const file = path.join(this.deps.dir, ASKS_FILE)
    let all: ArchiveAsk[] = []
    try { all = fs.readFileSync(file, 'utf8').split('\n').flatMap((l) => { try { const x: unknown = JSON.parse(l); return isAsk(x) ? [x] : [] } catch { return [] } }) } catch { return [] }
    const foreign = new Map(otherMachineChats(this.shareDir).map((f) => [`${f.machine}/${f.row.id}`, f]))
    const keep = all.filter((a) => { const f = foreign.get(`${a.machine}/${a.id}`); return !!f && f.archived === !!a.undo && f.row.updated <= a.at })
    if (keep.length !== all.length) fs.writeFileSync(file, keep.map((a) => JSON.stringify(a)).join('\n'))
    return keep
  }

  /**
   * 하위 대화가 아닌 대화를 보관한다 (중앙의 chat_archive), undo면 보관함에서 꺼낸다 (chat_unarchive). 이 컴퓨터의 대화는 바로, 다른 컴퓨터의 대화는 요청으로.
   * 일하는 중 · 이미 그 상태인 대화는 거절한다. 지우지 않는다(지우기는 사용자만)
   */
  archiveOrAsk(id: string, reason: string, undo = false): CentralArchived {
    const c = this.chats.get(id)
    if (c?.rid === CENTRAL_RID) throw new WorkbenchError(400, t('중앙 대화는 이렇게 보관하거나 꺼내지 않습니다', 'The central conversation is not archived or restored this way'))
    const out = c ? this.archiveHere(c, undo) : this.askArchive(id, reason, undo)
    const central = [...this.chats.values()].filter((x) => x.rid === CENTRAL_RID && !x.archived).sort((a, b) => b.updated.localeCompare(a.updated))[0]
    const where = out.machine ? t(` (${out.machine}, 다음 맞추기 때)`, ` (${out.machine}, at its next sync)`) : ''
    const [ko, en] = undo ? ['복구', 'restored'] : ['보관', 'archived']
    central?.items.push({ kind: 'text', at: new Date().toISOString(), text: t(`자동: ${ko} · ${out.title}${where} · ${reason.trim()}`, `Automatic: ${en} · ${out.title}${where} · ${reason.trim()}`) })
    if (central) this.touch(central)
    return out
  }

  private archiveHere(c: Stored, undo: boolean): CentralArchived {
    if (!undo && c.archived) throw new WorkbenchError(409, t('이미 보관함에 있습니다', 'Already archived'))
    if (undo && !c.archived) throw new WorkbenchError(409, t('보관함에 없습니다', 'Not archived'))
    if (LIVE.has(c.state)) throw new WorkbenchError(409, t('일하는 중이라 보관하지 않습니다. 끝나기를 기다리세요', 'Still working; wait until it finishes before archiving'))
    this.archive(c.id, !undo)
    return { id: c.id, title: c.title }
  }

  private askArchive(id: string, reason: string, undo: boolean): CentralArchived {
    const f = this.foreign(id)
    if (!f) throw new WorkbenchError(404, t('그런 대화가 없습니다', 'No such conversation'))
    if (!undo && f.archived) throw new WorkbenchError(409, t(`${f.machine}에서 이미 보관했습니다`, `Already archived on ${f.machine}`))
    if (undo && !f.archived) throw new WorkbenchError(409, t(`${f.machine}에서 보관함에 있지 않습니다`, `Not archived on ${f.machine}`))
    if (this.pendingAsks().some((x) => x.id === id)) throw new WorkbenchError(409, t(`이미 ${f.machine}에 청했습니다. 다음 맞추기를 기다리세요`, `Already asked of ${f.machine}; wait for its next sync`))
    const ask: ArchiveAsk = { machine: f.machine, id, title: f.row.title, reason: reason.trim().slice(0, 300), at: new Date().toISOString(), ...(undo && { undo: true }) }
    fs.appendFileSync(path.join(this.deps.dir, ASKS_FILE), `\n${JSON.stringify(ask)}`)
    return { id, title: f.row.title, machine: f.machine }
  }

  /**
   * 맞추기 뒤: 다른 컴퓨터가 이 컴퓨터 앞으로 올린 보관 · 꺼내기 요청을 적용한다 (routes/backup.ts).
   * 그 대화가 일하는 중이거나 · 요청 뒤에 다시 쓰였거나(이 컴퓨터에서 다시 열어 이어 함) · 이미 그 상태면 두지 않는다. 바꾼 대화 id를 돌려준다
   */
  applyArchiveAsks(machine = machineName()): string[] {
    if (!this.shareDir) return []
    const root = path.join(this.shareDir, SHARE_ROOT)
    let dirs: string[] = []
    try { dirs = fs.readdirSync(root).filter((d) => d !== machine) } catch { return [] }
    const done: string[] = []
    for (const d of dirs) {
      let asks: unknown
      try { asks = JSON.parse(fs.readFileSync(path.join(root, d, `${ARCHIVE_ASKS}.json`), 'utf8')) } catch { continue }
      for (const a of Array.isArray(asks) ? asks.filter(isAsk) : []) {
        const c = this.chats.get(a.id)
        if (a.machine !== machine || !c || c.archived === !a.undo || LIVE.has(c.state) || c.updated > a.at) continue
        const text = a.undo ? t(`자동: ${d}의 중앙이 보관함에서 꺼냈습니다 · ${a.reason}`, `Automatic: restored from the archive by the central conversation on ${d} · ${a.reason}`) : t(`자동: ${d}의 중앙이 보관함에 넣었습니다 · ${a.reason}`, `Automatic: archived by the central conversation on ${d} · ${a.reason}`)
        c.items.push({ kind: 'text', at: new Date().toISOString(), text })
        this.archive(a.id, !a.undo)
        done.push(a.id)
      }
    }
    return done
  }

  /** 이 컴퓨터의 대화와 다른 컴퓨터의 대화 (화면의 목록) */
  listAll(rid?: string): ChatRow[] {
    const mine = this.list(rid)
    const here = new Set(mine.map((c) => c.id))
    return [...mine, ...otherMachineChats(this.shareDir).filter((f) => !here.has(f.row.id) && (!rid || f.row.rid === rid)).map((f) => f.row)]
  }

  private foreign(id: string): ForeignChat | undefined {
    return otherMachineChats(this.shareDir).find((f) => f.row.id === id)
  }

  /** 대화 하나: 이 컴퓨터에 없으면 다른 컴퓨터의 것 (읽기만) */
  getAny(id: string): Chat {
    if (this.chats.has(id)) return this.get(id)
    const f = this.foreign(id)
    if (!f) return this.get(id) // 404
    return { ...f.row, items: f.items, always: [], todos: [] }
  }

  /** 「이 맥에서 이어 하기」: 같은 프로젝트 · 범위 · 설정의 새 대화 (앞 줄을 옮기고, 첫 지시에 앞 대화를 붙인다). 이미 이어 왔으면 그 대화 */
  continueHere(id: string): Chat {
    const f = this.foreign(id)
    if (!f) throw new WorkbenchError(404, t('다른 컴퓨터의 대화가 아닙니다', 'Not a conversation from another computer'))
    const done = [...this.chats.values()].find((c) => fromOf(c)?.id === id)
    if (done) return this.get(done.id)
    const r = f.row
    if (r.scope.kind === 'app' && !this.app) throw new WorkbenchError(404, t('이 컴퓨터에는 앱 저장소가 없어 앱 고치기 대화를 이어 갈 수 없습니다', 'No app repository on this computer, so app conversations cannot continue here'))
    if (r.scope.kind !== 'app') {
      try { this.deps.project(r.rid) } catch { throw new WorkbenchError(404, t('이 컴퓨터에 그 프로젝트가 없습니다. 프로젝트를 받은 뒤 이어 가세요', 'That project is not on this computer. Get the project first, then continue')) }
    }
    const at = new Date().toISOString()
    const c: Stored & { from: { machine: string; id: string }; carry: string } = {
      id: `${at.slice(0, 10)}-${crypto.randomBytes(4).toString('hex')}`,
      rid: r.rid, title: r.title, agent: r.agent, scope: r.scope, write: r.write, state: 'idle', mode: r.mode, model: r.model, effort: r.effort,
      claims: [], changed: [], todos: [], created: at, updated: at,
      items: [...f.items, { kind: 'user', at, auto: true, text: t(`${f.machine}에서 이어 왔습니다 · 다음 지시에 앞 대화를 붙여 넘깁니다`, `Continued from ${f.machine} · the earlier conversation goes with your next message`) }],
      ...(r.record && { record: { ...r.record } }),
      from: { machine: f.machine, id }, carry: carryText(f),
    }
    this.chats.set(c.id, c)
    this.touch(c)
    return this.get(c.id)
  }
}
