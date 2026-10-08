import fs from 'node:fs'
import path from 'node:path'
import { buildExportMainTex, buildSettingTex, type Author, type LatexTemplate } from '@rw/core'
import { hashOf } from './fsutil.js'
import { isCompletePdf, runLatexmk, type Engine } from './latex.js'
import { LATEX_FILES_DIR, placeTemplateFiles } from './latexFiles.js'
import { t as tx } from './i18n.js'

/**
 * 서식 미리보기 (설정 › LaTeX › 서식 카드, 10/4 19:30 "라이브러리 카드를 만들고, 미리보기로 만들어").
 * 같은 예문을 서식마다 컴파일해 첫 쪽을 카드에 보인다. 서식·저자·스타일 파일이 그대로면 지난 PDF를 다시 쓴다.
 * 빌드는 앱 설정 폴더 아래(latex-previews/<서식>/)에서 하고 연구 파일은 건드리지 않는다.
 */

const SAMPLE_BODY = String.raw`\section{Introduction}
This page shows how a note looks in this template. Inline math such as
$H = J\sum_{\langle ij\rangle} \mathbf{S}_i\cdot\mathbf{S}_j - h\sum_i S_i^z$ sits in the text,
and displayed equations are numbered:
\begin{equation}
  \omega_{\mathbf{k}} = 2JS\sqrt{(1-\gamma_{\mathbf{k}})(1+\gamma_{\mathbf{k}})}, \qquad
  \gamma_{\mathbf{k}} = \frac{1}{z}\sum_{\boldsymbol{\delta}} e^{i\mathbf{k}\cdot\boldsymbol{\delta}} .
\end{equation}
\subsection{Results}
\begin{itemize}
  \item A first point, with a short sentence.
  \item A second point that runs a little longer so that the line wraps across the column.
\end{itemize}
Further text continues here to show paragraphs, spacing and the page header.`

const SAMPLE_SLIDES = String.raw`\begin{frame}{Introduction}
\begin{itemize}
  \item $H = J\sum_{\langle ij\rangle} \mathbf{S}_i\cdot\mathbf{S}_j$
  \item $\omega_{\mathbf{k}} = 2JS\sqrt{1-\gamma_{\mathbf{k}}^2}$
\end{itemize}
\end{frame}`

const SAMPLE_AUTHORS: Author[] = [{ name: 'First Author', affiliations: ['Department of Mathematics'] }, { name: 'Second Author', affiliations: ['Department of Mathematics'] }]
const running = new Map<string, Promise<PreviewResult>>()

export type PreviewResult = { ok: true; pdf: string } | { ok: false; error: string }

export function templatePreview(configDir: string, t: LatexTemplate, engine: Engine): Promise<PreviewResult> {
  const dir = path.join(configDir, 'latex-previews', t.id)
  const main = buildExportMainTex({ setup: t, authors: SAMPLE_AUTHORS, title: t.kind === 'slides' ? 'Template preview' : 'Template preview: a research note', body: t.kind === 'slides' ? SAMPLE_SLIDES : SAMPLE_BODY, date: '4 October 2026' })
  const setting = buildSettingTex(t)
  const files = (t.files ?? []).map((f) => { try { return fs.readFileSync(path.join(LATEX_FILES_DIR, f), 'utf8') } catch { return '' } })
  const key = hashOf([engine, main, setting, ...files].join('\n%%\n'))
  const pdf = path.join(dir, 'main.pdf')
  const stamp = path.join(dir, 'key.txt')
  const fresh = () => isCompletePdf(pdf) && fs.existsSync(stamp) && fs.readFileSync(stamp, 'utf8') === key
  if (fresh()) return Promise.resolve({ ok: true, pdf })
  const busy = running.get(dir)
  if (busy) return busy
  const job = (async (): Promise<PreviewResult> => {
    fs.rmSync(dir, { recursive: true, force: true })
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'main.tex'), main)
    fs.writeFileSync(path.join(dir, 'setting.tex'), setting)
    placeTemplateFiles(t, dir)
    const code = await runLatexmk(dir, [`-${engine}`, '-interaction=nonstopmode', '-f', '-e', '$max_repeat=2', 'main.tex'])
    if (code === -1 && !fs.existsSync(path.join(dir, 'main.log'))) return { ok: false, error: tx('TeX(latexmk)이 없어 미리보기를 만들지 못했습니다', 'Could not make the preview: TeX (latexmk) is not installed') }
    if (!isCompletePdf(pdf)) {
      const log = fs.existsSync(path.join(dir, 'main.log')) ? fs.readFileSync(path.join(dir, 'main.log'), 'utf8') : ''
      return { ok: false, error: /^! (.*)$/m.exec(log)?.[1] ?? tx('컴파일하지 못했습니다', 'Could not compile') }
    }
    fs.writeFileSync(stamp, key)
    return { ok: true, pdf }
  })().finally(() => running.delete(dir))
  running.set(dir, job)
  return job
}
