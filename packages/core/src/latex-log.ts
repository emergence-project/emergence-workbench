export interface LatexProblem {
  /** 문제가 난 파일의 절대 경로. 로그에 상대 경로로 나오면 buildDir 기준으로 바꾼다. */
  file: string
  line: number
  message: string
}

/**
 * `-file-line-error`로 만든 LaTeX 로그에서 오류를 뽑는다.
 * 줄바꿈 없이 읽으려면 컴파일할 때 환경 변수 max_print_line을 크게 둔다.
 */
const RECOVERED = /^(?:ignored error:|Infinite glue shrinkage found)/i

export function parseLatexErrors(log: string, buildDir: string): LatexProblem[] {
  const problems: LatexProblem[] = []
  const seen = new Set<string>()
  for (const raw of log.split(/\r?\n/)) {
    const m = /^(.+?\.(?:tex|sty|cls)):(\d+): (.+)$/.exec(raw)
    if (!m) continue
    const [, fileRaw, lineRaw, message] = m as unknown as [string, string, string, string]
    // TeX가 스스로 고치고 넘어가는 오류(longtable 끝의 "Infinite glue shrinkage", 줄임 간격을 유한하게 바꿔 계속함)는
    // PDF를 망치지 않으니 오류로 세지 않는다 (10/4 13:48 피드백: 연구노트가 PDF는 멀쩡한데 실패로 보였다)
    if (RECOVERED.test(message.trim())) continue
    const file = fileRaw.startsWith('/') ? fileRaw : joinPath(buildDir, fileRaw)
    const key = `${file}:${lineRaw}:${message}`
    if (seen.has(key)) continue
    seen.add(key)
    problems.push({ file, line: Number(lineRaw), message: message.trim() })
  }
  return problems
}

function joinPath(dir: string, rel: string): string {
  const parts = `${dir.replace(/\/$/, '')}/${rel}`.split('/')
  const out: string[] = []
  for (const part of parts) {
    if (part === '.' || part === '') continue
    if (part === '..') out.pop()
    else out.push(part)
  }
  return `/${out.join('/')}`
}
