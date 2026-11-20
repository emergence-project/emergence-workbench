/** Reuse the app's notification and undo action from nested document views. */
export type FlashAction = { label: string; run(): void }
export const FLASH_EVENT = 'rw:flash'
/**
 * error: 실패 알림 (11/20 시안 2절). 저절로 사라지지 않고 × 로 닫을 때까지 남는다(놓치면 안 되므로). 결과만 알리는 글은 잠깐 떴다 사라진다.
 * 툴바 · 머리줄에 결과 글을 끼워 넣으면 배치가 밀리므로 결과는 이 알림으로 보인다.
 */
export interface FlashMessage { message: string; action?: FlashAction; error?: boolean }

export function flash(message: string, action?: FlashAction, opts?: { error?: boolean }): void {
  window.dispatchEvent(new CustomEvent<FlashMessage>(FLASH_EVENT, { detail: { message, action, ...(opts?.error && { error: true }) } }))
}
