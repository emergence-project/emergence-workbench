/**
 * Markdown 파일 맨 위 YAML 머리말(---). 형식은 docs/repo-format.md §0.1.
 * 첫 줄이 ---, 닫는 줄이 --- (뒤 공백 허용), 그 뒤 줄바꿈이나 파일 끝. 닫히지 않으면 머리말이 없는 것으로 본다.
 * 블록 노트의 머리(block-header.ts)는 줄 수 제한과 % --- 가 있는 다른 형식이라 따로 둔다.
 */
const FRONT = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/

export interface FrontMatter {
  /** --- 사이의 YAML 글 */
  yaml: string
  /** 닫는 줄과 그 줄바꿈까지의 머리말 전체 */
  head: string
  /** 머리말 뒤 본문 */
  body: string
  /** 머리말이 쓰는 줄바꿈 */
  eol: '\n' | '\r\n'
}

export function frontMatter(text: string): FrontMatter | null {
  const m = FRONT.exec(text)
  if (!m) return null
  return { yaml: m[1]!, head: m[0], body: text.slice(m[0].length), eol: m[0].includes('\r\n') ? '\r\n' : '\n' }
}

/** 머리말 끝 위치 (없으면 0) */
export const frontMatterEnd = (text: string): number => frontMatter(text)?.head.length ?? 0

/** 머리말을 뗀 본문 */
export const stripFrontMatter = (text: string): string => frontMatter(text)?.body ?? text

/** 머리말이 차지하는 줄 수 (없으면 0) */
export function frontMatterLines(text: string): number {
  const head = frontMatter(text)?.head
  if (!head) return 0
  const n = head.split('\n').length - 1
  return head.endsWith('\n') ? n : n + 1
}
