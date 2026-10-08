import { lang, t } from '../i18n'
/** 서버 호출의 공통 도우미 (api/*.ts가 함께 쓴다) */

export class ConflictError extends Error {
  constructor(readonly currentHash: string) { super(t('다른 곳에서 파일이 바뀌었음', 'The file was changed elsewhere')) }
}

/**
 * fetch가 응답조차 못 받으면(서버가 꺼짐) 브라우저는 "Failed to fetch"만 알려 준다.
 * 무엇을 하면 되는지 알 수 있는 말로 바꾼다.
 */
export async function req(input: string, init?: RequestInit): Promise<Response> {
  try {
    // The server answers messages in the screen language
    const headers = new Headers(init?.headers)
    headers.set('x-rw-lang', lang)
    return await fetch(input, { ...init, headers })
  } catch {
    throw new Error(t('앱 서버에 연결할 수 없습니다. 서버가 꺼져 있을 수 있습니다 — scripts/연구 작업대 열기.command를 실행하거나 터미널에서 pnpm start. 적던 내용은 그대로 남아 있습니다.', 'Cannot reach the app server. It may be stopped: run scripts/연구 작업대 열기.command or `pnpm start` in a terminal. What you were writing is kept.'))
  }
}

export async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}))
  if (res.status === 409 && 'currentHash' in body) throw new ConflictError((body as { currentHash: string }).currentHash)
  if (!res.ok) throw new Error((body as { error?: string }).error ?? t(`요청 실패 (${res.status})`, `Request failed (${res.status})`))
  return body as T
}

export const enc = encodeURIComponent

export const send = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})
