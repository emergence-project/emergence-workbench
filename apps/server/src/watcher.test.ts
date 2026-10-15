import { describe, expect, it } from 'vitest'
import { classify } from './watcher.js'

const wb = '/r/workbench'

describe('감시 대상 가리기', () => {
  it('매크로 파일은 서식(preamble)으로, 그림과 받아 둔 PDF는 sources로 알린다 (10/15: 전에는 알림이 없어 화면이 낡았다)', () => {
    expect(classify(wb, `${wb}/macros.tex`)).toEqual({ type: 'preamble' })
    expect(classify(wb, `${wb}/preamble.tex`)).toEqual({ type: 'preamble' })
    expect(classify(wb, `${wb}/figures/ring.svg`)).toEqual({ type: 'sources' })
    expect(classify(wb, `${wb}/figures/figures.yaml`)).toEqual({ type: 'sources' })
    expect(classify(wb, `${wb}/materials/smith2020.pdf`)).toEqual({ type: 'sources' })
  })
  it('숨김 파일과 모르는 파일은 알리지 않는다', () => {
    expect(classify(wb, `${wb}/figures/.DS_Store`)).toBeNull()
    expect(classify(wb, `${wb}/figures`)).toBeNull()
    expect(classify(wb, `${wb}/README.md`)).toBeNull()
  })
})
