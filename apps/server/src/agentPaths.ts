import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** 안내에 쓰는 절대 경로. 홈 아래이면 ~로 줄인다. */
export function homeShort(abs: string): string {
  const home = os.homedir()
  return home && abs.startsWith(home + path.sep) ? `~${abs.slice(home.length)}` : abs
}

/** 앱 기준 경로 (홈 아래이면 ~로 줄인다) */
export const appPath = (relative = ''): string => homeShort(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..', relative))
