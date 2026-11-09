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
