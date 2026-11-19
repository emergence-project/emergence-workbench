// 에이전트 대화의 지시 줄 (agentChats.ts에서 나눔, 11/9 구조 래칫)

/** 차례 사이에 지시를 넘기는 줄. close하면 남은 것을 다 읽은 뒤 끝난다 */
export class Inbox<T> implements AsyncIterable<T> {
  private items: T[] = []
  private wake?: () => void
  closed = false
  push(x: T): boolean {
    if (this.closed) return false
    this.items.push(x)
    this.ping()
    return true
  }
  close(): void { this.closed = true; this.ping() }
  /** 읽지 않고 남은 것을 꺼낸다 */
  drain(): T[] { return this.items.splice(0) }
  private ping(): void { const w = this.wake; this.wake = undefined; w?.() }
  async *[Symbol.asyncIterator](): AsyncIterator<T> {
    for (;;) {
      const x = this.items.shift()
      if (x !== undefined) { yield x; continue }
      if (this.closed) return
      await new Promise<void>((r) => { this.wake = r })
    }
  }
}

/**
 * 실행기(Claude Code)에 넘겼지만 에이전트가 아직 읽지 않은 지시 (11/19 "중앙 대화에 보낸 글 누락").
 * SDK는 일하는 중에 넘긴 지시를 inbox에서 곧바로 가져가 제 줄에 둔다. 그래서 그 차례를 멈추거나 실패해 닫으면
 * inbox에는 남은 것이 없는데 지시는 읽히지 않고 사라졌다. 넘길 때 uuid를 붙이고, 주 에이전트의 답이 그 uuid를
 * 읽었다고 알리면(user_message_uuids) 지운다. 닫힐 때 남은 것을 앱이 「다음에 보냄」으로 되돌린다.
 * 답에 uuid를 붙이지 않는 옛 Claude Code면(한 번도 본 적 없으면) 아무것도 되돌리지 않는다 (같은 지시를 두 번 보내지 않게).
 */
export class Unread<T> {
  private sent = new Map<string, T>()
  private stamped = false
  /** 넘기는 지시 하나와 거기 붙인 uuid */
  add(x: T, uuid: string): void { this.sent.set(uuid, x) }
  /** 주 에이전트의 답이 읽었다고 알린 지시들 */
  read(uuids: readonly string[]): void {
    if (!uuids.length) return
    this.stamped = true
    for (const u of uuids) this.sent.delete(u)
  }
  clear(): void { this.sent.clear() }
  /** 읽히지 않은 지시 (넘긴 차례대로) */
  left(): T[] {
    return this.stamped ? [...this.sent.values()] : []
  }
}
