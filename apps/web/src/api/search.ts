// ---------- 전역 검색 (서버 search.ts) ----------
import type { SearchCatalog } from '@rw/core/contract/search'
import { json, req } from './http'

export type { SearchItem } from '@rw/core/contract/search'

export const searchApi = {
  /** 검색 창을 열 때 한 번: 모든 프로젝트의 노트 이름, 문헌노트, 사람. library: 공유 라이브러리가 있어 개념노트를 찾을 수 있는지 */
  catalog: () => req('/api/search/catalog').then((r) => json<SearchCatalog>(r)),
}
