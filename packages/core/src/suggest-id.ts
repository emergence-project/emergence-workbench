import { isReservedBlockId, isValidBlockId } from './block-id.js'

/**
 * 제목에서 블록 id를 제안한다. 한 번 정하면 바꾸지 않으므로 짧고 읽기 쉬운 이름이 좋다.
 * 제목에 영문 단어가 있으면 그것으로, 없으면(한글 제목) "b-월일"로 만든다.
 */
export function suggestBlockId(title: string, existing: Iterable<string>, date: Date = new Date()): string {
  const taken = new Set(existing)
  const words = title.toLowerCase().normalize('NFKD').replace(/[^\x00-\x7f]/g, ' ').match(/[a-z0-9]+/g) ?? []
  const mmdd = `${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`
  let base = words.slice(0, 5).join('-').slice(0, 60).replace(/-+$/, '')
  if (!isValidBlockId(base)) base = `b-${mmdd}`
  else if (isReservedBlockId(base)) base = `b-${base}`
  let id = base
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`
  return id
}
