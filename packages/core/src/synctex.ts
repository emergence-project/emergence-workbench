/**
 * `synctex` 명령의 출력 해석.
 * 좌표 단위는 PDF 포인트(1/72인치), 원점은 쪽의 왼쪽 위다.
 */

/** 원고 위치 → PDF 영역 (`synctex view`) */
export interface PdfBox {
  page: number
  /** 상자 왼쪽 */
  h: number
  /** 상자 기준선(아래쪽) */
  v: number
  width: number
  height: number
}

/** PDF 위치 → 원고 위치 (`synctex edit`) */
export interface SourceSpot {
  file: string
  line: number
}

function resultRecords(stdout: string): Array<Map<string, string>> {
  const begin = stdout.indexOf('SyncTeX result begin')
  const end = stdout.indexOf('SyncTeX result end')
  if (begin < 0 || end < 0) return []
  const body = stdout.slice(begin, end).split(/\r?\n/).slice(1)
  const records: Array<Map<string, string>> = []
  let cur: Map<string, string> | null = null
  for (const line of body) {
    const i = line.indexOf(':')
    if (i < 0) continue
    const key = line.slice(0, i)
    const value = line.slice(i + 1)
    // 새 기록은 view에서는 Output, edit에서는 Input으로 시작한다.
    if (key === 'Output' || key === 'Input') {
      cur = new Map()
      records.push(cur)
    }
    cur?.set(key, value)
  }
  return records
}

export function parseSynctexView(stdout: string): PdfBox[] {
  const boxes: PdfBox[] = []
  for (const r of resultRecords(stdout)) {
    const nums = ['Page', 'h', 'v', 'W', 'H'].map((k) => Number(r.get(k)))
    if (nums.some((n) => !Number.isFinite(n))) continue
    const [page, h, v, width, height] = nums as [number, number, number, number, number]
    boxes.push({ page, h, v, width, height })
  }
  return boxes
}

export function parseSynctexEdit(stdout: string): SourceSpot | null {
  for (const r of resultRecords(stdout)) {
    const file = r.get('Input')
    const line = Number(r.get('Line'))
    if (file && Number.isInteger(line) && line > 0) return { file, line }
  }
  return null
}
