/** 화면 밖으로 스크롤된 것은 허용하고, 숨겨진 탭이나 제거된 페이지는 제외한다. */
export function isDialogHostDisplayed(host: {
  isConnected: boolean
  checkVisibility?: (options?: CheckVisibilityOptions) => boolean
  getClientRects(): { length: number }
} | null): boolean {
  if (!host?.isConnected) return false
  return host.checkVisibility
    ? host.checkVisibility({ checkVisibilityCSS: true })
    : host.getClientRects().length > 0
}
