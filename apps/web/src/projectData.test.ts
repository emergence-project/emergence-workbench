import { describe, expect, it } from 'vitest'
import { fill } from './projectData'

describe('프로젝트 자료 읽기', () => {
  it('프로젝트를 옮긴 뒤 늦게 온 앞 응답은 버린다', async () => {
    const seen: string[] = []
    let answerOld!: (v: string) => void
    const stopOld = fill(() => new Promise<string>((r) => { answerOld = r }), (v) => seen.push(v), '없음')
    stopOld() // 다른 프로젝트로 옮김
    fill(() => Promise.resolve('새 프로젝트'), (v) => seen.push(v), '없음')
    answerOld('앞 프로젝트')
    await new Promise((r) => setTimeout(r, 0))
    expect(seen).toEqual(['새 프로젝트'])
  })
  it('실패하면 기본값을 넣는다', async () => {
    const seen: string[] = []
    fill(() => Promise.reject(new Error('x')), (v) => seen.push(v), '없음')
    await new Promise((r) => setTimeout(r, 0))
    expect(seen).toEqual(['없음'])
  })
})
