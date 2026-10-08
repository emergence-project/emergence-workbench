import { randomBytes } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { writeAtomic } from './fsutil.js'
import { WorkbenchError } from './workbench.js'
import { t } from './i18n.js'

export interface LinkedTodoFileChange { file: string; before: string | undefined; after: string }
const read = (file: string) => fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : undefined

/** 모든 원문과 임시 파일을 준비한 뒤 함께 쓴다. 실패 시 우리 글만 되돌리고 바깥 고침은 보존한다. */
export function writeLinkedTodoFiles(root: string, changes: LinkedTodoFileChange[]): void {
  const realRoot = fs.realpathSync(root)
  const staged: { change: LinkedTodoFileChange; tmp: string }[] = []
  const written: LinkedTodoFileChange[] = []
  const verifyPath = (c: LinkedTodoFileChange) => {
    const parent = fs.realpathSync(path.dirname(c.file))
    if (parent !== realRoot && !parent.startsWith(realRoot + path.sep)) throw new WorkbenchError(403, t('기록·일지를 저장소 밖에 쓰지 않습니다', 'Records and journals are not written outside the repository'))
    if (fs.existsSync(c.file) && fs.lstatSync(c.file).isSymbolicLink()) throw new WorkbenchError(403, t('연결된 기록·일지의 링크 파일은 고치지 않습니다', 'Linked record or journal files that are symbolic links are not edited'))
  }
  const verify = (c: LinkedTodoFileChange) => {
    verifyPath(c)
    if (read(c.file) !== c.before) throw new WorkbenchError(409, t('그새 기록이나 연결된 일지가 바뀌었습니다. 다시 열어 주세요.', 'The record or its linked journal changed in the meantime. Open it again.'))
  }
  try {
    for (const c of changes) verify(c)
    for (const change of changes) {
      const tmp = path.join(path.dirname(change.file), `.${path.basename(change.file)}.${randomBytes(8).toString('hex')}.tmp`)
      staged.push({ change, tmp })
      fs.writeFileSync(tmp, change.after, { encoding: 'utf8', flag: 'wx' })
    }
    for (const { change } of staged) verify(change)
    for (const { change, tmp } of staged) {
      verify(change)
      fs.renameSync(tmp, change.file)
      written.push(change)
    }
  } catch (error) {
    let partial = false
    for (const c of written.reverse()) {
      try {
        verifyPath(c)
        if (read(c.file) !== c.after) { partial = true; continue }
        if (c.before === undefined) fs.unlinkSync(c.file)
        else writeAtomic(c.file, c.before)
      } catch { partial = true }
    }
    if (partial) throw new WorkbenchError(500, t('할 일 연결을 일부만 저장했습니다. 바깥에서 바뀐 글은 보존했습니다. 기록과 일지를 다시 열어 확인해 주세요.', 'Only part of the to-do link was saved. Text changed outside was kept. Open the records and journal again to check.'))
    const status = error instanceof WorkbenchError ? error.status : 500
    throw new WorkbenchError(status, t(`기록과 연결된 일지를 함께 저장하지 못했습니다. 변경은 남기지 않았습니다. ${(error as Error).message}`, `Could not save the record and its linked journal together. No changes were kept. ${(error as Error).message}`))
  } finally {
    for (const { change, tmp } of staged) { try { verifyPath(change); fs.rmSync(tmp, { force: true }) } catch { /* 남은 임시 파일은 다음 읽기에서 무시된다. */ } }
  }
}
