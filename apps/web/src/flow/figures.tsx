import { useRef, useState } from 'react'
import { figuresApi } from '../api/figures'
import { Icon } from '../icons'
import { useDismiss } from '../useDismiss'
import { t as tr } from '../i18n'

/** 그림 라이브러리가 받는 파일 (서버 figures.ts kindOf와 같은 확장자) */
export const FIGURE_FILE = /\.(png|jpe?g|svg|pdf|tikz|tex)$/i
const IMAGE_EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/svg+xml': 'svg', 'application/pdf': 'pdf' }

/**
 * 그림 하나를 이 프로젝트의 그림 폴더(workbench/figures/)에 올리고 파일 이름을 돌려준다.
 * 붙여 넣은 그림은 이름이 없거나 "image.png"라서 점 id와 시각으로 이름을 짓고, 같은 이름이 있으면 -2, -3 …을 붙인다.
 */
export async function uploadFigure(rid: string, dot: string, x: File, taken: Set<string>): Promise<string> {
  const pasted = !x.name || /^image\.(png|jpe?g)$/i.test(x.name)
  const ext = pasted ? IMAGE_EXT[x.type] ?? 'png' : x.name.replace(/^.*\./, '').toLowerCase()
  if (!FIGURE_FILE.test(`.${ext}`)) throw new Error(tr('그림은 png · jpg · svg · pdf · tikz 파일이어야 합니다', 'A figure must be a png · jpg · svg · pdf · tikz file'))
  const d = new Date()
  const p2 = (v: number) => String(v).padStart(2, '0')
  const stem = pasted ? `${dot}-${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`
    : x.name.replace(/\.[^.]+$/, '').replace(/[^\p{L}\p{N} ._()-]/gu, '-').slice(0, 100) || dot
  let name = `${stem}.${ext}`
  for (let i = 2; taken.has(name.toLowerCase()); i++) name = `${stem}-${i}.${ext}`
  await figuresApi.upload(new File([x], name, { type: x.type }), rid)
  return name
}

/** 설명 칸의 "그림 ▾": 컴퓨터에서 고르기 · 그림 라이브러리에서 고르기 (붙여넣기 · 끌어 놓기는 칸에서) */
export function FigureMenu({ figs, onPick, onFiles }: { figs: { id: string; file: string; name: string; scope: string }[]; onPick(file: string): void; onFiles(files: File[]): void }) {
  const [open, setOpen] = useState<false | 'menu' | 'library'>(false)
  const box = useRef<HTMLSpanElement>(null)
  const input = useRef<HTMLInputElement>(null)
  useDismiss(!!open, box, () => setOpen(false))
  return <span className={`fl-figmenu${open ? ' open' : ''}`} ref={box}>
    <button type="button" className={`btn sm${open ? ' on' : ''}`} data-ui="흐름 그림 넣기" aria-haspopup="menu" aria-expanded={!!open} onClick={() => setOpen(open ? false : 'menu')}>{Icon.image}{tr('그림', 'Figure')} ▾</button>
    <input ref={input} type="file" hidden multiple accept=".png,.jpg,.jpeg,.svg,.pdf,.tikz,.tex,image/*" onChange={(e) => { const xs = [...(e.target.files ?? [])]; e.target.value = ''; if (xs.length) onFiles(xs) }} />
    {open === 'menu' && <div className="menu fl-figmenu-pop" role="menu" data-ui="흐름 그림 메뉴">
      <button role="menuitem" onClick={() => { setOpen(false); input.current?.click() }}>{tr('컴퓨터에서 고르기…', 'Choose from computer…')}</button>
      <button role="menuitem" disabled={!figs.length} onClick={() => setOpen('library')}>{tr('그림 라이브러리에서 고르기…', 'Choose from figure library…')}</button>
      <p className="fl-figmenu-hint">{figs.length ? tr('붙여넣기(⌘V)와 끌어 놓기도 됩니다', 'You can also paste (⌘V) or drop') : tr('그림 라이브러리가 비어 있습니다. 붙여넣기(⌘V)와 끌어 놓기도 됩니다', 'The figure library is empty. You can also paste (⌘V) or drop')}</p>
    </div>}
    {open === 'library' && <div className="menu fl-figmenu-pop fl-figmenu-lib" role="menu" data-ui="흐름 그림 메뉴">
      {figs.map((x) => <button key={x.id} role="menuitem" onClick={() => { setOpen(false); onPick(x.file) }}>{Icon.image}<span className="fl-grow">{x.name}</span></button>)}
    </div>}
  </span>
}
