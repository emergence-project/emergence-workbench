import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { chatExtras, skillsPluginDir, SKILLS_PLUGIN, userConnectors } from './agentExtras.js'
import { promptOf } from './agentChats.js'

let home: string
beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-extras-'))
  process.env.RW_CLAUDE_HOME = home
})
afterEach(() => {
  delete process.env.RW_CLAUDE_HOME
  fs.rmSync(home, { recursive: true, force: true })
})

const skill = (id: string, head: string) => {
  fs.mkdirSync(path.join(home, '.claude', 'skills', id), { recursive: true })
  fs.writeFileSync(path.join(home, '.claude', 'skills', id, 'SKILL.md'), `${head}\n\nbody\n`)
}

describe('Claude Code skills and connectors in app chats', () => {
  it('lists skills by front matter and connectors by name and type only', () => {
    skill('lean-check', '---\nname: lean-check\ndescription: Check a proof\n  in Lean\n---')
    skill('plain', '# no front matter')
    fs.mkdirSync(path.join(home, '.claude', 'skills', 'empty'), { recursive: true })
    fs.writeFileSync(path.join(home, '.claude.json'), JSON.stringify({ mcpServers: {
      zotero: { command: 'npx', args: ['zotero-mcp'], env: { KEY: 'secret' } },
      notion: { type: 'http', url: 'https://mcp.example.com', headers: { Authorization: 'Bearer x' } },
      workbench: { type: 'http', url: 'http://127.0.0.1:5174/mcp' },
      broken: { foo: 1 },
    } }))
    const x = chatExtras('workbench')
    expect(x.skills).toEqual([{ name: 'lean-check', description: 'Check a proof in Lean' }, { name: 'plain', description: '' }])
    expect(x.connectors).toEqual([{ name: 'zotero', type: 'stdio' }, { name: 'notion', type: 'http' }])
    expect(JSON.stringify(x)).not.toContain('secret')
    // 에이전트에는 설정 그대로 (앱 MCP와 같은 이름은 뺀다)
    expect(Object.keys(userConnectors('workbench'))).toEqual(['zotero', 'notion'])
  })

  it('builds one plugin folder per skill list and reuses it', () => {
    expect(skillsPluginDir(path.join(home, 'p'))).toBeNull()
    skill('a', '---\nname: a\ndescription: A\n---')
    const dir = skillsPluginDir(path.join(home, 'p'))!
    expect(JSON.parse(fs.readFileSync(path.join(dir, '.claude-plugin', 'plugin.json'), 'utf8')).name).toBe(SKILLS_PLUGIN)
    expect(fs.readFileSync(path.join(dir, 'skills', 'a', 'SKILL.md'), 'utf8')).toContain('name: a')
    expect(skillsPluginDir(path.join(home, 'p'))).toBe(dir)
    skill('b', '---\nname: b\n---')
    expect(skillsPluginDir(path.join(home, 'p'))).not.toBe(dir)
  })

  it('tells the agent how to use an attached connector', () => {
    expect(promptOf('찾아 줘', [{ kind: 'connector', ref: 'zotero', label: 'zotero' }])).toContain('connector (MCP server; its tools are mcp__<name>__*, use them for this): zotero')
  })
})
