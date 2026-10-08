import fs from 'node:fs'

/**
 * 한 저장소의 git 작업은 한 번에 하나씩 (피드백·기록 올리기와 앱 업데이트가 겹쳐 index.lock에 부딪히거나
 * 업데이트의 rebase 도중 커밋하지 않게). 다른 저장소끼리는 막지 않는다.
 */
const chains = new Map<string, Promise<unknown>>()

export function withRepoLock<T>(root: string, fn: () => Promise<T>): Promise<T> {
  let key = root
  try { key = fs.realpathSync(root) } catch { /* 없는 폴더: fn이 이유를 알린다 */ }
  const run = (chains.get(key) ?? Promise.resolve()).catch(() => undefined).then(fn)
  const tail = run.catch(() => undefined)
  chains.set(key, tail)
  void tail.then(() => { if (chains.get(key) === tail) chains.delete(key) })
  return run
}
