import { describe, expect, it } from 'vitest'
import { renderNote, renderNoteFigure } from './noteRender'

describe('shared read and split note renderer', () => {
  it('uses whole-document numbering with resolved references and no KaTeX label error', () => {
    const html = renderNote(String.raw`See \eqref{b}.

$$\begin{equation}a=1\label{a}\end{equation}$$

$$\begin{equation}b=2\label{b}\end{equation}$$`, {})
    expect(html).toContain('See (2).')
    expect(html).not.toContain('katex-error')
    expect(html).not.toContain('\\label')
    expect(html.match(/class="katex-tag"/g)).toHaveLength(2)
  })

  it('wraps only the section numbers the app adds, so a selected heading still maps to the source', () => {
    const html = renderNote('## Notation and Conventions\n\nText.\n\n## 3. Own number\n\n```\n## not a heading\n```\n\n### Sub', {})
    expect(html).toMatch(/<h2[^>]*><span class="md-secno">1<\/span> Notation and Conventions<\/h2>/)
    expect(html).toMatch(/<h2[^>]*>3\. Own number<\/h2>/)
    expect(html).toMatch(/<h3[^>]*><span class="md-secno">2\.1<\/span> Sub<\/h3>/)
  })

  it('keeps figures, footnotes and citation numbers consistent with the current draft', () => {
    const html = renderNote('[@new] [@old]\n\n![caption](parts.svg)\n\nText^[footnote]. <!-- hidden -->', { cite: () => '99' }, (name) => `/asset/${name}`)
    expect(html).toContain('>[1]</a>')
    expect(html).toContain('>[2]</a>')
    expect(html).toContain('src="/asset/parts.svg"')
    expect(html).toContain('<b>그림 1.</b>')
    expect(html).toContain('<sup class="md-fn" title="footnote">1</sup>')
    expect(html).toContain('<ol class="md-fns"><li>footnote</li></ol>')
    expect(html).not.toContain('hidden')
  })

  it('uses a compact file widget for PDF figures only during live editing', () => {
    const figure = { n: '1', file: 'figure.pdf', caption: 'caption' }
    expect(renderNoteFigure(figure, {}, (name) => `/asset/${name}`)).toContain('<canvas')
    const live = renderNoteFigure(figure, {}, (name) => `/asset/${name}`, true)
    expect(live).not.toContain('<canvas')
    expect(live).toContain('md-fig-missing')
    expect(live).toContain('figure.pdf')
    expect(live).toContain('그림 1.')
  })

  it('finds a figure paragraph target in the figure library: bare names there, file names in the note folder first', () => {
    const figure = (name: string) => (name === 'disk' ? { url: '/lib/disk.pdf', pdf: true } : name === 'ring' ? { url: '/lib/ring.png', pdf: false } : undefined)
    const html = renderNote('![원판 \\label{fig: d}](disk)\n\n![고리](ring)\n\n![로컬](local.png)\n\n그림 \\ref{fig: d}', { figure }, (name) => `/asset/${name}`)
    expect(html).toContain('<canvas class="md-fig-pdf" data-src="/lib/disk.pdf"')
    expect(html).toContain('<img src="/lib/ring.png"')
    expect(html).toContain('<img src="/asset/local.png"')
    expect(html).toContain('<b>그림 1.</b> 원판')
    expect(html).toContain('그림 1</p>')
  })
})
