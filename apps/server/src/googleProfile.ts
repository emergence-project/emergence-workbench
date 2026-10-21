import fs from 'node:fs'
import path from 'node:path'
import { personId, type Author } from '@rw/core'
import type { Google } from './google.js'
import { photoFile, photoStamp } from './peoplePapers.js'
import type { Registry } from './registry.js'

/** 채운 칸 (화면이 이름으로 바꿔 보인다) */
export type FilledItem = 'name' | 'email' | 'photo'

/**
 * 구글 로그인 때 내 정보를 채운다 (10/22 "구글 로그인을 할 때 개인정보도 자동으로", "네트워크에도 연구자로 자동 등록").
 * 저자와 소속(authors)에 나를 둔다: 원고 저자 · 코멘트 작성자 · 네트워킹 내 페이지(저자는 네트워킹 사람으로 저절로 들어온다)가 이것을 읽는다.
 * 비어 있는 칸만 채우고 사용자가 적은 값은 바꾸지 않는다. 소속은 구글이 주지 않으므로 그대로 둔다.
 * 커밋 이름 · 이메일(git 전체 설정)은 이 컴퓨터 전체에 걸리므로 저절로 바꾸지 않고, 시작 준비에서 "구글 계정으로 채우기"를 보인다.
 */
export function mergeGoogleAuthor(authors: Author[], profile: { name?: string; email?: string }): { authors: Author[]; me: Author | null; items: FilledItem[] } {
  const email = profile.email?.trim()
  const name = profile.name?.trim()
  const mail = email?.toLowerCase()
  const byMail = mail ? authors.find((a) => [a.email, ...(a.emails ?? [])].some((m) => m?.toLowerCase() === mail)) : undefined
  if (byMail) return { authors, me: byMail, items: [] }
  if (!name) return { authors, me: null, items: [] }
  const byName = authors.find((a) => personId(a.name) === personId(name))
  if (byName) {
    if (!email) return { authors, me: byName, items: [] }
    const next: Author = byName.email ? { ...byName, emails: [...(byName.emails ?? []), email] } : { ...byName, email }
    return { authors: authors.map((a) => (a === byName ? next : a)), me: next, items: ['email'] }
  }
  // 저자에 없으면 맨 앞에 (저자가 여럿이면 첫 사람이 "나"로 읽힌다)
  const me: Author = { name, ...(email && { email }), affiliations: [] }
  return { authors: [me, ...authors], me, items: email ? ['name', 'email'] : ['name'] }
}

export async function fillFromGoogle(registry: Registry, google: Google): Promise<FilledItem[]> {
  const profile = google.profile()
  const { authors, me, items } = mergeGoogleAuthor(registry.authors, profile)
  if (items.length) registry.setAuthors(authors)
  if (me && profile.picture && !photoStamp(registry.configDir, personId(me.name))) {
    const img = await google.picture(profile.picture)
    if (img) {
      const file = photoFile(registry.configDir, personId(me.name))
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(file, img)
      items.push('photo')
    }
  }
  if (items.length) google.noteFilled(items)
  return items
}
