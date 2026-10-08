import type { BlockRow, ManuscriptPart } from './api'
import { statusOf } from './format'

// Match exact part IDs, including section IDs in a single-file manuscript.
export function groupPartProblems(parts: readonly ManuscriptPart[], file: string, blocks: readonly BlockRow[]) {
  const ids = new Set(parts.filter((part) => part.file === file).map((part) => part.id))
  const open: BlockRow[] = []
  const records: BlockRow[] = []
  let stopped = 0
  let solved = 0
  for (const block of blocks) {
    if (!block.grounds?.some((id) => ids.has(id))) continue
    const status = statusOf(block.status)
    if (status === 'stopped' || status === 'solved') {
      records.push(block)
      if (status === 'stopped') stopped++
      else solved++
    } else open.push(block)
  }
  return { open, records, stopped, solved }
}
