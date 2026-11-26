import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PictureGallery } from './PictureGallery'

const pic = (name: string) => ({ src: `/p/${name}.png`, label: name, alt: `${name} 그림` })

describe('그림 크게 보기', () => {
  // 그림 수가 줄면(시안을 뺌 · 처리가 바뀜) 보던 자리가 목록 밖이 된다: 전에는 아무것도 그리지 않아 창이 사라진 채 열려 있었다 (← → · Esc만 먹음)
  it('보던 자리가 그림 수를 넘으면 마지막 그림을 보인다', () => {
    const html = renderToStaticMarkup(<PictureGallery pictures={[pic('가'), pic('나')]} start={5} onClose={() => {}} />)
    expect(html).toContain('/p/나.png')
    expect(html).toContain('2/2')
  })
  it('자리 안이면 그 그림을 그대로 보인다', () => {
    const html = renderToStaticMarkup(<PictureGallery pictures={[pic('가'), pic('나')]} start={0} onClose={() => {}} />)
    expect(html).toContain('/p/가.png')
    expect(html).toContain('1/2')
  })
})
