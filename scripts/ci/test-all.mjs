// pnpm test — 검사를 모두 돌리고 끝에 모아 알린다. 앞 검사가 실패해도 뒤 검사(화면 기준·파일 이름 등)를 건너뛰지 않는다.
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const tests = (dir) => fs.readdirSync(path.join(root, dir)).filter((f) => f.endsWith('.test.mjs')).map((f) => `${dir}/${f}`)
const steps = [
  ['패키지 테스트', 'pnpm', ['-r', 'run', 'test']],
  ['원격 스크립트', 'node', ['--test', ...tests('scripts/remote')]],
  ['파일 안전', 'node', ['--test', ...tests('scripts/safety')]],
  ['규모', 'node', ['--test', ...tests('scripts/scale')]],
  ['요약 명령', 'node', ['--test', ...tests('scripts/ci')]],
  ['화면 검사 옵션', 'node', ['--test', ...tests('scripts/shots')]],
  ['TeX 검사 대상', 'node', ['scripts/ci/check-tex-coverage.mjs']],
  ['화면 기준', 'node', ['scripts/ci/check-design.mjs']],
  ['파일 이름 대소문자', 'node', ['scripts/ci/check-case.mjs']],
]
const failed = []
for (const [name, cmd, args] of steps) {
  console.log(`\n▶ ${name}`)
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit' })
  if (r.status !== 0) failed.push(name)
}
console.log(failed.length ? `\n실패: ${failed.join(', ')}` : '\n검사 모두 통과')
process.exit(failed.length ? 1 : 0)
