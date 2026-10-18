import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { readYaml, writeYaml } from './yamlFile.js'

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-yaml-'))
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }))

describe('YAML 파일 읽기·쓰기', () => {
  it('없으면 undefined, 비었으면 null, 깨졌으면 던진다', () => {
    expect(readYaml(path.join(tmp, 'none.yaml'))).toBeUndefined()
    fs.writeFileSync(path.join(tmp, 'empty.yaml'), '')
    expect(readYaml(path.join(tmp, 'empty.yaml'))).toBeNull()
    fs.writeFileSync(path.join(tmp, 'bad.yaml'), 'a: [1\n')
    expect(() => readYaml(path.join(tmp, 'bad.yaml'))).toThrow()
  })
  it('머리 주석과 함께 YAML.stringify 그대로 쓰고, 임시 파일을 남기지 않는다', () => {
    const file = path.join(tmp, 'sub', 'a.yaml')
    writeYaml(file, { name: '노트', list: [1, 2] }, { header: '# 앱이 씀\n' })
    expect(fs.readFileSync(file, 'utf8')).toBe('# 앱이 씀\nname: 노트\nlist:\n  - 1\n  - 2\n')
    expect(readYaml(file)).toEqual({ name: '노트', list: [1, 2] })
    expect(fs.readdirSync(path.dirname(file))).toEqual(['a.yaml'])
  })
  it('mode를 주면 그 권한으로 쓴다', () => {
    const file = path.join(tmp, 'secret.yaml')
    writeYaml(file, { k: 'v' }, { mode: 0o600 })
    expect(fs.statSync(file).mode & 0o777).toBe(0o600)
  })
})
