import { lang, onWindows, t } from '../i18n'
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
    // Windows has no .command launcher or terminal habit: the installed app starts its own server
    if (onWindows) throw new Error(t('앱 서버에 연결할 수 없습니다. 서버가 꺼져 있을 수 있습니다 — 앱을 닫았다가 다시 열어 주세요. 적던 내용은 그대로 남아 있습니다.', 'Cannot reach the app server. It may be stopped: close the app and open it again. What you were writing is kept.'))
    throw new Error(t('앱 서버에 연결할 수 없습니다. 서버가 꺼져 있을 수 있습니다 — scripts/연구 작업대 열기.command를 실행하거나 터미널에서 pnpm start. 적던 내용은 그대로 남아 있습니다.', 'Cannot reach the app server. It may be stopped: run scripts/연구 작업대 열기.command or `pnpm start` in a terminal. What you were writing is kept.'))
  }
}

/**
 * 응답 몸을 읽는다. 실패한 응답은 서버가 적은 까닭으로 던진다.
 * 성공한 응답인데 몸을 읽지 못하면(받는 중에 서버가 다시 시작하거나 연결이 끊김) 빈 값을 돌려주지 않고 던진다:
 * 빈 값은 화면이 없는 칸을 읽다가 죽게 한다 (11/21).
 */
export async function json<T>(res: Response): Promise<T> {
  const body: unknown = await res.json().catch(() => undefined)
  const got = typeof body === 'object' && body !== null ? body as { currentHash?: string; error?: string } : {}
  if (res.status === 409 && got.currentHash !== undefined) throw new ConflictError(got.currentHash)
  if (!res.ok) throw new Error(got.error ?? t(`요청 실패 (${res.status})`, `Request failed (${res.status})`))
  if (body === undefined) throw new Error(t('서버의 답을 끝까지 받지 못했습니다. 다시 해 보세요.', 'The server\'s answer did not arrive in full. Try again.'))
  return body as T
}

export const enc = encodeURIComponent

export const send = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})
