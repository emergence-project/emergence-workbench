import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { chipMismatches, findLeaks, gatePasses, hostCanRun, macTrust, sameVersion } from './release-gate.mjs'

test('판 번호: 윈도우의 네 자리 번호와 릴리스 번호를 같은 판으로 본다', () => {
  assert.equal(sameVersion('0.3.3.0', '0.3.3'), true)
  assert.equal(sameVersion('v0.3.3', '0.3.3'), true)
  assert.equal(sameVersion('0.3.3', '0.3.4'), false)
  assert.equal(sameVersion('0.1.0', '0.3.3'), false)
  assert.equal(sameVersion(null, '0.3.3'), false)
})

test('만든 기계의 경로: 글 파일 안의 집 폴더 · 저장소 경로를 / · \\ · \\\\ 모양 모두로 찾고, 실행 파일은 보지 않는다', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-gate-test-'))
  try {
    fs.mkdirSync(path.join(dir, 'apps/server/dist'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'apps/server/dist/server.mjs'), 'const ok = "/usr/bin/git"\n')
    fs.writeFileSync(path.join(dir, 'build.json'), '{"commit":"abc"}\n')
    assert.deepEqual(findLeaks(dir, ['/Users/builder', 'C:\\Users\\builder']), [])

    fs.writeFileSync(path.join(dir, 'apps/server/dist/chunk.js'), 'const p = "/Users/builder/src/app"\n')
    fs.writeFileSync(path.join(dir, 'templates.json'), '{"p":"C:\\\\Users\\\\builder\\\\work"}\n')
    fs.writeFileSync(path.join(dir, 'node.exe'), 'C:\\Users\\builder in a binary is the binary maker\'s business')
    const hits = findLeaks(dir, ['/Users/builder', 'C:\\Users\\builder']).map((h) => h.file.replace(/\\/g, '/')).sort()
    assert.deepEqual(hits, ['apps/server/dist/chunk.js', 'templates.json'])
    // 너무 짧은 바늘(집 폴더가 / 인 기계)은 쓰지 않는다
    assert.deepEqual(findLeaks(dir, ['/', '']), [])
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

test('맥 신뢰: Developer ID · 공증 · 스테이플이 모두 있어야 trusted', () => {
  const adhoc = macTrust({ details: 'Signature=adhoc\nTeamIdentifier=not set\n', assess: 'rejected', assessOk: false, stapled: false })
  assert.deepEqual(adhoc, { signedBy: 'ad-hoc', developerId: false, notarized: false, stapled: false, trusted: false })
  const devId = 'Authority=Developer ID Application: Someone (TEAM123456)\nAuthority=Developer ID Certification Authority\nTeamIdentifier=TEAM123456\n'
  const signedOnly = macTrust({ details: devId, assess: 'rejected\nsource=Unnotarized Developer ID', assessOk: false, stapled: false })
  assert.equal(signedOnly.developerId, true)
  assert.equal(signedOnly.trusted, false)
  const full = macTrust({ details: devId, assess: 'accepted\nsource=Notarized Developer ID', assessOk: true, stapled: true })
  assert.equal(full.trusted, true)
  assert.equal(full.signedBy, 'Developer ID Application: Someone (TEAM123456)')
  // 공증은 됐지만 스테이플이 없으면 오프라인 맥에서 열리지 않는다
  assert.equal(macTrust({ details: devId, assess: 'accepted\nsource=Notarized Developer ID', assessOk: true, stapled: false }).trusted, false)
})

test('켜 보기를 건너뛰는 것은 이 기계가 그 칩을 돌릴 수 없을 때뿐', () => {
  assert.equal(hostCanRun('arm64', 'arm64', false), true)
  assert.equal(hostCanRun('arm64', 'x86_64', true), true)
  assert.equal(hostCanRun('arm64', 'x86_64', false), false)
  assert.equal(hostCanRun('x86_64', 'arm64', true), false)
  assert.equal(hostCanRun('arm64', 'x86_64 arm64', false), true)
  // 칩을 읽지 못하면 여기서는 거짓이지만, 관문은 그런 Node를 건너뛰지 않고 켜 보게 해 거기서 실패시킨다
  assert.equal(hostCanRun('arm64', '', true), false)
})

test('칩: x64 dmg에 arm64 부품이 하나라도 들면 그 파일을 짚는다', () => {
  const files = [{ file: 'Contents/MacOS/emergence-workbench', archs: 'x86_64' }, { file: 'node/bin/node', archs: 'x86_64' }, { file: 'pty.node', archs: 'arm64' }]
  assert.deepEqual(chipMismatches('x86_64', files), ['pty.node (arm64)'])
  assert.deepEqual(chipMismatches('arm64', [{ file: 'u', archs: 'x86_64 arm64' }]), [])
  assert.deepEqual(chipMismatches('arm64', [{ file: 'broken', archs: '' }]), ['broken (알 수 없음)'])
})

test('판정: 단단한 검사 하나라도 어긋나면 실패, 무른 검사는 적기만', () => {
  assert.equal(gatePasses([{ ok: true, hard: true }, { ok: false, hard: false }]), true)
  assert.equal(gatePasses([{ ok: true, hard: true }, { ok: false, hard: true }]), false)
})
