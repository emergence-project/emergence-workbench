// tsx의 ESM API(tsx/esm/api)를 apps/server의 tsx에서 불러온다.
// createRequire로 'tsx/esm/api'를 풀면 require 쪽(index.cjs)이 잡히는데, tsx 4.23은 그 파일이 없는 경로를 찾아 깨진다.
// 그래서 패키지 exports의 import 쪽 파일을 직접 연다.
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

export async function tsxApi() {
  const require = createRequire(path.join(root, 'apps/server/package.json'))
  const pkgFile = require.resolve('tsx/package.json')
  const entry = JSON.parse(fs.readFileSync(pkgFile, 'utf8')).exports['./esm/api'].import.default
  return import(pathToFileURL(path.join(path.dirname(pkgFile), entry)).href)
}
