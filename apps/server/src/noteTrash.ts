import fs from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'
import { writeAtomic } from './fsutil.js'
import { manuscriptInfo } from './manuscript.js'
import { NOTE_DIRS, WorkbenchError, type Workbench } from './workbench.js'
import { t } from './i18n.js'

/**
 * 연구노트·계산 노트 지우기 (10/4 17:04 "곧바로 삭제하지 말고, 15일 보관 후 삭제"):
 * 노트 폴더를 workbench/.trash/로 옮겨 두고, 15일이 지나면 정말 지운다. 그 안에는 언제든 되살린다.
 * 원고(논문)는 지우지 않는다.
 */
export const TRASH_DAYS = 15
const DAY = 24 * 60 * 60_000
const INFO = 'trash.yaml'

export interface TrashedNote {
  id: string
  name: string
  /** 원래 있던 곳 (저장소 기준) */
  from: string
  /** 지운 때 (ISO) */
  at: string
  /** 정말 지워지는 때 (ISO) */
  until: string
}

const trashRoot = (wb: Workbench) => path.join(wb.root, '.trash')

export function trashNote(wb: Workbench, key: string, now = new Date()): TrashedNote {
  const info = manuscriptInfo(wb, key)
  if (info.kind === 'paper') throw new WorkbenchError(400, t('원고는 앱에서 지우지 않습니다', 'Manuscripts are not deleted in the app'))
  const repo = wb.repo
  const yaml = path.join(wb.root, 'research.yaml')
  if (fs.existsSync(yaml) && fs.readFileSync(yaml, 'utf8').includes(info.main)) throw new WorkbenchError(400, t('research.yaml에 메인 노트로 적힌 노트라 지우지 않습니다. 메인 노트를 바꾼 뒤 지우세요', 'Not deleted: research.yaml lists this note as the main note. Change the main note first'))
  const dir = path.dirname(path.join(repo, info.main))
  const parent = path.join(wb.root, NOTE_DIRS[info.kind])
  if (path.dirname(dir) !== parent) throw new WorkbenchError(400, t(`노트 폴더가 ${NOTE_DIRS[info.kind]}/ 바로 아래가 아닙니다`, `The note folder is not directly under ${NOTE_DIRS[info.kind]}/`))
  const id = `${path.basename(dir)}-${now.toISOString().replace(/[-:]/g, '').slice(0, 15)}`
  const dest = path.join(trashRoot(wb), id)
  fs.mkdirSync(trashRoot(wb), { recursive: true })
  fs.renameSync(dir, dest)
  const item = { name: info.name, from: path.relative(repo, dir), at: now.toISOString() }
  writeAtomic(path.join(dest, INFO), YAML.stringify(item))
  return { id, ...item, until: new Date(now.getTime() + TRASH_DAYS * DAY).toISOString() }
}

/** 지운 노트 목록. 15일이 지난 것은 이때 정말 지운다 */
export function listTrash(wb: Workbench, now = new Date()): TrashedNote[] {
  const root = trashRoot(wb)
  if (!fs.existsSync(root)) return []
  const out: TrashedNote[] = []
  for (const e of fs.readdirSync(root, { withFileTypes: true })) {
    if (!e.isDirectory()) continue
    const dir = path.join(root, e.name)
    let y: { name?: unknown; from?: unknown; at?: unknown } = {}
    try { y = YAML.parse(fs.readFileSync(path.join(dir, INFO), 'utf8')) ?? {} } catch { /* 기록이 없으면 폴더 시각 */ }
    const at = typeof y.at === 'string' && !Number.isNaN(Date.parse(y.at)) ? y.at : fs.statSync(dir).mtime.toISOString()
    const until = new Date(Date.parse(at) + TRASH_DAYS * DAY)
    if (until.getTime() <= now.getTime()) { fs.rmSync(dir, { recursive: true, force: true }); continue }
    out.push({ id: e.name, name: typeof y.name === 'string' ? y.name : e.name, from: typeof y.from === 'string' ? y.from : '', at, until: until.toISOString() })
  }
  return out.sort((a, b) => b.at.localeCompare(a.at))
}

/** 되살리기: 원래 자리로 (그 자리에 다른 노트가 생겼으면 이름 뒤에 -2, -3 …) */
export function restoreNote(wb: Workbench, id: string): { path: string } {
  if (!/^[^/\\]+$/.test(id) || id.startsWith('.')) throw new WorkbenchError(400, t('잘못된 이름', 'Invalid name'))
  const dir = path.join(trashRoot(wb), id)
  if (!fs.existsSync(dir)) throw new WorkbenchError(404, t('지운 노트 목록에 없습니다', 'Not in the list of deleted notes'))
  const item = listTrash(wb).find((t) => t.id === id)
  const repo = wb.repo
  const fallback = path.join(wb.root, NOTE_DIRS.note, id.replace(/-\d{8}T\d{6}$/, ''))
  let target = item?.from ? path.join(repo, item.from) : fallback
  const kindDirs = Object.values(NOTE_DIRS).map((d) => path.join(wb.root, d))
  if (!kindDirs.includes(path.dirname(target))) target = fallback
  for (let n = 2; fs.existsSync(target); n++) target = `${target.replace(/-\d+$/, '')}-${n}`
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.rmSync(path.join(dir, INFO), { force: true })
  fs.renameSync(dir, target)
  return { path: path.relative(repo, target) }
}
