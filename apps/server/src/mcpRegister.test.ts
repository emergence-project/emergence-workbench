import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { claudeDesktopConfigs, desktopRegistered, MCP_NAME, registerDesktop } from './mcpRegister.js'

const dirs: string[] = []
const tmpDir = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-reg-')); dirs.push(d); return d }
afterEach(() => { for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }) })

describe('Claude 앱에 MCP 입구 등록', () => {
  const entry = { command: '/app/node', args: ['/app/scripts/mcp.mjs'] }

  it('설정 파일 자리: 앱을 한 번 켜서 폴더가 있는 곳만 (윈도우는 %APPDATA%와 스토어판, 맥은 Application Support)', () => {
    const home = tmpDir()
    const appData = path.join(home, 'AppData', 'Roaming')
    const local = path.join(home, 'AppData', 'Local')
    expect(claudeDesktopConfigs(home, { APPDATA: appData, LOCALAPPDATA: local }, 'win32')).toEqual([])
    fs.mkdirSync(path.join(appData, 'Claude'), { recursive: true })
    fs.mkdirSync(path.join(local, 'Packages', 'Claude_pzs8sxrjxfjjc', 'LocalCache', 'Roaming', 'Claude'), { recursive: true })
    expect(claudeDesktopConfigs(home, { APPDATA: appData, LOCALAPPDATA: local }, 'win32')).toEqual([
      path.join(appData, 'Claude', 'claude_desktop_config.json'),
      path.join(local, 'Packages', 'Claude_pzs8sxrjxfjjc', 'LocalCache', 'Roaming', 'Claude', 'claude_desktop_config.json'),
    ])
    fs.mkdirSync(path.join(home, 'Library', 'Application Support', 'Claude'), { recursive: true })
    expect(claudeDesktopConfigs(home, {}, 'darwin')).toEqual([path.join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json')])
  })

  it('없으면 만들고, 있으면 다른 칸 · 다른 서버는 그대로 두고 한 칸만 더한다', () => {
    const file = path.join(tmpDir(), 'claude_desktop_config.json')
    expect(desktopRegistered(file)).toBe(false)
    registerDesktop(file, entry)
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual({ mcpServers: { [MCP_NAME]: entry } })
    fs.writeFileSync(file, JSON.stringify({ globalShortcut: 'Ctrl+Space', mcpServers: { other: { command: 'x' } } }))
    registerDesktop(file, entry)
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual({ globalShortcut: 'Ctrl+Space', mcpServers: { other: { command: 'x' }, [MCP_NAME]: entry } })
    expect(desktopRegistered(file)).toBe(true)
  })

  it('읽지 못하는 설정 파일은 덮어쓰지 않는다', () => {
    const file = path.join(tmpDir(), 'claude_desktop_config.json')
    fs.writeFileSync(file, '{ broken')
    expect(() => registerDesktop(file, entry)).toThrow(/읽지 못해|Could not read/)
    expect(fs.readFileSync(file, 'utf8')).toBe('{ broken')
  })

  it('다른 이름으로 직접 적은 것도 이 앱의 입구(scripts/mcp.mjs)면 등록된 것으로', () => {
    const file = path.join(tmpDir(), 'claude_desktop_config.json')
    fs.writeFileSync(file, JSON.stringify({ mcpServers: { workbench: { command: 'node', args: ['C:\\app\\scripts\\mcp.mjs'] } } }))
    expect(desktopRegistered(file)).toBe(true)
  })
})
