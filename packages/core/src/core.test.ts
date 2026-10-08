import { describe, expect, it } from 'vitest'
import { buildBlockMainTex, buildLibraryNoteMainTex, isValidBlockId, parseLatexErrors, parseSynctexEdit, parseSynctexView, refineSourceLine, titleToLatex, todoDue } from './index.js'

describe('isValidBlockId', () => {
  it('소문자·숫자·하이픈만 허용한다', () => {
    expect(isValidBlockId('kempe-chains')).toBe(true)
    expect(isValidBlockId('b2')).toBe(true)
    for (const bad of ['', 'Kempe', 'a_b', '../x', 'a--b', '-a', 'a-', 'a b', '한글']) {
      expect(isValidBlockId(bad)).toBe(false)
    }
  })
})

describe('buildLibraryNoteMainTex', () => {
  it('라이브러리 서식을 순서대로 불러온 뒤 노트를 넣고, 상대 경로는 라이브러리 기준으로 찾는다', () => {
    const tex = buildLibraryNoteMainTex({ library: '/lib', preambles: ['/lib/preamble/base.tex', '/lib/preamble/theorems.tex'], note: '/lib/concepts/x.tex' })
    const i = (s: string) => tex.indexOf(s)
    expect(tex).toContain('\\def\\input@path{{/lib/}}')
    expect(i('\\input{/lib/preamble/base.tex}')).toBeLessThan(i('\\input{/lib/preamble/theorems.tex}'))
    expect(i('\\input{/lib/preamble/theorems.tex}')).toBeLessThan(i('\\begin{document}'))
    expect(i('\\begin{document}')).toBeLessThan(i('\\input{/lib/concepts/x.tex}'))
    expect(() => buildLibraryNoteMainTex({ library: '/my lib', preambles: [], note: '/my lib/x.tex' })).toThrow()
    expect(tex).not.toContain('\\bibliography')
    const withBib = buildLibraryNoteMainTex({ library: '/lib', preambles: [], note: '/lib/concepts/x.tex', bib: '/lib/references.bib' })
    expect(withBib.indexOf('\\input{/lib/concepts/x.tex}')).toBeLessThan(withBib.indexOf('\\bibliography{/lib/references}'))
    expect(withBib.indexOf('\\bibliography{/lib/references}')).toBeLessThan(withBib.indexOf('\\end{document}'))
  })
})

describe('buildBlockMainTex', () => {
  const paths = { preamble: '/w/preamble.tex', block: '/w/blocks/b.tex', figures: '/w/figures' }

  it('서식 → 그림 경로 → 본문 순서로 불러온다', () => {
    const tex = buildBlockMainTex(paths)
    const i = (s: string) => tex.indexOf(s)
    expect(i('\\documentclass')).toBeLessThan(i('\\input{/w/preamble.tex}'))
    expect(i('\\input{/w/preamble.tex}')).toBeLessThan(i('\\graphicspath{{/w/figures/}}'))
    expect(i('\\graphicspath')).toBeLessThan(i('\\begin{document}'))
    expect(i('\\begin{document}')).toBeLessThan(i('\\input{/w/blocks/b.tex}'))
  })

  it('서식·블록 안의 상대 경로는 workbench 기준으로 찾게 한다', () => {
    const tex = buildBlockMainTex(paths)
    expect(tex).toContain('\\def\\input@path{{/w/}}')
    expect(tex.indexOf('\\input@path')).toBeLessThan(tex.indexOf('\\input{/w/preamble.tex}'))
  })

  it('라이브러리가 있으면 workbench 다음으로 라이브러리에서 찾는다', () => {
    expect(buildBlockMainTex({ ...paths, library: '/lib' })).toContain('\\def\\input@path{{/w/}{/lib/}}')
    expect(() => buildBlockMainTex({ ...paths, library: '/my lib' })).toThrow()
  })

  it('고른 서식과 앞머리를 쓰고 기존 프로젝트 서식과 경로를 유지한다', () => {
    const tex = buildBlockMainTex(paths, { template: { documentClass: '\\documentclass{report}', preamble: '\\input{setting}' }, front: ['Chosen title'] })
    expect(tex).toContain('\\documentclass{report}')
    expect(tex).not.toContain('\\documentclass[11pt]{article}')
    expect(tex.indexOf('\\input{setting}')).toBeLessThan(tex.indexOf('\\input{/w/preamble.tex}'))
    expect(tex.indexOf('\\begin{document}')).toBeLessThan(tex.indexOf('Chosen title'))
    expect(tex.indexOf('Chosen title')).toBeLessThan(tex.indexOf('\\input{/w/blocks/b.tex}'))
  })

  it('상대 경로와 LaTeX에서 깨지는 경로를 거부한다', () => {
    expect(() => buildBlockMainTex({ ...paths, block: 'blocks/b.tex' })).toThrow()
    expect(() => buildBlockMainTex({ ...paths, block: '/Mobile Documents/b.tex' })).toThrow()
    expect(() => buildBlockMainTex({ ...paths, block: '/w/100%.tex' })).toThrow()
  })
})

describe('parseLatexErrors', () => {
  it('파일:줄: 메시지 형식을 읽고 상대 경로를 절대 경로로 바꾼다', () => {
    const log = [
      'This is XeTeX',
      '/w/blocks/broken.tex:11: Undefined control sequence.',
      'l.11 여기에는 정의되지 않은 명령 \\undefinedmacro',
      './main.tex:2: LaTeX Error: Missing \\begin{document}.',
      '/w/blocks/broken.tex:11: Undefined control sequence.',
    ].join('\n')
    expect(parseLatexErrors(log, '/w/.build/broken')).toEqual([
      { file: '/w/blocks/broken.tex', line: 11, message: 'Undefined control sequence.' },
      { file: '/w/.build/broken/main.tex', line: 2, message: 'LaTeX Error: Missing \\begin{document}.' },
    ])
  })

  it('TeX가 스스로 고치고 넘어가는 오류(Infinite glue shrinkage)는 세지 않는다', () => {
    const log = ['./appendices/a.tex:418: Infinite glue shrinkage found in box being split.', './t.tex:130: Infinite glue shrinkage found on current page.', './x.tex:3: ignored error: something'].join('\n')
    expect(parseLatexErrors(log, '/w')).toEqual([])
  })
})

describe('synctex 출력', () => {
  it('view 결과에서 쪽과 상자를 읽는다', () => {
    const out = [
      'This is SyncTeX command line utility, version 1.5',
      'SyncTeX result begin',
      'Output:main.pdf',
      'Page:1', 'x:228.87', 'y:178.63', 'h:228.874268', 'v:134.848587', 'W:295.535156', 'H:11.367908',
      'before:', 'offset:-1', 'middle:', 'after:',
      'Output:main.pdf',
      'Page:2', 'x:1', 'y:2', 'h:10', 'v:20', 'W:30', 'H:5',
      'SyncTeX result end',
    ].join('\n')
    expect(parseSynctexView(out)).toEqual([
      { page: 1, h: 228.874268, v: 134.848587, width: 295.535156, height: 11.367908 },
      { page: 2, h: 10, v: 20, width: 30, height: 5 },
    ])
  })

  it('edit 결과에서 원고 파일과 줄을 읽는다', () => {
    const out = [
      'SyncTeX result begin',
      'Output:/w/.build/b/main.pdf',
      'Input:/w/blocks/kempe-chains.tex',
      'Line:19', 'Column:-1', 'Offset:0', 'Context:',
      'SyncTeX result end',
    ].join('\n')
    expect(parseSynctexEdit(out)).toEqual({ file: '/w/blocks/kempe-chains.tex', line: 19 })
  })

  it('결과가 없으면 비어 있다', () => {
    expect(parseSynctexView('SyncTeX ERROR: No file?')).toEqual([])
    expect(parseSynctexEdit('')).toBeNull()
  })
})

describe('refineSourceLine', () => {
  const source = [
    '\\section{Five-color lemma}',            // 1
    '',                                     // 2
    '두 상태 $\\rho_{ABC}$가 일치하고',      // 3
    '\\begin{equation}',                     // 4
    '  I(A:C|B) = 0',                        // 5
    '\\end{equation}',                       // 6
    '이면, 다음을 만족하는 합쳐진 상태가 존재한다.', // 7
    '\\begin{equation}',                     // 8
    '  \\tau = \\rho',                       // 9
    '\\end{equation}',                       // 10
    '% 이면, 주석 속 글자는 무시',             // 11
  ].join('\n')

  it('SyncTeX가 문단 끝 줄을 알려 줘도 누른 글자가 있는 줄로 옮긴다', () => {
    expect(refineSourceLine(source, 10, '이면, 다음을 만족하는')).toBe(7)
    expect(refineSourceLine(source, 10, '두 상태')).toBe(3)
  })

  it('공백 차이는 무시한다', () => {
    expect(refineSourceLine(source, 10, '합쳐진상태가')).toBe(7)
  })

  it('글자가 너무 짧거나 기호뿐이거나 못 찾으면 그대로 둔다', () => {
    expect(refineSourceLine(source, 10, 'ρ')).toBe(10)
    expect(refineSourceLine(source, 10, '(3.4)')).toBe(10)
    expect(refineSourceLine(source, 10, '어디에도 없는 문장')).toBe(10)
  })

  it('주석 속 글자는 찾지 않는다', () => {
    expect(refineSourceLine(source, 11, '주석 속 글자')).toBe(11)
  })
})

describe('titleToLatex', () => {
  it('특수문자를 글자로 바꾸고 $…$ 수식은 그대로 둔다', () => {
    expect(titleToLatex('J_Γ 50% & a#b ^ ~')).toBe('J\\_\\ensuremath{\\Gamma} 50\\% \\& a\\#b \\^{} \\textasciitilde{}')
    expect(titleToLatex('강성 $\\rho_{s}(T)$ 비교')).toBe('강성 $\\rho_{s}(T)$ 비교')
    expect(titleToLatex('가격 $5')).toBe('가격 \\$5')
  })
  it('그리스 문자와 첨자 숫자는 수식으로 (본문 글꼴에 없어 빠지는 것을 막는다)', () => {
    expect(titleToLatex('ρ(T), y₆, x²')).toBe('\\ensuremath{\\rho}(T), y\\ensuremath{_{6}}, x\\ensuremath{^{2}}')
    expect(titleToLatex('{a}\\b')).toBe('ab')
  })
})

describe('todoDue', () => {
  it('할 일 맨 앞의 마감 날짜를 읽는다', () => {
    expect(todoDue('10/20까지 — 핵심 공백 직접 유도', '2026-09-30')).toBe('2026-10-20')
    expect(todoDue('12/8 — 원문 대조', '2026-09-30')).toBe('2026-12-08')
    expect(todoDue('1/15까지 정리', '2026-09-30')).toBe('2027-01-15')
    expect(todoDue('2027-03-01까지 제출', '2026-09-30')).toBe('2027-03-01')
  })
  it('날짜로 시작하지 않거나 날짜가 아니면 null', () => {
    expect(todoDue('원고 문장 고치기 10/20까지', '2026-09-30')).toBeNull()
    expect(todoDue('3.14 근처 확인', '2026-09-30')).toBeNull()
    expect(todoDue('2/30까지', '2026-09-30')).toBeNull()
    expect(todoDue('1/2/3 비율', '2026-09-30')).toBeNull()
  })
})
