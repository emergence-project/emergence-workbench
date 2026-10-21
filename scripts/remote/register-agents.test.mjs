// node --test scripts/remote/ — 가짜 claude · codex로 에이전트 등록(scripts/register-agents.sh)이 몇 번 실행해도 한 번만 등록하는지 본다
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'

const script = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../register-agents.sh')
const mcp = path.resolve(path.dirname(script), 'mcp.mjs')
const roots = []

function exe(dir, name, body) {
  fs.writeFileSync(path.join(dir, name), `#!/bin/sh\n${body}\n`, { mode: 0o755 })
}

/** 가짜 claude는 등록을 파일 하나에 두고 get · add · remove를 흉내 낸다. codex는 config.toml을 쓴다 */
function setup({ claude = true, codex = true, codexMcp = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'register-agents-'))
  roots.push(root)
  const bin = path.join(root, 'bin')
  fs.mkdirSync(bin)
  const log = path.join(root, 'calls.txt')
  const reg = path.join(root, 'claude-reg.txt')
  if (claude) exe(bin, 'claude', `echo "claude $*" >> "${log}"
case "$2" in
  get) [ -f "${reg}" ] && cat "${reg}" || exit 1 ;;
  add) [ -f "${reg}" ] && exit 1; shift 6; echo "Args: $*" > "${reg}" ;;
  remove) rm -f "${reg}" ;;
esac`)
  if (codex) exe(bin, 'codex', `echo "codex $*" >> "${log}"
${codexMcp ? `case "$2" in
  add) mkdir -p "$HOME/.codex"; shift 4; printf '[mcp_servers.emergence-workbench]\\nargs = ["%s"]\\n' "$2" >> "$HOME/.codex/config.toml" ;;
  remove) exit 1 ;;
esac` : 'exit 2'}`)
  const run = () => spawnSync('/bin/zsh', [script, '/opt/node/bin/node'], {
    encoding: 'utf8', env: { HOME: root, PATH: `${bin}:/usr/bin:/bin` },
  })
  return { root, run, calls: () => (fs.existsSync(log) ? fs.readFileSync(log, 'utf8') : ''), reg }
}

afterEach(() => { for (const r of roots.splice(0)) fs.rmSync(r, { force: true, recursive: true }) })

const noZsh = !fs.existsSync('/bin/zsh') && '/bin/zsh 없음'

describe('register-agents', { skip: noZsh }, () => {
  it('처음에는 두 에이전트에 이 폴더의 입구를 등록하고, 다시 실행하면 건너뛴다', () => {
    const s = setup()
    const first = s.run()
    assert.equal(first.status, 0)
    assert.deepEqual(first.stdout.trim().split('\n'), ['✓ Claude Code 등록', '✓ Codex 등록'])
    assert.equal(fs.readFileSync(s.reg, 'utf8').trim(), `Args: /opt/node/bin/node ${mcp}`)
    const second = s.run()
    assert.deepEqual(second.stdout.trim().split('\n'), ['– Claude Code (이미 등록)', '– Codex (이미 등록)'])
    assert.equal(s.calls().match(/ mcp add /g)?.length, 2)
  })

  it('다른 경로로 등록돼 있으면(앱 폴더를 옮김) 지우고 다시 등록한다', () => {
    const s = setup({ codex: false })
    fs.writeFileSync(s.reg, 'Args: node /old/place/scripts/mcp.mjs\n')
    const r = s.run()
    assert.deepEqual(r.stdout.trim().split('\n'), ['✓ Claude Code 등록', '– Codex (없음)'])
    assert.match(s.calls(), /claude mcp remove --scope user emergence-workbench/)
    assert.match(fs.readFileSync(s.reg, 'utf8'), new RegExp(mcp.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  })

  it('mcp 명령이 없는 옛 Codex는 config.toml에 직접 한 번만 더한다', () => {
    const s = setup({ claude: false, codexMcp: false })
    assert.deepEqual(s.run().stdout.trim().split('\n'), ['– Claude Code (없음)', '✓ Codex 등록 (config.toml)'])
    s.run()
    const toml = fs.readFileSync(path.join(s.root, '.codex/config.toml'), 'utf8')
    assert.equal(toml.match(/\[mcp_servers\.emergence-workbench\]/g)?.length, 1)
    assert.match(toml, /command = "\/opt\/node\/bin\/node"/)
  })
})
