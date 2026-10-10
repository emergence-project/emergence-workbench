/**
 * 전역 검색 API의 계약 (서버 routes/search.ts · 화면 api/search.ts).
 */
import { z } from 'zod'

/** 검색 창이 고를 수 있는 것 하나. 화면은 kind로 주소를 만든다. 개념노트(Markdown)는 개념노트 색인에서 따로 찾는다 */
export const SearchItem = z.object({
  kind: z.enum(['project', 'card', 'note', 'part', 'block', 'statement', 'paper', 'concept', 'person']),
  id: z.string(),
  title: z.string(),
  /** 이름 말고도 찾는 글 (다른 이름, 파일 이름, 저자, 소속) */
  also: z.string().optional(),
  /** 속한 프로젝트 */
  rid: z.string().optional(),
  project: z.string().optional(),
  /** 장·노트의 파일 (저장소 기준 경로) */
  file: z.string().optional(),
  /** 노트 구분 (원고·연구노트·계산 노트) */
  noteKind: z.enum(['paper', 'note', 'calc']).optional(),
}).strict()

/** GET /search/catalog. library: 공유 라이브러리가 있어 개념노트를 찾을 수 있는지 */
export const SearchCatalog = z.object({ items: z.array(SearchItem), library: z.boolean() }).strict()

export type SearchItem = z.infer<typeof SearchItem>
export type SearchCatalog = z.infer<typeof SearchCatalog>
