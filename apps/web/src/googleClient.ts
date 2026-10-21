/**
 * 구글 클라이언트 넣기를 쉽게 (10/22 피드백 "구글 클라이언트 등록 과정을 더 편하게"):
 * Google Cloud에서 받은 JSON(client_secret_….json)을 그대로 붙여 넣거나 파일로 고르면 ID와 비밀번호를 꺼낸다.
 */
export function parseGoogleClient(text: string): { id: string; secret: string } | null {
  try {
    const doc = JSON.parse(text) as Record<string, { client_id?: unknown; client_secret?: unknown } | undefined>
    const c = doc.installed ?? doc.web
    if (typeof c?.client_id === 'string' && typeof c.client_secret === 'string' && c.client_id.trim() && c.client_secret.trim()) return { id: c.client_id.trim(), secret: c.client_secret.trim() }
  } catch { /* JSON이 아니면 ID만 붙여 넣은 것 */ }
  return null
}
