// node --test scripts/remote/ — 가짜 tailscale·ifconfig·code-server로 실행 조건과 넘기는 인자를 확인한다
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'

const script = path.join(path.dirname(new URL(import.meta.url).pathname), 'ipad-code-server.sh')
const roots = []

function exe(root, name, body) {
  const file = path.join(root, name)
  fs.writeFileSync(file, `#!/bin/sh\n${body}\n`, { mode: 0o755 })
  return file
}

function run({ active }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ipad-code-server-'))
  roots.push(root)
  const log = path.join(root, 'args.txt')
  const result = spawnSync('/bin/zsh', [script], {
    encoding: 'utf8',
    env: {
      ...process.env,
      TAILSCALE_BIN: exe(root, 'tailscale', 'printf "100.100.41.27\\n"'),
      IFCONFIG_BIN: exe(root, 'ifconfig', active
        ? 'printf "utun5: flags=8051<UP,RUNNING>\\n\\tinet 100.100.41.27 netmask 0xffffffff\\n"'
        : 'printf "en0: flags=8863<UP,RUNNING>\\n\\tinet 192.0.2.10 netmask 0xffffff00\\n"'),
      CODE_SERVER_BIN: exe(root, 'code-server', `printf "%s\\n" "$@" > "${log}"`),
      IPAD_CODE_SERVER_PORT: '18080',
      IPAD_CODE_SERVER_STARTUP_ATTEMPTS: '1',
      IPAD_CODE_SERVER_WORKSPACE: '/tmp/workspace',
    },
  })
  return { result, log }
}

afterEach(() => { for (const r of roots.splice(0)) fs.rmSync(r, { force: true, recursive: true }) })

// 이 스크립트는 맥의 zsh로 돈다. zsh가 없는 곳(클라우드 개발 환경)에서는 건너뛴다. CI는 zsh를 깔고 돌린다.
const noZsh = !fs.existsSync('/bin/zsh') && '/bin/zsh 없음'

describe('ipad-code-server', { skip: noZsh }, () => {
  it('Tailscale 주소가 이 맥에서 실제로 켜져 있지 않으면 시작하지 않는다', () => {
    const { result, log } = run({ active: false })
    assert.equal(result.status, 1)
    assert.match(result.stderr, /No active local Tailscale IPv4 address/)
    assert.equal(fs.existsSync(log), false)
  })

  it('Tailscale 주소에서만, 비밀번호 로그인을 켠 채로 시작한다', () => {
    const { result, log } = run({ active: true })
    assert.equal(result.status, 0)
    assert.deepEqual(fs.readFileSync(log, 'utf8').split('\n'),
      ['--bind-addr', '100.100.41.27:18080', '--auth', 'password', '/tmp/workspace', ''])
  })
})
