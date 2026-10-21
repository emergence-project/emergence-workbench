import { describe, expect, it } from 'vitest'
import { parseGoogleClient } from './googleClient'

describe('구글 클라이언트 JSON', () => {
  it('데스크톱 앱(installed) · 웹(web) JSON에서 ID와 비밀번호를 꺼내고, 아니면 null', () => {
    expect(parseGoogleClient('{"installed":{"client_id":"1-a.apps.googleusercontent.com","client_secret":"s"}}')).toEqual({ id: '1-a.apps.googleusercontent.com', secret: 's' })
    expect(parseGoogleClient('{"web":{"client_id":"x","client_secret":"y"}}')).toEqual({ id: 'x', secret: 'y' })
    expect(parseGoogleClient('1-a.apps.googleusercontent.com')).toBeNull()
    expect(parseGoogleClient('{"installed":{"client_id":"x"}}')).toBeNull()
  })
})
