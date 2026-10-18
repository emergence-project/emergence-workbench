/**
 * 기록이 붙은 절의 이름 (10/18 시안 4절): 그 줄이나 그 위에서 가장 가까운 제목(#…)의 글.
 * 코드 묶음(```) 안의 # 줄은 제목이 아니다. 제목이 없으면 undefined (그때는 줄 번호를 쓴다).
 */
export function sectionAt(source: string, line: number): string | undefined {
  let section: string | undefined
  let fence = false
  const lines = source.split('\n')
  for (let i = 0; i < Math.min(line, lines.length); i++) {
    const l = lines[i]!
    if (/^\s*(```|~~~)/.test(l)) { fence = !fence; continue }
    const m = !fence && /^#{1,6}\s+(.+?)\s*#*\s*$/.exec(l)
    if (m) section = m[1]!.replace(/\*\*|__|`/g, '').trim()
  }
  return section || undefined
}
