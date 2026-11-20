import { store } from './store'

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

export const NOTICE_ERRORS = 'rw-notice-errors'
/** 실패 알림을 상단바 알림 종에도 남긴다 (App의 flash가 부른다). 이 브라우저에 최근 30개, 바뀌면 NOTICE_ERRORS 이벤트 */
export function noteError(message: string): void {
  const list = store.get<{ at: string; text: string }[]>(NOTICE_ERRORS, [])
  store.set(NOTICE_ERRORS, [...list, { at: new Date().toISOString(), text: message.slice(0, 300) }].slice(-30))
  window.dispatchEvent(new Event(NOTICE_ERRORS))
}
