// 할 일의 정본은 기록 파일이고(2026-10-16), 일지는 있었던 일만 적는다: 할 일을 끝낸 날 "완료" 한 줄.
import fs from 'node:fs'
import path from 'node:path'
import { appendJournalEntry, RESEARCH_TARGET } from '@rw/core'
import type { LinkedTodoFileChange } from './linkedTodoWrite.js'
import type { CommentEntry, CommentFile } from './comments.js'
import { localDate, localTime } from './fsutil.js'
import { Workbench } from './workbench.js'

/** 일지의 대상은 기록 파일 이름 대신 실제 노트 경로 또는 블록 노트 id다. 주제 · 흐름 점과 경로를 모르는 노트는 프로젝트(rw-todo 줄이 정확한 기록을 가리킨다) */
export function todoJournalTarget(target: string, source?: string): string {
  if (/^(note|calc)-/.test(target)) return source || RESEARCH_TARGET
  if (target.startsWith('block-')) return source || target.slice('block-'.length)
  return RESEARCH_TARGET
}

/** 일지 한 줄에 쓰는 할 일 글: 본문(없으면 인용)의 줄바꿈을 한 칸으로 */
export const todoText = (body: string, quote?: string) => (body.trim() || quote?.trim() || '').replace(/\r\n/g, '\n').replace(/\s*\n\s*/g, ' ')

/** 할 일을 끝냈을 때 그날 일지 끝에 덧붙일 "완료" 기록. 아직 쓰지 않는다 (기록 파일과 함께 쓴다) */
export function doneJournalChange(root: string, file: CommentFile, record: CommentEntry, now = new Date()): LinkedTodoFileChange {
  const date = localDate(now)
  const logDir = new Workbench(root).logDir
  fs.mkdirSync(logDir, { recursive: true })
  const journalFile = path.join(logDir, `${date}.md`)
  const before = fs.existsSync(journalFile) ? fs.readFileSync(journalFile, 'utf8') : undefined
  const after = appendJournalEntry(before ?? '', {
    date, time: localTime(now), kind: 'done', target: todoJournalTarget(file.target, file.source),
    text: todoText(record.body, record.quote) || record.id, link: `${file.target}/${record.id}`,
  })
  return { file: journalFile, before, after }
}
