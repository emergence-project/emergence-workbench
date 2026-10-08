// 전역 검색의 목록 (10/4 19:33 피드백)
import { describe, expect, it } from 'vitest'
import { app, useSampleApp } from './testkit.js'

useSampleApp()

describe('전역 검색 목록', () => {
  it('프로젝트·보조 노트 이름과 네트워킹의 사람을 한 번에 내고, 파일은 바꾸지 않는다', async () => {
    await app.inject({ method: 'PUT', url: '/api/network/people', payload: { people: [{ name: 'Bea Sample', aliases: ['B. Sample'], tags: ['Planar graph coloring'] }] } })
    const res = await app.inject({ method: 'GET', url: '/api/search/catalog' })
    expect(res.json().library).toBe(false) // 예제 앱에는 공유 라이브러리가 없다
    expect(res.statusCode).toBe(200)
    const items = res.json().items as { kind: string; id: string; title: string; rid?: string; project?: string; also?: string }[]
    expect(items).toContainEqual(expect.objectContaining({ kind: 'project', id: 'sample-research', title: '예제 연구 — 5색 정리 재유도' }))
    expect(items).toContainEqual(expect.objectContaining({ kind: 'block', id: 'kempe-chains', rid: 'sample-research', project: '예제 연구 — 5색 정리 재유도' }))
    const person = items.find((x) => x.kind === 'person' && x.title === 'Bea Sample')
    expect(person).toMatchObject({ id: 'bea-sample' })
    expect(person?.also).toMatch(/B\. Sample/)
  })
})
