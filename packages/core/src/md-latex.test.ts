import { describe, expect, it } from 'vitest'
import { inlineToLatex, markdownToLatex, stripMdFrontMatter, tableCells } from './md-latex.js'

describe('markdownToLatex', () => {
  it('머리말을 빼고 제목·문단·수식을 바꾼다', () => {
    const out = markdownToLatex('---\nid: a\n---\n## 목표\n\n$H = J S_i \\cdot S_j$ 를 구한다.\n\n$$\nE_0 = -\\frac{3}{4}J\n$$\n')
    expect(out).toBe('\\section{목표}\n\n$H = J S_i \\cdot S_j$ 를 구한다.\n\n\\[\nE_0 = -\\frac{3}{4}J\n\\]\n')
  })
  it('align 환경은 그대로', () => {
    expect(markdownToLatex('$$\n\\begin{align}\na &= b\n\\end{align}\n$$')).toBe('\\begin{align}\na &= b\n\\end{align}\n')
  })
  it('특수 문자를 막고 굵게·기울임·코드·링크·인용', () => {
    expect(inlineToLatex('100% & a_b #1 **굵게** *기울임* `x_1` [[Euler characteristic|오일러]] [@ex2022; @sample2021] [see @a, p. 3]'))
      .toBe('100\\% \\& a\\_b \\#1 \\textbf{굵게} \\emph{기울임} \\texttt{x\\_1} 오일러 \\cite{ex2022,sample2021} \\cite[p.~3]{a}')
  })
  it('목록과 들여쓴 목록', () => {
    expect(markdownToLatex('1. 하나\n2. 둘\n   - 가\n   - 나\n3. 셋')).toBe('\\begin{enumerate}\n\\item 하나\n\\item 둘\n\\begin{itemize}\n\\item 가\n\\item 나\n\\end{itemize}\n\\item 셋\n\\end{enumerate}\n')
  })
  it('Proof … ∎ 는 proof 환경', () => {
    expect(markdownToLatex('**Proof.** 자명하다.\n∎')).toBe('\\begin{proof}\n자명하다.\n\\end{proof}\n')
  })
  it('표와 코드 블록', () => {
    expect(markdownToLatex('| a | b |\n| --- | --- |\n| 1 | $x$ |')).toContain('a & b \\\\\n\\hline\n1 & $x$ \\\\')
    expect(markdownToLatex('```\na_b % c\n```')).toBe('\\begin{verbatim}\na_b % c\n\\end{verbatim}\n')
  })
  it('한 줄 바꿈은 줄바꿈, 표시 수식 앞뒤는 그대로', () => {
    expect(markdownToLatex('첫 줄\n둘째 줄')).toBe('첫 줄\\\\\n둘째 줄\n')
    expect(markdownToLatex('앞 $$x$$\n뒤')).toBe('앞 \\[\nx\n\\]\n뒤\n')
  })
  it('stripMdFrontMatter', () => {
    expect(stripMdFrontMatter('---\na: 1\n---\n본문')).toBe('본문')
    expect(stripMdFrontMatter('본문\n---\n')).toBe('본문\n---\n')
  })
  it('번호와 참조는 LaTeX 그대로 (제목 끝 \label은 제목 밖으로, 글 속 \ref·\eqref)', () => {
    expect(markdownToLatex('## 증명 \\label{sec: proof}\n\n식 \\eqref{eq: a}와 그림 \\ref{fig: 1}을 본다.\n\n$$\n\\begin{equation}\na = b \\label{eq: a}\n\\end{equation}\n$$'))
      .toBe('\\section{증명}\\label{sec: proof}\n\n식 \\eqref{eq: a}와 그림 \\ref{fig: 1}을 본다.\n\n\\begin{equation}\na = b \\label{eq: a}\n\\end{equation}\n')
  })
  it('subequations는 그대로, \\appendix 한 줄도 그대로', () => {
    expect(markdownToLatex('$$\n\\begin{subequations}\n\\begin{align}\na &= b\n\\end{align}\n\\end{subequations}\n$$\n\n\\appendix\n\n## 부록'))
      .toBe('\\begin{subequations}\n\\begin{align}\na &= b\n\\end{align}\n\\end{subequations}\n\n\\appendix\n\n\\section{부록}\n')
  })
  it('그림만 있는 문단은 figure, 캡션 안의 수식·참조·[ ]도', () => {
    expect(markdownToLatex('앞\n\n![$J(A,B,C)$의 값. (a) 예 [@ex2022]. \\label{fig: 2}](Figure_2.pdf)\n\n뒤'))
      .toBe('앞\n\n\\begin{figure}[htbp]\n\\centering\n\\includegraphics[width=\\linewidth]{Figure_2.pdf}\n\\caption{$J(A,B,C)$의 값. (a) 예 \\cite{ex2022}. \\label{fig: 2}}\n\\end{figure}\n\n뒤\n')
    expect(markdownToLatex('![](a.pdf)')).toBe('\\begin{center}\n\\includegraphics[width=0.8\\linewidth]{a.pdf}\n\\end{center}\n')
  })
  it('그림 문단의 대상은 image 옵션이 그린 것으로, 못 찾으면 그 파일 이름 그대로', () => {
    const image = (target: string, width: string) => (target === 'disk' ? `\\includegraphics[width=${width}]{figure-library/library/disk.pdf}` : undefined)
    expect(markdownToLatex('![원판 \\label{fig: disk}](disk)\n\n![](local.png)', { image }))
      .toBe('\\begin{figure}[htbp]\n\\centering\n\\includegraphics[width=\\linewidth]{figure-library/library/disk.pdf}\n\\caption{원판 \\label{fig: disk}}\n\\end{figure}\n\n\\begin{center}\n\\includegraphics[width=0.8\\linewidth]{local.png}\n\\end{center}\n')
  })
  it('그림 처리 옵션이 없거나 이름을 못 찾으면 기존 그림 변환을 유지한다', () => {
    const src = '![[ original.png |320]]\n\n글 ![[unknown]] 끝'
    const expected = '\\includegraphics[width=0.8\\linewidth]{original.png}\n\n글 \\includegraphics[width=0.8\\linewidth]{unknown} 끝\n'
    expect(markdownToLatex(src)).toBe(expected)
    expect(markdownToLatex(src, {})).toBe(expected)
    expect(markdownToLatex(src, { figure: () => undefined })).toBe(expected)
  })
  it('그림 이름을 정리해 넘기고 돌려받은 LaTeX를 그대로 넣는다', () => {
    const names: string[] = []
    const out = markdownToLatex('![[ 도표 |320|left]]\n\n![[unknown]]', { figure: (name) => {
      names.push(name)
      return name === '도표' ? '\\begin{center}\\input{figure-library/project/plot.tikz}\\end{center}' : undefined
    } })
    expect(names).toEqual(['도표', 'unknown'])
    expect(out).toBe('\\begin{center}\\input{figure-library/project/plot.tikz}\\end{center}\n\n\\includegraphics[width=0.8\\linewidth]{unknown}\n')
  })
  it('제목·각주·인용문·목록·표·캡션에도 그림 처리 옵션을 전달한다', () => {
    const names: string[] = []
    const out = markdownToLatex('# ![[heading]]\n\n글^[![[footnote]]]\n\n> ![[quote]]\n\n- ![[list]]\n\n**표.** ![[caption]]\n\n| 그림 |\n| --- |\n| ![[cell]] |\n\n![![[figure-caption]]](local.png)', { figure: (name) => {
      names.push(name)
      return `\\fbox{${name}}`
    } })
    expect(names).toEqual(['heading', 'footnote', 'quote', 'list', 'caption', 'cell', 'figure-caption'])
    for (const name of names) expect(out).toContain(`\\fbox{${name}}`)
  })
  it('코드·수식·숨긴 메모 속 그림 표시는 처리하지 않는다', () => {
    const names: string[] = []
    const out = markdownToLatex('`![[code]]` $![[math]]$\n\n```\n![[fence]]\n```\n\n$$![[display]]$$\n\n<!-- ![[hidden]] -->\n![[visible]]', { figure: (name) => {
      names.push(name)
      return '\\fbox{visible}'
    } })
    expect(names).toEqual(['visible'])
    expect(out).toContain('\\texttt{![[code]]} $![[math]]$')
    expect(out).toContain('\\begin{verbatim}\n![[fence]]\n\\end{verbatim}')
    expect(out).toContain('\\[\n![[display]]\n\\]')
  })
  it('"**표.** 캡션" 뒤의 표는 table 환경', () => {
    expect(markdownToLatex('**표.** 기호 \\label{tab: n}\n\n| $a$ | 공 |\n|---|---|\n| $b$ | 고리 |'))
      .toBe('\\begin{table}[htbp]\n\\centering\n\\caption{기호 \\label{tab: n}}\n\\begin{tabular}{ll}\n\\hline\n$a$ & 공 \\\\\n\\hline\n$b$ & 고리 \\\\\n\\hline\n\\end{tabular}\n\\end{table}\n')
  })
  it('긴 글의 표는 짧은 열은 l, 긴 열은 폭을 나눈 p 열로 줄바꿈한다 (10/7 17:05)', () => {
    const md = '| 유형 | 뜻 | 예 |\n|---|---|---|\n| I | 면이 모두 삼각형인 평면 그래프로 색의 수를 센다. | 정이십면체, 바퀴, 팔면체, 지도 |'
    expect(markdownToLatex(md)).toContain('\\begin{tabular}{lp{0.49\\linewidth}p{0.31\\linewidth}}')
    expect(markdownToLatex('| a | b |\n|---|---|\n| 짧은 | 표 |')).toContain('\\begin{tabular}{ll}')
  })
  it('표 칸 안 수식 · 코드의 |는 칸 경계가 아니다 (10/8 11:30)', () => {
    expect(tableCells('| 절댓값 $|x|, |y|$ | K5 | `a|b` |')).toEqual(['절댓값 $|x|, |y|$', 'K5', '`a|b`'])
    expect(tableCells('| 필터 $|Y(\\omega)|^2$ | $\\|x\\|$ \\| y |')).toEqual(['필터 $|Y(\\omega)|^2$', '$\\|x\\|$ \\| y'])
    expect(tableCells('| 값 $5 | b |')).toEqual(['값 $5', 'b'])
    const md = '| 기호 | 뜻 |\n|---|---|\n| $|0\\rangle$ | 바닥 |'
    expect(markdownToLatex(md)).toContain('$|0\\rangle$ & 바닥 \\\\')
  })
  it('인용 뒤 쪽·절 표시는 무엇이든 \\cite[…]로 (§도)', () => {
    expect(inlineToLatex('[@doeCounting2017, §II.A] [@a; @b, Sec. 4]')).toBe('\\cite[§II.A]{doeCounting2017} \\cite[Sec.~4]{a,b}')
  })
  it('각주 ^[…]와 숨긴 메모', () => {
    expect(markdownToLatex('값은 $[-W/2, W/2]$이다^[범위 $[0,1]$ [@a] 참고.] 끝.\n<!-- 숨김\n여러 줄 -->\n다음 <!-- 안 보임 -->줄'))
      .toBe('값은 $[-W/2, W/2]$이다\\footnote{범위 $[0,1]$ \\cite{a} 참고.} 끝.\\\\\n다음 줄\n')
  })
})
