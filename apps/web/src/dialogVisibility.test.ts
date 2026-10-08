import { describe, expect, it } from 'vitest'
import { isDialogHostDisplayed } from './dialogVisibility'

describe('고치기 창의 호스트 표시 여부', () => {
  it('호스트가 없거나 문서에서 제거되면 숨긴다', () => {
    expect(isDialogHostDisplayed(null)).toBe(false)
    expect(isDialogHostDisplayed({ isConnected: false, checkVisibility: () => true, getClientRects: () => [{}] })).toBe(false)
  })
  it('탭을 숨겼다가 돌아오면 같은 호스트의 현재 표시 상태를 따른다', () => {
    let displayed = true
    const host = { isConnected: true, checkVisibility: () => displayed, getClientRects: () => [{}] }
    expect(isDialogHostDisplayed(host)).toBe(true)
    displayed = false
    expect(isDialogHostDisplayed(host)).toBe(false)
    displayed = true
    expect(isDialogHostDisplayed(host)).toBe(true)
  })
  it('visibility로 숨긴 호스트도 검사하고, 상자가 남아 있어도 숨긴다', () => {
    const host = {
      isConnected: true,
      checkVisibility: (options?: CheckVisibilityOptions) => !options?.checkVisibilityCSS,
      getClientRects: () => [{}],
    }
    expect(isDialogHostDisplayed(host)).toBe(false)
  })
  it('checkVisibility가 없는 브라우저에서는 렌더링 상자가 없는 탭을 숨긴다', () => {
    expect(isDialogHostDisplayed({ isConnected: true, getClientRects: () => [] })).toBe(false)
  })
  it('스크롤로 화면 밖에 있는 호스트는 표시된 페이지로 본다', () => {
    expect(isDialogHostDisplayed({ isConnected: true, getClientRects: () => [{ top: -1000, bottom: -996 }] })).toBe(true)
  })
})
