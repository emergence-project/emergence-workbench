import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildApp } from './app.js'
import { apiRunner, readAiKey, writeAiKey } from './aiKey.js'
import { questionRunner, claudeRunner } from './ask.js'

const tmps: string[] = []
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-aikey-')); tmps.push(d); return d }
afterEach(() => { for (const d of tmps.splice(0)) fs.rmSync(d, { recursive: true, force: true }) })

describe('AI 키 (계정 페이지에 넣고 설정 › 에이전트에서 고르기)', () => {
  it('키는 설정 폴더 ai-key.json에만 두고 화면에는 끝 네 자만 보인다', async () => {
    const configDir = tmp()
    const app = buildApp({ configDir })
    try {
      const none = { claude: null, gemini: null }
      expect((await app.inject({ method: 'GET', url: '/api/settings/ai-key' })).json()).toEqual({ key: null, saved: none })
      const put = await app.inject({ method: 'PUT', url: '/api/settings/ai-key', payload: { provider: 'gemini', key: '  AIzaSyEXAMPLE1234  ' } })
      expect(put.statusCode).toBe(200)
      // 처음 넣은 키는 바로 고른다
      expect(put.json()).toEqual({ key: { provider: 'gemini', model: 'gemini-flash-latest', hint: '1234' }, saved: { claude: null, gemini: '1234' } })
      expect(put.body).not.toContain('EXAMPLE')
      expect(readAiKey(configDir)).toEqual({ provider: 'gemini', key: 'AIzaSyEXAMPLE1234' })
      expect(fs.existsSync(path.join(configDir, 'config.yaml')) ? fs.readFileSync(path.join(configDir, 'config.yaml'), 'utf8') : '').not.toContain('EXAMPLE')
      expect((await app.inject({ method: 'PUT', url: '/api/settings/ai-key', payload: { provider: 'gpt', key: 'abcdefghij' } })).statusCode).toBe(400)
      expect((await app.inject({ method: 'PUT', url: '/api/settings/ai-key', payload: { provider: 'chatgpt' } })).statusCode).toBe(400)
      // 두 번째 키는 넣어만 두고, 고르기는 따로
      const two = await app.inject({ method: 'PUT', url: '/api/settings/ai-key', payload: { provider: 'claude', key: 'sk-ant-test-5678' } })
      expect(two.json()).toMatchObject({ key: { provider: 'gemini' }, saved: { claude: '5678', gemini: '1234' } })
      const use = await app.inject({ method: 'PUT', url: '/api/settings/ai-key/use', payload: { provider: 'claude' } })
      expect(use.json()).toMatchObject({ key: { provider: 'claude', hint: '5678' } })
      // 고른 키를 지우면 이 컴퓨터의 claude 명령으로
      expect((await app.inject({ method: 'DELETE', url: '/api/settings/ai-key/claude' })).json()).toEqual({ key: null, saved: { claude: null, gemini: '1234' } })
      expect(readAiKey(configDir)).toBeNull()
      expect((await app.inject({ method: 'PUT', url: '/api/settings/ai-key/use', payload: { provider: 'claude' } })).statusCode).toBe(400)
      // 지운 뒤 다시 넣어도 이미 고른 것(claude 명령)은 그대로
      await app.inject({ method: 'PUT', url: '/api/settings/ai-key', payload: { provider: 'claude', key: 'sk-ant-test-9999' } })
      expect(readAiKey(configDir)).toBeNull()
      expect((await app.inject({ method: 'PUT', url: '/api/settings/ai-key/use', payload: { provider: 'gemini' } })).json()).toMatchObject({ key: { provider: 'gemini' } })
      expect((await app.inject({ method: 'PUT', url: '/api/settings/ai-key/use', payload: { provider: null } })).json()).toMatchObject({ key: null, saved: { claude: '9999', gemini: '1234' } })
    } finally { await app.close() }
  })

  it('예전 모양 { provider, key }도 읽는다', () => {
    const configDir = tmp()
    fs.writeFileSync(path.join(configDir, 'ai-key.json'), JSON.stringify({ provider: 'claude', key: 'sk-ant-old-0001' }))
    expect(readAiKey(configDir)).toEqual({ provider: 'claude', key: 'sk-ant-old-0001' })
    fs.writeFileSync(path.join(configDir, 'ai-key.json'), JSON.stringify({ provider: 'chatgpt' }))
    expect(readAiKey(configDir)).toEqual({ provider: 'chatgpt', key: '' })
  })

  it('키가 없으면 claude 명령, 있으면 API로 답한다', () => {
    const configDir = tmp()
    expect(questionRunner(configDir)).toBe(claudeRunner)
    writeAiKey(configDir, { provider: 'claude', key: 'sk-ant-test-0000' })
    expect(questionRunner(configDir)).not.toBe(claudeRunner)
  })

  it('Gemini에 PDF를 붙여 묻고 답 글을 받는다', async () => {
    const pdf = path.join(tmp(), 'paper.pdf')
    fs.writeFileSync(pdf, '%PDF-1.4 test')
    let sent: { url: string; headers: Record<string, string>; body: { contents: { parts: Record<string, unknown>[] }[] } } | undefined
    const fake: typeof fetch = async (url, init) => {
      sent = { url: String(url), headers: Object.fromEntries(Object.entries(init?.headers ?? {})), body: JSON.parse(String(init?.body)) }
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '식 (3)은 ' }, { text: '보존량입니다.' }] } }] }), { status: 200 })
    }
    const answer = await apiRunner({ provider: 'gemini', key: 'gm-key' }, fake)({ cwd: '.', prompt: '이 식은?', file: pdf })
    expect(answer).toBe('식 (3)은 보존량입니다.')
    expect(sent?.url).toContain('gemini-flash-latest:generateContent')
    expect(sent?.headers['x-goog-api-key']).toBe('gm-key')
    const parts = sent!.body.contents[0]!.parts
    expect(parts[0]).toEqual({ inline_data: { mime_type: 'application/pdf', data: Buffer.from('%PDF-1.4 test').toString('base64') } })
    expect(String(parts[1]!.text)).toContain('이 식은?')
  })

  it('Gemini가 키를 거절하면 다시 넣으라고 알린다', async () => {
    const fake: typeof fetch = async () => new Response(JSON.stringify({ error: { message: 'API key not valid. Please pass a valid API key.' } }), { status: 400 })
    await expect(apiRunner({ provider: 'gemini', key: 'bad' }, fake)({ cwd: '.', prompt: 'q' })).rejects.toMatchObject({ status: 401 })
  })
})
