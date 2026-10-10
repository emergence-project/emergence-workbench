/**
 * 네트워킹 API의 계약 (앱 설정 config.yaml의 people:·authors:, 서버 routes/network.ts · 화면 api/network.ts).
 */
import { z } from 'zod'
import type { Person as PersonType } from '../people.js'

export const PersonView = z.object({
  id: z.string(),
  name: z.string(),
  aliases: z.array(z.string()),
  note: z.string().optional(),
  /** 저자와 소속에 있는 사람 (그쪽에서 고친다) */
  author: z.boolean(),
  affiliations: z.array(z.string()),
  /** 소속 줄에서 뽑은 기관 이름 */
  orgs: z.array(z.string()),
  /** 연구 분야 이름표 */
  tags: z.array(z.string()),
  /** 저자와 소속의 이메일 */
  email: z.string().optional(),
  /** 그 밖의 이메일 */
  emails: z.array(z.string()),
  /** 네트워킹에서 더한 사람 */
  added: z.boolean(),
  star: z.boolean(),
  homepage: z.string().optional(),
}).strict()

export const PersonPaper = z.object({
  key: z.string(),
  title: z.string().optional(),
  author: z.string().optional(),
  year: z.string().optional(),
  journal: z.string().optional(),
  eprint: z.string().optional(),
  doi: z.string().optional(),
  /** 이 논문이 있는 곳: 공유 라이브러리 references.bib, 프로젝트 bib */
  where: z.array(z.object({ rid: z.string().optional(), title: z.string() }).strict()),
}).strict()

/** 등록 추천 한 사람: 참고 문헌(bib)에서 알 수 있는 것만 (보통 저자 이름뿐이라 소속·이메일은 없다) */
export const PersonSuggestion = z.object({
  name: z.string(),
  count: z.number(),
  aliases: z.array(z.string()).optional(),
  /** 가장 최근 논문 */
  latest: z.object({ title: z.string().optional(), year: z.string().optional() }).strict().optional(),
  /** 그 논문들이 있는 곳 (공유 라이브러리, 프로젝트 이름) */
  where: z.array(z.string()),
}).strict()

export const Coauthor = z.object({ id: z.string(), name: z.string(), count: z.number() }).strict()

/** GET /network, PUT /network/people */
export const PeopleList = z.object({ people: z.array(PersonView) }).strict()
export const PersonSuggestions = z.object({ suggestions: z.array(PersonSuggestion) }).strict()
/** GET /network/people/:id */
export const PersonPage = z.object({ person: PersonView, papers: z.array(PersonPaper), coauthors: z.array(Coauthor) }).strict()

// ---------- 요청 ----------
// 길이·개수 제한과 빈 이름은 @rw/core normalizePeople이 정리한다.

/** 네트워킹에서 더한 사람 (config.yaml의 people: 한 항목) */
export const Person = z.object({
  name: z.string(),
  aliases: z.array(z.string()).optional(),
  note: z.string().optional(),
  tags: z.array(z.string()).optional(),
  star: z.boolean().optional(),
  affiliations: z.array(z.string()).optional(),
  email: z.string().optional(),
  emails: z.array(z.string()).optional(),
  homepage: z.string().optional(),
}) satisfies z.ZodType<PersonType>
export const SavePeopleBody = z.object({ people: z.array(Person) })

export type PersonView = z.infer<typeof PersonView>
export type PersonPaper = z.infer<typeof PersonPaper>
export type PersonSuggestion = z.infer<typeof PersonSuggestion>
export type Coauthor = z.infer<typeof Coauthor>
export type PeopleList = z.infer<typeof PeopleList>
export type PersonSuggestions = z.infer<typeof PersonSuggestions>
export type PersonPage = z.infer<typeof PersonPage>
export type SavePeopleBody = z.input<typeof SavePeopleBody>
