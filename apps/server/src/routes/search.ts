// 전역 검색 (제목줄의 돋보기, "/" 키)
import type { FastifyInstance } from 'fastify'
import * as C from '@rw/core/contract/search'
import { replies } from '../contract.js'
import { searchCatalog } from '../search.js'
import type { RouteContext } from './context.js'

export function registerSearch(app: FastifyInstance, ctx: RouteContext): void {
  const { registry } = ctx
  /** 검색 창을 열 때 한 번: 고를 수 있는 것의 이름 목록. 찾기는 화면에서 바로 한다 (개념노트 본문은 /api/concepts/list?q=) */
  app.get('/api/search/catalog', replies(C.SearchCatalog), async (): Promise<C.SearchCatalog> => ({ items: searchCatalog(registry, (await ctx.libraryReads.library()).notes), library: !!registry.libraryPath }))
}
