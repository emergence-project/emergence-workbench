import fs from 'node:fs'
import type { RecordMark } from '@rw/core'
import { USER_ANSWER_BY } from '@rw/core/contract/comments'
import { commentSourceFile, listComments, readComments } from './comments.js'

/** 컴파일 설정의 "기록 넣기" (10/19 결정 "PDF에 기록"): 진행 중만 · 완료도 */
export type RecordScope = 'open' | 'all'
export const recordScopeOf = (v: unknown): RecordScope | undefined => (v === 'open' || v === 'all' ? v : undefined)

const real = (f: string) => { try { return fs.realpathSync(f) } catch { return f } }
/** c-20261014-1010 → 10/14 */
const dayOf = (id: string) => { const m = /^c-\d{4}(\d{2})(\d{2})/.exec(id); return m ? `${Number(m[1])}/${Number(m[2])}` : '' }

/**
 * 이 노트 파일에 단 기록을 PDF 쪽지 모양으로. 자리를 잃은 기록과 PDF 위에 단 기록(쪽 · 사각형)은 넣지 않는다.
 * root: 연구 저장소의 workbench 폴더, note: 노트 본문 파일(절대 경로)
 */
export function noteRecordMarks(root: string, note: string, scope: RecordScope): RecordMark[] {
  const want = real(note)
  const marks: RecordMark[] = []
  for (const head of listComments(root)) {
    const source = commentSourceFile(root, head)
    if (!source || real(source) !== want) continue
    const file = readComments(root, head.target)
    for (const c of [...file.comments, ...file.highlights]) {
      if (c.lost || c.page !== undefined) continue
      if (scope === 'open' && c.state === '끝냄') continue
      const answers = c.answers.map((a) => `${a.by === USER_ANSWER_BY ? '이어 씀' : '답'} · ${a.by} · ${a.at}\n${a.body.trim()}`)
      marks.push({
        kind: c.kind, ...(c.quote && { quote: c.quote }), ...(c.prefix && { prefix: c.prefix }), ...(c.suffix && { suffix: c.suffix }),
        ...(c.line !== undefined && { line: c.line }), ...(c.color && { color: c.color }),
        title: [c.kind, c.by ?? USER_ANSWER_BY, dayOf(c.id)].filter(Boolean).join(' · '),
        text: [c.body.trim(), ...answers].filter(Boolean).join('\n\n'),
      })
    }
  }
  return marks
}

/** XeLaTeX(xdvipdfmx)로 기록을 넣을 때: 주석을 손볼 수 있게 객체 스트림 없는 PDF 1.4로 만든다 (latexmk -e) */
export const XDVIPDFMX_PLAIN = '$xdvipdfmx = q/xdvipdfmx -V 4 -E -o %D %O %S/;'

/**
 * 하이라이트 주석에 QuadPoints를 붙인다. xdvipdfmx의 pdf:bann/eann은 줄마다 Rect만 만드는데,
 * pdf.js · 미리보기 · Acrobat은 QuadPoints가 없는 하이라이트를 그리지 않는다.
 * 파일 끝에 고친 객체와 새 xref를 덧붙인다(증분 갱신). 이미 붙은 것은 건너뛰어 다시 불러도 그대로다. 고친 수를 돌려준다.
 */
export function addHighlightQuads(pdfFile: string): number {
  const buf = fs.readFileSync(pdfFile)
  const pdf = buf.toString('latin1')
  // 객체마다 마지막 판만 본다 (앞서 덧붙인 판이 있으면 그것). 사전만 있는 객체를 찾고, 스트림 객체에서 다음 객체로 넘어가 일치하지 않게 endobj를 넘지 않는다
  const last = new Map<string, { gen: string; dict: string }>()
  for (const m of pdf.matchAll(/(?:^|[\r\n])(\d+) (\d+) obj\s*(<<(?:(?!endobj)[\s\S])*?>>)\s*endobj/g)) last.set(m[1]!, { gen: m[2]!, dict: m[3]! })
  const fixed: { num: string; gen: string; dict: string }[] = []
  for (const [num, { gen, dict }] of last) {
    if (!/\/Subtype\s*\/Highlight\b/.test(dict) || /\/QuadPoints/.test(dict)) continue
    const r = /\/Rect\s*\[\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*\]/.exec(dict)
    if (!r) continue
    const [x1, y1, x2, y2] = r.slice(1).map(Number) as [number, number, number, number]
    fixed.push({ num, gen, dict: dict.replace(/>>$/, `/QuadPoints[${[x1, y2, x2, y2, x1, y1, x2, y1].join(' ')}]>>`) })
  }
  const trailer = [...pdf.matchAll(/trailer\s*(<<[\s\S]*?>>)\s*startxref\s+(\d+)/g)].at(-1)
  if (!fixed.length || !trailer) return 0
  let out = buf.at(-1) === 0x0a ? '' : '\n'
  let at = buf.length + out.length
  const rows: string[] = []
  for (const f of fixed) {
    const obj = `${f.num} ${f.gen} obj\n${f.dict}\nendobj\n`
    rows.push(`${f.num} 1\n${String(at).padStart(10, '0')} ${f.gen.padStart(5, '0')} n \n`)
    out += obj
    at += Buffer.byteLength(obj, 'latin1')
  }
  const dict = trailer[1]!.replace(/\/Prev\s+\d+/, '').replace(/>>$/, `/Prev ${trailer[2]}>>`)
  out += `xref\n${rows.join('')}trailer\n${dict}\nstartxref\n${at}\n%%EOF\n`
  fs.appendFileSync(pdfFile, Buffer.from(out, 'latin1'))
  return fixed.length
}
