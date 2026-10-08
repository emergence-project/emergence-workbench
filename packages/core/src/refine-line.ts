/**
 * PDF → 원고 이동의 정밀도 보정.
 *
 * SyncTeX는 문단 안의 글줄을 "문단이 끝난 원고 줄"로 기록하는 경우가 많다.
 * 그래서 가운데 수식이 낀 긴 문단에서는 몇 줄 아래로 간다.
 * 사용자가 누른 PDF 글자(pdfText)를 SyncTeX가 알려 준 줄의 위쪽 근처 원고에서 찾아
 * 실제 줄로 옮긴다. 찾지 못하면 SyncTeX 결과를 그대로 쓴다.
 */
export function refineSourceLine(source: string, reportedLine: number, pdfText: string, window = 25): number {
  const hint = normalize(pdfText)
  if (hint.length < 2 || !/[\p{L}]{2}/u.test(hint)) return reportedLine

  const lines = source.split(/\r?\n/)
  const from = Math.max(1, reportedLine - window)
  const to = Math.min(lines.length, reportedLine + 2)

  const find = (needle: string): number | null => {
    let best: number | null = null
    let bestCost = Infinity
    for (let n = from; n <= to; n++) {
      const text = normalize(stripComment(lines[n - 1] ?? ''))
      if (!text.includes(needle)) continue
      // 문단 끝 줄보다 위에 있는 줄을 우선한다
      const cost = n <= reportedLine ? reportedLine - n : 100 + (n - reportedLine)
      if (cost < bestCost) { bestCost = cost; best = n }
    }
    return best
  }

  return find(hint) ?? (hint.length > 8 ? find(hint.slice(0, 6)) : null) ?? reportedLine
}

function normalize(s: string): string {
  return s.replace(/\s+/g, '')
}

/** `\%`는 남기고 주석 `%` 뒤를 지운다 */
function stripComment(line: string): string {
  const m = /(^|[^\\])%/.exec(line)
  return m ? line.slice(0, m.index + m[1]!.length) : line
}
