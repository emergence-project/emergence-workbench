// ---------- 전역 검색 (서버 search.ts) ----------
import { json, req } from './http'

/** 검색 창이 고를 수 있는 것 하나 (서버 search.ts의 SearchItem). 개념노트(Markdown)는 개념노트 색인에서 따로 찾는다 */
export interface SearchItem {
  kind: 'project' | 'card' | 'note' | 'part' | 'block' | 'statement' | 'paper' | 'concept' | 'person'
  id: string
  title: string
  also?: string
  rid?: string
  project?: string
  file?: string
  noteKind?: 'paper' | 'note' | 'calc'
}

export const searchApi = {
  /** 검색 창을 열 때 한 번: 모든 프로젝트의 노트 이름, 문헌노트, 사람. library: 공유 라이브러리가 있어 개념노트를 찾을 수 있는지 */
  catalog: () => req('/api/search/catalog').then((r) => json<{ items: SearchItem[]; library: boolean }>(r)),
}
