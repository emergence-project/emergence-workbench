import { t } from './i18n.js'

/**
 * 바깥 서버에 닿지 못한 오류인가. Node의 fetch는 연결이 안 되면 까닭을 cause에 넣고 "fetch failed"만 던진다.
 * 서버의 버그가 아니므로 500 대신 502와 읽을 수 있는 말로 바꾼다(오류 처리기, app.ts).
 */
export function isUnreachable(err: unknown): err is TypeError {
  return err instanceof TypeError && err.message === 'fetch failed'
}

/** "arxiv.org에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요" (어디인지 모르면 이름 없이) */
export function unreachableMessage(err: unknown): string {
  const cause = (err as { cause?: { hostname?: unknown; code?: unknown } } | null)?.cause
  const host = typeof cause?.hostname === 'string' ? cause.hostname : ''
  return host
    ? t(`${host}에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요`, `Could not reach ${host}. Check the internet connection`)
    : t('바깥 서버에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요', 'Could not reach the outside server. Check the internet connection')
}
