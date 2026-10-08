import { DEFAULT_UI, normalizeUi, type UiSettings } from '@rw/core'
import { useSyncExternalStore } from 'react'
import type { PaintColor } from './api/papers'

/**
 * 화면 설정을 문서 맨 위(<html>)에 입힌다. 색·크기는 tokens.css가 이 표시를 보고 정한다.
 *   data-theme      light | dark (없으면 시스템을 따름)
 *   data-accent     강조 색 (기본 흑백이면 없음)
 *   --ui-scale      글자 크기 배율
 *   --density       여백 배율
 *   --editor-*      LaTeX 편집기 글꼴·크기·줄 간격
 * 설정의 정본은 서버의 config.yaml이다. 여기서는 첫 화면이 번쩍이지 않게 이 브라우저에 사본만 둔다.
 */
const CACHE = 'rw-ui'
const UI_CHANGED = 'rw-ui-changed'
let appliedUi: UiSettings | undefined

export const FONT_SCALE: Record<UiSettings['fontSize'], number> = { small: 0.92, normal: 1, large: 1.1 }
export const DENSITY: Record<UiSettings['density'], number> = { compact: 0.72, normal: 1, comfortable: 1.25 }
export const EDITOR_FONT: Record<UiSettings['editorFont'], string> = {
  menlo: 'Menlo, monospace',
  monaco: 'Monaco, Menlo, monospace',
  'noto-mono': '"Noto Sans Mono", Menlo, monospace',
  courier: '"Courier New", Courier, monospace',
}

export function applyUi(ui: UiSettings): void {
  appliedUi = ui
  const root = document.documentElement
  if (ui.theme === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', ui.theme)
  if (ui.accent === 'mono') root.removeAttribute('data-accent')
  else root.setAttribute('data-accent', ui.accent)
  root.style.setProperty('--ui-scale', String(FONT_SCALE[ui.fontSize]))
  root.style.setProperty('--density', String(DENSITY[ui.density]))
  root.style.setProperty('--editor-font', EDITOR_FONT[ui.editorFont])
  root.style.setProperty('--editor-size', `${ui.editorSize}px`)
  root.style.setProperty('--editor-lh', String(ui.editorLineHeight))
  try { localStorage.setItem(CACHE, JSON.stringify(ui)) } catch { /* 무시 */ }
  window.dispatchEvent(new Event(UI_CHANGED))
}

function subscribeUi(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === CACHE || event.key === null) { appliedUi = undefined; onChange() }
  }
  window.addEventListener(UI_CHANGED, onChange)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(UI_CHANGED, onChange)
    window.removeEventListener('storage', onStorage)
  }
}

/** 열린 노트·PDF도 설정에서 바꾼 처음 색을 곧바로 따른다. */
export function useHighlightColor(): PaintColor {
  return useSyncExternalStore(subscribeUi, () => (appliedUi ?? cachedUi()).highlightColor, () => DEFAULT_UI.highlightColor)
}

export function cachedUi(): UiSettings {
  try {
    const raw = localStorage.getItem(CACHE)
    if (raw) return normalizeUi(JSON.parse(raw))
    // 예전 테마 기록(rw-theme)을 이어받는다
    const old = localStorage.getItem('rw-theme')
    if (old) return normalizeUi({ theme: JSON.parse(old) ?? 'system' })
  } catch { /* 무시 */ }
  return DEFAULT_UI
}
