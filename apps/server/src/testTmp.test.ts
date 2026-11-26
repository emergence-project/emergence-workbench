import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// 2026-11-26: 중간에 죽은 테스트 실행이 임시 폴더에 rw-* 폴더를 남겨 며칠 사이 15GB가 쌓였다.
// 서버 테스트는 실행마다 전용 폴더(scripts/ci/test-tmp.mjs, vitest globalSetup) 안에서만 임시 폴더를 만든다.
describe('테스트의 임시 폴더', () => {
  it('실행 전용 폴더다: 테스트가 만드는 임시 폴더는 모두 그 안에 생긴다', () => {
    expect(path.basename(os.tmpdir())).toMatch(/^rw-testrun-/)
    expect(fs.existsSync(path.join(os.tmpdir(), '.pid'))).toBe(true)
    const made = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'rw-test-'))
    expect(path.basename(path.dirname(made))).toMatch(/^rw-testrun-/) // 일부러 지우지 않는다: 실행이 끝나면 함께 지워진다
  })
})
