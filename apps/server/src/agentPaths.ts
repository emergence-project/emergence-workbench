import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** 안내에 쓰는 절대 경로. 홈 아래이면 ~로 줄인다. */
export function homeShort(abs: string): string {
  const home = os.homedir()
  return home && abs.startsWith(home + path.sep) ? `~${abs.slice(home.length)}` : abs
}

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')

/** 앱 기준 경로 (홈 아래이면 ~로 줄인다) */
export const appPath = (relative = ''): string => homeShort(path.join(APP_ROOT, relative))

/** 내려받은 앱(scripts/bundle-app.mjs가 묶은 것)인지. 그 앱에는 PATH의 node가 없을 수 있어 앱에 든 node를 쓴다 */
export const bundledApp = fs.existsSync(path.join(APP_ROOT, 'build.json'))

/** 명령 한 칸: 빈칸이 있으면 따옴표로 묶는다 (앱 안 경로 "Emergence Workbench.app") */
export const shellArg = (s: string): string => (/\s/.test(s) ? `"${s}"` : s)

/** 에이전트 설정에 적는 MCP 입구 명령 (node 경로와 scripts/mcp.mjs). 묶은 앱은 따옴표 안에서 ~가 풀리지 않으므로 줄이지 않은 경로 */
export const mcpCommand = (): string => bundledApp
  ? `${shellArg(process.execPath)} ${shellArg(path.join(APP_ROOT, 'scripts/mcp.mjs'))}`
  : `node ${appPath('scripts/mcp.mjs')}`
