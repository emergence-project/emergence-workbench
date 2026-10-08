/** Reuse the app's notification and undo action from nested document views. */
export type FlashAction = { label: string; run(): void }
export const FLASH_EVENT = 'rw:flash'
export interface FlashMessage { message: string; action?: FlashAction }

export function flash(message: string, action?: FlashAction): void {
  window.dispatchEvent(new CustomEvent<FlashMessage>(FLASH_EVENT, { detail: { message, action } }))
}
