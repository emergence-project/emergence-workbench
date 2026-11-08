import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { isLatexSafePath } from './fsutil.js'
import { Registry } from './registry.js'
import { prepareStarter, starterFolder } from './starter.js'
import { onPath } from './routes/setup.js'

const tmps: string[] = []
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-starter-')); tmps.push(d); return d }
afterEach(() => { for (const d of tmps.splice(0)) fs.rmSync(d, { recursive: true, force: true }) })
const template = path.resolve(import.meta.dirname, '../../../templates/shared-library')

describe('처음 켠 내려받은 앱', () => {
  it('문서 폴더에 라이브러리와 PDF 폴더를 만들고 설정에 적는다', () => {
    const home = tmp()
    fs.mkdirSync(path.join(home, 'Documents'))
    const reg = new Registry(path.join(home, 'config'))
    const lib = prepareStarter(reg, template, home)
    const base = path.join(home, 'Documents', 'EmergenceWorkbench')
    expect(lib).toBe(path.join(base, 'library'))
    expect(fs.existsSync(path.join(base, 'library/preamble/base.tex'))).toBe(true)
    expect(reg.libraryPath).toBe(fs.realpathSync(path.join(base, 'library')))
    expect(reg.pdfFolders).toEqual([path.join(base, 'papers')])
    expect(starterFolder(home)).toBe(base)
  })
  it('라이브러리를 이미 정했거나 프로젝트가 있으면 건드리지 않는다', () => {
    const home = tmp()
    const reg = new Registry(path.join(home, 'config'))
    const mine = path.join(home, 'mine'); fs.mkdirSync(mine)
    reg.setLibrary(mine)
    expect(prepareStarter(reg, template, home)).toBeNull()
    expect(fs.existsSync(path.join(home, 'EmergenceWorkbench'))).toBe(false)
  })
  it('공백이 든 경로에는 만들지 않는다 (LaTeX가 읽지 못함)', () => {
    const home = path.join(tmp(), 'John Smith'); fs.mkdirSync(home)
    expect(prepareStarter(new Registry(path.join(home, 'config')), template, home, 'darwin')).toBeNull()
  })
  it('윈도우에서 사용자 이름에 공백이 있으면 드라이브 바로 아래에 만든다', () => {
    const home = path.join(tmp(), 'John Smith'); fs.mkdirSync(path.join(home, 'Documents'), { recursive: true })
    const drive = tmp()
    const reg = new Registry(path.join(home, 'config'))
    expect(starterFolder(home, 'win32', drive)).toBe(path.join(drive, 'EmergenceWorkbench'))
    expect(prepareStarter(reg, template, home, 'win32', drive)).toBe(path.join(drive, 'EmergenceWorkbench', 'library'))
    expect(reg.pdfFolders).toEqual([path.join(drive, 'EmergenceWorkbench', 'papers')])
  })
})

describe('윈도우 경로', () => {
  it('\\는 경로 구분자로 본다', () => {
    expect(isLatexSafePath('C:\\Users\\kim\\Documents\\EmergenceWorkbench\\library', 'win32')).toBe(true)
    expect(isLatexSafePath('C:\\Users\\John Smith\\library', 'win32')).toBe(false)
    expect(isLatexSafePath('/a\\b', 'darwin')).toBe(false)
  })
  it('명령은 .exe · .cmd도 찾는다', () => {
    const d = tmp()
    fs.writeFileSync(path.join(d, 'latexmk.exe'), '', { mode: 0o755 })
    expect(onPath('latexmk', `C:\\nowhere;${d}`, 'win32')).toBe(true)
    expect(onPath('claude', d, 'win32')).toBe(false)
  })
})
