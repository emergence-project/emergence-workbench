/**
 * 이 서버는 맥 안(127.0.0.1)에서만 쓰는 로컬 서버다. 브라우저에 열린 아무 웹 페이지가
 * 이 서버로 요청을 보내거나(본문 없는 POST: 앱 업데이트·백업·피드백 올리기 등),
 * DNS를 이 맥으로 돌려 API를 읽고 쓰는 것(DNS rebinding)을 막는다.
 *
 * - Host: localhost · 127.0.0.1 · [::1]과 extra(RW_ALLOWED_HOSTS, 쉼표로)만 받는다.
 * - Origin이 있으면(다른 사이트의 fetch·form·WebSocket은 늘 보낸다) 호스트와 포트까지 Host와 같아야 한다.
 *   같은 컴퓨터의 다른 포트(다른 개발 서버, Jupyter 등)에서 연 페이지도 다른 출처다.
 *   같은 화면에서 보낸 요청과 주소창·img로 연 GET은 그대로 지나간다.
 */
const LOCAL = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

function hostnameOf(hostHeader: string): string {
  const h = hostHeader.trim().toLowerCase()
  if (h.startsWith('[')) return h.slice(0, h.indexOf(']') + 1)
  return h.split(':')[0]!
}

export function allowedRequest(headers: { host?: string; origin?: string; site?: string; mode?: string }, extra: string[] = []): boolean {
  const ok = (name: string) => LOCAL.has(name) || extra.includes(name)
  if (!headers.host || !ok(hostnameOf(headers.host))) return false
  // 다른 사이트·다른 포트의 <img>·fetch(Origin 없는 GET 포함)는 막고, 링크를 눌러 여는 것(navigate)만 받는다
  if ((headers.site === 'cross-site' || headers.site === 'same-site') && headers.mode !== 'navigate') return false
  if (headers.origin === undefined) return true
  if (headers.origin === 'null') return false
  try {
    const origin = new URL(headers.origin)
    return origin.host === new URL(`${origin.protocol}//${headers.host.trim()}`).host
  } catch { return false }
}

export const extraHosts = (env = process.env.RW_ALLOWED_HOSTS): string[] =>
  (env ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)

/**
 * API가 내보내는 파일 응답에 붙이는 머리. 모두 nosniff, 스크립트를 품을 수 있는 종류(SVG·HTML·XML)는 스크립트를 막는다.
 * 받은(clone) 저장소의 SVG를 새 탭에서 열면 앱 주소에서 돌아 API를 모두 쓸 수 있기 때문이다. PDF·그림·JSON은 그대로 둔다.
 */
export function fileResponseHeaders(contentType: unknown): Record<string, string> {
  const type = String(contentType ?? '').toLowerCase()
  const scriptable = /svg|html|xml/.test(type)
  return { 'x-content-type-options': 'nosniff', ...(scriptable && { 'content-security-policy': "script-src 'none'" }) }
}
