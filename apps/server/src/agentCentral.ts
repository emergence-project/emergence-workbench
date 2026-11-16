/**
 * 중앙 대화 (11/16 사용자 결정 "중앙 에이전트", 시안 https://claude.ai/artifact/9x2Bud4dVQyYkS6RhdnbAG §1–§5).
 *
 * - 맥에 하나인 Opus 대화(rid CENTRAL_RID). 읽기만 하고, 짧은 질문은 직접 답한다. 고치거나 돌리는 일은 하위 대화를 열어 맡긴다
 *   (앱 고치기 · 프로젝트 작성 · 피드백 처리). 고치기 · 명령 · 기록 쓰기는 agentPolicy.ts의 judgeCentral이 막는다.
 * - 하위 대화는 보통 대화와 같다(같은 권한 · 작업 폴더 · 잡기). 다른 점은 parent(중앙 대화 id)뿐이고, 하위 대화는 다시 대화를 열지 못한다.
 * - 중앙은 하위 대화의 원문을 읽지 않는다: 사용자가 중앙에게 말할 때마다 하위 대화의 상태와 마지막 글 한 줄(digest)을 앞에 붙인다 (토큰 아끼기).
 * - 앱 고치기 대화는 동시에 APP_LIVE_MAX개까지 (시안 §9 ③). 피드백은 열기 전에 맡기(handoff.yaml)를 적어 올려
 *   클라우드 루틴 · 다른 맥과 같은 항목을 함께 처리하지 않는다 (11/8에 있었던 일).
 */
import { APP_RID, CENTRAL_RID, type CentralKid, type CentralOpenBody, type Chat, type ChatItem, type ChatMessageBody } from '@rw/core/contract/agentChats'
import { AgentChats, LIVE, lastTouched, promptOf, type Stored } from './agentChats.js'
import { listAllFeedback } from './feedback.js'
import { t } from './i18n.js'
import { WorkbenchError } from './workbench.js'

/** 동시에 일하는 앱 고치기 대화 수 (맥 메모리 · 합칠 때 부딪힘, 시안 §9 ③) */
export const APP_LIVE_MAX = 2
/** 중앙에게 넘기는 하위 대화 한 줄의 마지막 글 길이 */
const REPORT_CHARS = 300

/** 중앙 대화를 처음 열 때 주는 안내 (영어: 에이전트가 읽는다). 사용자에게는 보이지 않는다 */
export const CENTRAL_BRIEF = [
  'You are the central conversation of Emergence Workbench, the user\'s research workbench app. The user talks to you first.',
  'You only read and orchestrate. You cannot edit files, run commands or write notes and records: the app blocks it.',
  '- Answer questions yourself by reading: workbench MCP tools (list_projects, project_status, overview, read_note, list_records, search_library, rules) and Read/Grep/Glob on the app repository (your working folder) and registered projects.',
  '- For anything that changes something, open a sub-conversation with chat_open: role app = fix or build something in the app itself (it gets its own work folder and pull request; merging and restarting stay with the app and the user); role project = write or edit in one research project (edits go to the user\'s edit review); role feedback = handle one app feedback item by its key.',
  '- Put the user\'s own words in task verbatim, then add only the context the sub-conversation needs. One goal per sub-conversation.',
  '- Before opening, check chat_list: if a sub-conversation already works on the same thing or the same files, use chat_send instead. Sub-conversations cannot open others.',
  '- Each user message starts with a short status of your sub-conversations. Mention one only when the user must act (their turn, a failed check) or it finished.',
  '- Close a sub-conversation with chat_close only when its work ended (pull request merged, edits reviewed, answer given), with a three-line summary: what was done, where the result is, what is left.',
  '- Reply in the user\'s language (usually Korean), short and plain. Do not judge research value or pick research topics for the user.',
].join('\n')

const stateWord: Record<string, string> = { running: 'working', waiting: 'waiting for the user', queued: 'queued', idle: 'done with its turn', stopped: 'stopped', error: 'failed' }

/** 대화의 마지막 에이전트 글 (줄임) */
export function lastReport(items: ChatItem[], n = REPORT_CHARS): string | undefined {
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i]!
    if (it.kind === 'text' && !it.sub && it.text.trim()) {
      const s = it.text.replace(/\s+/g, ' ').trim()
      return s.length > n ? `${s.slice(0, n)}…` : s
    }
  }
  return undefined
}

/** 하위 대화 한 줄 */
export function kidOf(c: Stored): CentralKid {
  let wait: CentralKid['wait']
  for (const it of c.items) if (it.kind === 'ask' && !it.answer) wait = it.plan !== undefined ? 'plan' : 'ask'
  const report = lastReport(c.items)
  return {
    id: c.id, rid: c.rid, title: c.title, state: c.state, ...(c.state === 'waiting' && wait && { wait }),
    ...(c.pr && { pr: { ...c.pr } }), ...(c.merged && { merged: c.merged }), ...(c.feedback && { feedback: c.feedback }),
    archived: !!c.archived, ...(c.summary && { summary: c.summary }), ...(report && { report }), updated: c.updated,
  }
}

/** 중앙에게 넘기는 하위 대화 요약 (보관한 것은 빼고) */
export function digestOf(kids: CentralKid[]): string {
  const open = kids.filter((k) => !k.archived)
  if (!open.length) return '[Sub-conversations: none open]'
  return ['[Sub-conversations]', ...open.map((k) => {
    const pr = k.pr ? ` · PR #${k.pr.number}${k.merged ? ' merged' : ''}` : ''
    return `- ${k.id} · ${k.rid === APP_RID ? 'app' : k.rid} · "${k.title}" · ${k.wait === 'plan' ? 'waiting for plan approval' : stateWord[k.state] ?? k.state}${pr}${k.report ? ` · last: ${k.report}` : ''}`
  })].join('\n')
}

export class CentralChats extends AgentChats {
  /** 중앙 대화 (보관하지 않은 것 가운데 가장 최근) */
  private central(): Stored | undefined {
    return [...this.chats.values()].filter((c) => c.rid === CENTRAL_RID && !c.archived).sort((a, b) => b.updated.localeCompare(a.updated))[0]
  }

  centralState(): { id?: string; kids: CentralKid[]; app: boolean } {
    const c = this.central()
    return { ...(c && { id: c.id }), kids: c ? this.kidsOf(c.id) : [], app: this.app }
  }

  private kidsOf(parent: string): CentralKid[] {
    return [...this.chats.values()].filter((k) => k.parent === parent).sort((a, b) => b.updated.localeCompare(a.updated)).map(kidOf)
  }

  /** 사용자가 중앙에게 말한다: 중앙이 없으면 연다 (Opus, 읽기만) */
  talk(text: string): Chat {
    const c = this.central()
    if (c) return this.send(c.id, { text })
    const digest = digestOf([])
    return this.create({ rid: CENTRAL_RID, text, title: t('중앙', 'Central'), scope: { kind: 'all' }, write: 'read', mode: 'edit', model: 'opus', effort: 'medium' }, {}, `${CENTRAL_BRIEF}\n\n${digest}\n\n${text}`)
  }

  /** 중앙 대화에 보내는 말에는 하위 대화 요약을 앞에 붙인다 (화면의 입력란에서 보내도) */
  override send(id: string, m: ChatMessageBody, prompt?: string): Chat {
    const c = this.must(id)
    if (c.rid === CENTRAL_RID && prompt === undefined) {
      // 앱이 다시 켜져 세션이 없으면 안내도 다시
      const brief = c.sessionId ? '' : `${CENTRAL_BRIEF}\n\n`
      return super.send(id, m, `${brief}${digestOf(this.kidsOf(id))}\n\n${promptOf(m.text, m.attach)}`)
    }
    return super.send(id, m, prompt)
  }

  /** 중앙이 하위 대화를 연다 (chat_open) */
  async openKid(b: CentralOpenBody): Promise<CentralKid> {
    const c = this.central()
    if (!c) throw new WorkbenchError(409, t('중앙 대화가 없습니다', 'There is no central conversation'))
    if (b.role === 'app') {
      const live = [...this.chats.values()].filter((k) => k.rid === APP_RID && LIVE.has(k.state))
      if (live.length >= APP_LIVE_MAX) {
        throw new WorkbenchError(409, t(
          `앱 고치기 대화가 이미 ${live.length}개 일하는 중입니다 (${live.map((k) => `「${k.title}」 ${k.id}`).join(', ')}). 끝나기를 기다리거나 그 대화에 이어 보내세요`,
          `${live.length} app conversations are already working (${live.map((k) => `"${k.title}" ${k.id}`).join(', ')}). Wait for one to finish or send to it with chat_send`,
        ))
      }
      return kidOf(this.must(this.create({ rid: APP_RID, text: b.task, title: b.title, mode: 'edit' }, { parent: c.id }).id))
    }
    if (b.role === 'project') {
      if (!b.project) throw new WorkbenchError(400, t('프로젝트 작성에는 project(프로젝트 id)가 필요합니다', 'role project needs project (a project id from list_projects)'))
      if (b.project === APP_RID || b.project === CENTRAL_RID) throw new WorkbenchError(400, t('연구 프로젝트 id가 아닙니다', 'Not a research project id'))
      return kidOf(this.must(this.create({ rid: b.project, text: b.task, title: b.title, scope: { kind: 'project' }, write: 'notes', mode: 'edit' }, { parent: c.id }).id))
    }
    // 피드백: 다른 컴퓨터 · 클라우드 루틴이 이번 차례에 맡았으면 열지 않고, 맡기를 적어 올린 뒤에 연다
    const key = b.feedback
    if (!key) throw new WorkbenchError(400, t('피드백 처리에는 feedback(피드백 키)가 필요합니다', 'role feedback needs feedback (the feedback key)'))
    const fb = this.deps.feedback
    const e = fb ? listAllFeedback(fb.dir).find((x) => x.key === key) : undefined
    if (fb?.claims && e) {
      const since = lastTouched(e)
      if (fb.claims.taken(key, since) || !(await fb.claims.claim(key, since).catch(() => false))) {
        throw new WorkbenchError(409, t('다른 컴퓨터나 클라우드 루틴이 이 피드백을 맡았습니다', 'Another computer or the cloud routine has claimed this feedback'))
      }
    }
    const kid = this.handOff(key, c.id)
    // 맡길 일에 사용자의 말이 더 있으면 이어 보낸다 (피드백 안내는 handOff가 만든다)
    if (b.task.trim()) this.send(kid.id, { text: b.task })
    return kidOf(this.must(kid.id))
  }

  /** 중앙이 하위 대화에 이어 보낸다 (chat_send) */
  sendKid(id: string, text: string): CentralKid {
    this.kidOfCentral(id)
    this.send(id, { text })
    return kidOf(this.must(id))
  }

  /** 중앙이 하위 대화를 닫는다 (chat_close): 결과 요약을 남기고 보관한다. 일하는 중이면 닫지 않는다 */
  closeKid(id: string, summary: string): CentralKid {
    const k = this.kidOfCentral(id)
    if (LIVE.has(k.state)) throw new WorkbenchError(409, t('아직 일하는 중이라 닫지 않습니다. 끝나기를 기다리세요', 'Still working; wait until it finishes before closing'))
    k.summary = summary.trim().slice(0, 2000)
    this.touch(k)
    this.archive(id, true)
    return kidOf(this.must(id))
  }

  private kidOfCentral(id: string): Stored {
    const k = this.must(id)
    const c = this.central()
    if (!c || k.parent !== c.id) throw new WorkbenchError(400, t('중앙이 연 하위 대화가 아닙니다', 'Not a sub-conversation of the central conversation'))
    return k
  }
}
