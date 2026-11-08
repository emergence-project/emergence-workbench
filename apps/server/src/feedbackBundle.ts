// 피드백 파일로 주고받기 (11/8 "친구의 피드백도 관리자인 나는 볼 수 있게"): GitHub 계정이 없는 사용자의 피드백을 관리자에게 옮긴다.
// 보내는 쪽: 피드백 폴더의 날짜 파일과 그 그림을 JSON 한 파일로 묶어 내려받기 폴더에 두고 탐색기 · Finder에서 보여 준다(카카오톡 · 메일로 보낸다).
// 받는 쪽: 그 파일을 피드백 화면에서 가져오면 feedback/from/<보낸 사람>/날짜.md 와 pictures/from-<해시>-<이름>에 둔다.
// 묶음은 늘 그 사람의 피드백 전부라 같은 사람의 새 묶음을 가져오면 날짜 파일을 통째로 바꾼다(여러 번 가져와도 겹치지 않는다).
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { writeAtomic } from './fsutil.js'
import { t } from './i18n.js'
import { WorkbenchError } from './workbench.js'

export const BUNDLE_FORMAT = 'emergence-workbench-feedback'
/** 다른 사람에게서 가져온 피드백의 하위 폴더 */
export const FROM_DIR = 'from'

export interface FeedbackBundle {
  format: typeof BUNDLE_FORMAT
  version: 1
  from: string
  /** 보낸 앱의 번호 (feedback-sender.json): 이름이 같은 두 사람을 가른다 */
  id?: string
  exportedAt: string
  /** 날짜(YYYY-MM-DD) → 날짜 파일 글 */
  days: Record<string, string>
  /** 그림 파일 이름 → base64 */
  pictures: Record<string, string>
}

const DAY = /^\d{4}-\d{2}-\d{2}$/
const PICTURE = /^[\w.-]+\.(png|jpe?g)$/
const PICTURE_LINE = /^- 그림: pictures\/([\w.-]+\.(?:png|jpe?g))\s*$/gm
const MAX_PICTURE_BYTES = 5 * 1024 * 1024

/** 피드백 폴더의 날짜 파일과 그 안에 적힌 그림을 묶는다 */
export function bundleFeedback(dir: string, from: string, now = new Date(), id?: string): FeedbackBundle {
  const days: Record<string, string> = {}
  const pictures: Record<string, string> = {}
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f)).sort() : []
  for (const f of files) {
    const text = fs.readFileSync(path.join(dir, f), 'utf8')
    days[f.slice(0, 10)] = text
    for (const m of text.matchAll(PICTURE_LINE)) {
      const name = m[1]!
      const file = path.join(dir, 'pictures', name)
      if (!pictures[name] && fs.existsSync(file)) pictures[name] = fs.readFileSync(file).toString('base64')
    }
  }
  return { format: BUNDLE_FORMAT, version: 1, from, ...(id && { id }), exportedAt: now.toISOString(), days, pictures }
}

/** 파일 이름 · 폴더 이름에 쓸 수 있게 (한글은 그대로, 경로 기호는 뺀다) */
export function senderFolder(from: string): string {
  const s = from.normalize('NFC').replace(/[^\p{L}\p{N} _-]+/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 40)
  return s || t('보낸 사람', 'sender')
}

/** 받는 쪽 폴더 이름: 보낸 사람 이름, 앱 번호가 있으면 뒤에 앞 여섯 자 (중계 서버 relay/feedback-worker.js도 같은 규칙) */
export const folderFor = (from: string, id?: string) => `${senderFolder(from)}${id && /^[a-z0-9]{6,32}$/.test(id) ? `-${id.slice(0, 6)}` : ''}`
/** 그림 이름 앞에 붙이는 말: 여러 사람의 같은 그림 이름이 부딪히지 않게 */
export const picturePrefix = (folder: string) => `from-${crypto.createHash('sha1').update(folder).digest('hex').slice(0, 8)}-`

/** 내려받기 폴더(없으면 집 폴더)에 묶음을 쓰고 그 경로를 돌려준다 */
export function exportFeedback(dir: string, from: string, home = os.homedir(), now = new Date(), id?: string): { file: string; count: number } {
  const bundle = bundleFeedback(dir, from, now, id)
  const count = Object.values(bundle.days).reduce((n, text) => n + (text.match(/^## /gm)?.length ?? 0), 0)
  if (!count) throw new WorkbenchError(400, t('보낼 피드백이 없습니다. 피드백 모드로 먼저 남겨 주세요', 'There is no feedback to send. Leave some in feedback mode first'))
  const downloads = path.join(home, 'Downloads')
  const folder = fs.existsSync(downloads) ? downloads : home
  const file = path.join(folder, `${t('피드백', 'feedback')}-${senderFolder(from)}-${now.toISOString().slice(0, 10)}.json`)
  writeAtomic(file, JSON.stringify(bundle))
  return { file, count }
}

function readBundle(raw: unknown): FeedbackBundle {
  const bad = () => new WorkbenchError(400, t('Emergence Workbench 피드백 파일이 아닙니다', 'Not an Emergence Workbench feedback file'))
  if (!raw || typeof raw !== 'object' || !('format' in raw) || raw.format !== BUNDLE_FORMAT) throw bad()
  const from = 'from' in raw && typeof raw.from === 'string' ? raw.from : ''
  const id = 'id' in raw && typeof raw.id === 'string' ? raw.id : undefined
  const days = 'days' in raw && raw.days && typeof raw.days === 'object' ? raw.days : null
  const pictures = 'pictures' in raw && raw.pictures && typeof raw.pictures === 'object' ? raw.pictures : {}
  if (!days) throw bad()
  const clean = <T>(o: object, ok: (k: string, v: unknown) => v is T) => Object.fromEntries(Object.entries(o).filter(([k, v]) => ok(k, v)))
  return {
    format: BUNDLE_FORMAT, version: 1, from, ...(id && { id }), exportedAt: 'exportedAt' in raw && typeof raw.exportedAt === 'string' ? raw.exportedAt : '',
    days: clean(days, (k, v): v is string => DAY.test(k) && typeof v === 'string'),
    pictures: clean(pictures, (k, v): v is string => PICTURE.test(k) && typeof v === 'string'),
  }
}

/** 날짜 파일의 그림 줄을 받는 쪽 이름으로 */
export const rewritePictures = (text: string, prefix: string) => text.replace(PICTURE_LINE, (_, name: string) => `- 그림: pictures/${prefix}${name}`)

/** 받은 묶음을 feedback/from/<보낸 사람>/에 둔다. 같은 사람의 날짜 파일은 새 묶음으로 바꾼다 */
export function importFeedback(dir: string, raw: unknown): { from: string; count: number; days: number; pictures: number } {
  const b = readBundle(raw)
  const folder = folderFor(b.from, b.id)
  const prefix = picturePrefix(folder)
  const target = path.join(dir, FROM_DIR, folder)
  fs.mkdirSync(target, { recursive: true })
  let count = 0
  for (const [day, text] of Object.entries(b.days)) {
    count += text.match(/^## /gm)?.length ?? 0
    writeAtomic(path.join(target, `${day}.md`), rewritePictures(text, prefix))
  }
  let pictures = 0
  for (const [name, data] of Object.entries(b.pictures)) {
    const buf = Buffer.from(data, 'base64')
    if (!buf.length || buf.length > MAX_PICTURE_BYTES) continue
    fs.mkdirSync(path.join(dir, 'pictures'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'pictures', prefix + name), buf)
    pictures++
  }
  return { from: folder, count, days: Object.keys(b.days).length, pictures }
}

/** 가져온 사람들의 날짜 파일: 피드백 목록이 함께 읽는다 (source = 보낸 사람) */
export function importedDayFiles(dir: string): { file: string; date: string; source: string }[] {
  const root = path.join(dir, FROM_DIR)
  if (!fs.existsSync(root)) return []
  return fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).flatMap((d) =>
    fs.readdirSync(path.join(root, d.name)).filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
      .map((f) => ({ file: path.join(root, d.name, f), date: f.slice(0, 10), source: d.name })))
}
