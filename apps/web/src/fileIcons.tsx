import type { ReactNode } from 'react'

/**
 * 파일 나무의 종류 기호 (10/29 피드백 08:08 "VSCode처럼 파일 유형 아이콘"). 앱 규칙(색은 상태에만)대로 무채색 선 그림이고,
 * 모두 같은 문서 모양 안에 종류마다 다른 표시를 넣어 한눈에 가른다. 선 굵기·크기는 CSS(.fv-ic)가 정한다.
 */
export type FileKind = 'md' | 'code' | 'config' | 'tex' | 'data' | 'pdf' | 'image' | 'other'

const EXT: Record<string, FileKind> = {
  md: 'md', markdown: 'md', txt: 'md',
  py: 'code', js: 'code', mjs: 'code', cjs: 'code', ts: 'code', tsx: 'code', jsx: 'code', sh: 'code', zsh: 'code', bash: 'code', jl: 'code', m: 'code', c: 'code', h: 'code', cpp: 'code', rs: 'code', go: 'code', lean: 'code', ipynb: 'code', wl: 'code', nb: 'code',
  yaml: 'config', yml: 'config', json: 'config', toml: 'config', ini: 'config', cfg: 'config', lock: 'config',
  tex: 'tex', bib: 'tex', sty: 'tex', cls: 'tex', bst: 'tex',
  csv: 'data', tsv: 'data', jsonl: 'data', npz: 'data', npy: 'data', h5: 'data', hdf5: 'data', dat: 'data', pkl: 'data', parquet: 'data',
  pdf: 'pdf',
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', svg: 'image', webp: 'image', eps: 'image', tif: 'image', tiff: 'image',
}

export function fileKind(name: string): FileKind {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? EXT[name.slice(dot + 1).toLowerCase()] ?? 'other' : 'other'
}

const DOC = 'M13.5 3.5H7.2A1.7 1.7 0 0 0 5.5 5.2v13.6a1.7 1.7 0 0 0 1.7 1.7h9.6a1.7 1.7 0 0 0 1.7-1.7V8.5zM13.5 3.5v5h5'
const MARK: Record<FileKind, ReactNode> = {
  md: <path d="M8.8 12.5h6.4M8.8 15.3h6.4M8.8 18h3.8" />,
  code: <path d="M10.3 12.6l-2 2.3 2 2.3M13.7 12.6l2 2.3-2 2.3" />,
  config: <path d="M10.6 11.8c-1.2 0-1.2.6-1.2 1.5s-.4 1.6-1.1 1.6c.7 0 1.1.7 1.1 1.6s0 1.5 1.2 1.5M13.4 11.8c1.2 0 1.2.6 1.2 1.5s.4 1.6 1.1 1.6c-.7 0-1.1.7-1.1 1.6s0 1.5-1.2 1.5" />,
  tex: <path d="M15 12H9.2l3 2.9-3 2.9H15" />,
  data: <path d="M8.6 11.8h6.8v6H8.6zM8.6 14.8h6.8M12 11.8v6" />,
  pdf: <path className="fill" d="M8.4 15.2h7.2v2.8H8.4z" />,
  image: <><circle cx="10.2" cy="12.6" r="1.1" /><path d="M8.3 18l2.6-2.8 1.8 1.7 1.4-1.3 1.7 2.4" /></>,
  other: null,
}

export function FileIcon({ name }: { name: string }) {
  const k = fileKind(name)
  return <svg className={`fv-ic k-${k}`} viewBox="0 0 24 24" aria-hidden><path d={DOC} />{MARK[k]}</svg>
}

export function FolderIcon({ open }: { open: boolean }) {
  return <svg className="fv-ic dir" viewBox="0 0 24 24" aria-hidden>{open
    ? <path d="M3.5 18V7a1.5 1.5 0 0 1 1.5-1.5h4.3l2 2.3H18a1.5 1.5 0 0 1 1.5 1.5v1.2M3.5 18l2.3-6.2a1.5 1.5 0 0 1 1.4-1H20a1 1 0 0 1 .9 1.3L19 18.5a1.5 1.5 0 0 1-1.4 1H5a1.5 1.5 0 0 1-1.5-1.5z" />
    : <path d="M3.5 7a1.5 1.5 0 0 1 1.5-1.5h4.3l2 2.3H19a1.5 1.5 0 0 1 1.5 1.5v8.7A1.5 1.5 0 0 1 19 19.5H5A1.5 1.5 0 0 1 3.5 18z" />}</svg>
}
