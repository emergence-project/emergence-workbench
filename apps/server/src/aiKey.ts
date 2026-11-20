// 앱이 직접 AI에게 묻기 (11/8 "인공지능 에이전트가 없는 친구도 논문을 읽으며 질문"): 계정 페이지에 Claude(Anthropic) 키나 Gemini 키를 넣고 설정 › 에이전트에서 고르면
// 기록 · 논문의 질문에 claude 명령 대신 그 API가 답한다. 파일을 읽는 도구가 없으므로 질문이 가리키는 파일(PDF · 노트)을 요청에 붙인다.
// ChatGPT(11/8 사용자 "친구가 chatgpt를 유료로 쓴다")는 키 대신 Codex CLI에 ChatGPT 계정으로 로그인해 그 요금제로 답한다(codexCli.ts).
// 키는 이 컴퓨터의 앱 설정 폴더 ai-key.json에만 둔다(config.yaml과 따로: 설정 사본을 올려도 키는 나가지 않는다). 화면에는 끝 네 자만 보인다.
import Anthropic from '@anthropic-ai/sdk'
import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import type { AskRunner } from './ask.js'
import { writeAtomic } from './fsutil.js'
import { codexAsk } from './codexCli.js'
import { t } from './i18n.js'
import { WorkbenchError } from './workbench.js'

export type AiProvider = 'claude' | 'gemini' | 'chatgpt'
/** chatgpt는 키가 없다 (key: '') */
export interface AiKey { provider: AiProvider; key: string }

/** 고르지 않으면 쓰는 모델. Gemini는 늘 최신 Flash를 가리키는 이름(무료 키로도 됨) */
export const AI_MODELS: Record<AiProvider, string> = { claude: 'claude-opus-5-5', gemini: 'gemini-flash-latest', chatgpt: 'Codex' }
/** 요청 하나에 붙일 수 있는 파일 크기 (Claude 32MB, Gemini 바로 붙이기 20MB: base64로 1/3 커진다) */
const MAX_ATTACH_BYTES = 14 * 1024 * 1024
const TIMEOUT_MS = 6 * 60_000

const keyFile = (configDir: string) => path.join(configDir, 'ai-key.json')

type KeyProvider = Exclude<AiProvider, 'chatgpt'>
/** ai-key.json: 넣어 둔 키(계정 페이지)와 질문에 고른 AI(설정 › 에이전트). use가 없으면 아직 고른 적 없음, null이면 이 컴퓨터의 claude 명령 */
interface AiKeyFile { use?: AiProvider | null; keys: Partial<Record<KeyProvider, string>> }

const Str = z.string().min(1).optional().catch(undefined)
const Prov = z.enum(['claude', 'gemini', 'chatgpt'])
/** 예전 모양 { provider, key }: 키 하나를 넣으면 곧 그것을 골랐다 */
const OldFile = z.object({ provider: Prov, key: z.unknown().optional() })
const NewFile = z.object({
  use: Prov.nullable().optional().catch(undefined),
  keys: z.object({ claude: Str, gemini: Str }).catch({}),
}).catch({ keys: {} })

export function readAiKeys(configDir: string): AiKeyFile {
  let v: unknown
  try { v = JSON.parse(fs.readFileSync(keyFile(configDir), 'utf8')) } catch { return { keys: {} } }
  const old = OldFile.safeParse(v)
  if (old.success) {
    const { provider, key } = old.data
    return { use: provider, keys: provider !== 'chatgpt' && typeof key === 'string' && key ? { [provider]: key } : {} }
  }
  const f = NewFile.parse(v ?? {})
  const keys: AiKeyFile['keys'] = {}
  if (f.keys.claude) keys.claude = f.keys.claude
  if (f.keys.gemini) keys.gemini = f.keys.gemini
  return { ...(f.use !== undefined ? { use: f.use } : {}), keys }
}

function writeAiKeys(configDir: string, f: AiKeyFile): void {
  fs.mkdirSync(configDir, { recursive: true })
  writeAtomic(keyFile(configDir), JSON.stringify(f) + '\n')
  try { fs.chmodSync(keyFile(configDir), 0o600) } catch { /* 윈도우 */ }
}

/** 질문에 답할 AI: 고른 것이 쓸 수 있을 때만 (고른 키를 지웠으면 null = claude 명령) */
export function readAiKey(configDir: string): AiKey | null {
  const f = readAiKeys(configDir)
  if (f.use === 'chatgpt') return { provider: 'chatgpt', key: '' }
  if (f.use && f.keys[f.use]) return { provider: f.use, key: f.keys[f.use]! }
  return null
}

/** 키 넣기 (계정 페이지). 아직 아무것도 고른 적 없으면 넣은 키를 고른다: 처음 넣는 사람은 고르기를 따로 하지 않아도 된다 */
export function saveAiKey(configDir: string, provider: KeyProvider, key: string): void {
  const f = readAiKeys(configDir)
  f.keys[provider] = key.trim()
  if (f.use === undefined) f.use = provider
  writeAiKeys(configDir, f)
}

export function removeAiKey(configDir: string, provider: KeyProvider): void {
  const f = readAiKeys(configDir)
  delete f.keys[provider]
  if (f.use === provider) f.use = null
  writeAiKeys(configDir, f)
}

/** 질문에 답할 AI 고르기 (설정 › 에이전트) */
export function useAi(configDir: string, provider: AiProvider | null): void {
  writeAiKeys(configDir, { ...readAiKeys(configDir), use: provider })
}

/** 시험 · 예전 호출용: 키를 넣고 그것을 고른다 (null이면 모두 지움) */
export function writeAiKey(configDir: string, k: { provider: AiProvider; key?: string } | null): void {
  if (!k) { fs.rmSync(keyFile(configDir), { force: true }); return }
  if (k.provider !== 'chatgpt') saveAiKey(configDir, k.provider, k.key ?? '')
  useAi(configDir, k.provider)
}

/** 화면에 보일 때: 고른 AI와 모델, 넣어 둔 키마다 끝 네 자 */
export function aiKeyView(configDir: string) {
  const k = readAiKey(configDir)
  const { keys } = readAiKeys(configDir)
  return {
    key: k ? { provider: k.provider, model: AI_MODELS[k.provider], hint: k.key.slice(-4) } : null,
    saved: { claude: keys.claude?.slice(-4) ?? null, gemini: keys.gemini?.slice(-4) ?? null },
  }
}

const NO_TOOLS = t('\n\n(이 답에서는 Read 같은 도구를 쓸 수 없습니다. 위에서 말한 파일은 이 메시지에 붙어 있으니 그것을 읽고 답하세요.)', '\n\n(No tools such as Read are available for this answer. The file mentioned above is attached to this message; read it and answer.)')

interface Attached { kind: 'pdf' | 'text'; data: string; name: string }
function attach(file: string | undefined): Attached | null {
  if (!file) return null
  let size: number
  try { size = fs.statSync(file).size } catch { return null }
  if (size > MAX_ATTACH_BYTES) throw new WorkbenchError(413, t(`파일이 너무 커서(${Math.round(size / 1024 / 1024)}MB) AI에게 붙일 수 없습니다`, `The file is too large (${Math.round(size / 1024 / 1024)} MB) to send to the AI`))
  const name = path.basename(file)
  return /\.pdf$/i.test(file) ? { kind: 'pdf', data: fs.readFileSync(file).toString('base64'), name } : { kind: 'text', data: fs.readFileSync(file, 'utf8'), name }
}

function claudeAsk(key: string, file: Attached | null, prompt: string): Promise<string> {
  const client = new Anthropic({ apiKey: key, timeout: TIMEOUT_MS, maxRetries: 2 })
  const content: Anthropic.ContentBlockParam[] = []
  // 같은 논문에 묻는 다음 질문은 붙인 파일을 캐시에서 읽어 싸다
  if (file?.kind === 'pdf') content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: file.data }, title: file.name, cache_control: { type: 'ephemeral' } })
  if (file?.kind === 'text') content.push({ type: 'document', source: { type: 'text', media_type: 'text/plain', data: file.data }, title: file.name, cache_control: { type: 'ephemeral' } })
  content.push({ type: 'text', text: prompt + (file ? NO_TOOLS : '') })
  return client.messages.create({ model: AI_MODELS.claude, max_tokens: 16000, output_config: { effort: 'medium' }, messages: [{ role: 'user', content }] })
    .then((r) => {
      if (r.stop_reason === 'refusal') throw new WorkbenchError(502, t('Claude가 이 질문에 답하지 않았습니다', 'Claude declined to answer this question'))
      const text = r.content.flatMap((b) => b.type === 'text' ? [b.text] : []).join('').trim()
      if (!text) throw new WorkbenchError(502, t('Claude가 빈 답을 보냈습니다', 'Claude returned an empty answer'))
      return text
    }, (e: unknown) => {
      if (e instanceof Anthropic.AuthenticationError) throw new WorkbenchError(401, t('Claude API 키가 맞지 않습니다. 계정 페이지에서 키를 다시 넣어 주세요', 'The Claude API key was rejected. Enter it again on the Account page'))
      if (e instanceof Anthropic.RateLimitError) throw new WorkbenchError(429, t('Claude API 사용 한도에 걸렸습니다. 잠시 뒤 다시 하거나 크레딧을 확인하세요', 'The Claude API rate or credit limit was hit. Try again later or check your credits'))
      if (e instanceof Anthropic.APIError) throw new WorkbenchError(502, t(`Claude API 오류 (${e.status ?? '연결'}): ${e.message.slice(0, 300)}`, `Claude API error (${e.status ?? 'connection'}): ${e.message.slice(0, 300)}`))
      throw e
    })
}

interface GeminiReply { candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[]; error?: { message?: string }; promptFeedback?: { blockReason?: string } }
async function geminiAsk(key: string, file: Attached | null, prompt: string, fetchFn: typeof fetch): Promise<string> {
  const parts: unknown[] = []
  if (file?.kind === 'pdf') parts.push({ inline_data: { mime_type: 'application/pdf', data: file.data } })
  if (file?.kind === 'text') parts.push({ text: `--- ${file.name} ---\n${file.data}\n--- end ---` })
  parts.push({ text: prompt + (file ? NO_TOOLS : '') })
  let res: Response
  try {
    res = await fetchFn(`https://generativelanguage.googleapis.com/v1beta/models/${AI_MODELS.gemini}:generateContent`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ contents: [{ role: 'user', parts }] }), signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (e) { throw new WorkbenchError(502, t(`Gemini에 닿지 못했습니다: ${e instanceof Error ? e.message : String(e)}`, `Could not reach Gemini: ${e instanceof Error ? e.message : String(e)}`)) }
  const body: GeminiReply = await res.json().catch(() => ({}))
  if (res.status === 400 && /api key/i.test(body.error?.message ?? '') || res.status === 401 || res.status === 403) throw new WorkbenchError(401, t('Gemini API 키가 맞지 않습니다. 계정 페이지에서 키를 다시 넣어 주세요', 'The Gemini API key was rejected. Enter it again on the Account page'))
  if (res.status === 429) throw new WorkbenchError(429, t('Gemini 사용 한도에 걸렸습니다. 잠시 뒤 다시 해 주세요', 'The Gemini rate limit was hit. Try again later'))
  if (!res.ok) throw new WorkbenchError(502, t(`Gemini 오류 (${res.status}): ${(body.error?.message ?? '').slice(0, 300)}`, `Gemini error (${res.status}): ${(body.error?.message ?? '').slice(0, 300)}`))
  const text = (body.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('').trim()
  if (!text) throw new WorkbenchError(502, body.promptFeedback?.blockReason ? t('Gemini가 이 질문에 답하지 않았습니다', 'Gemini declined to answer this question') : t('Gemini가 빈 답을 보냈습니다', 'Gemini returned an empty answer'))
  return text
}

/** API 키로 답하는 AskRunner. job.file(절대 경로)이 있으면 요청에 붙인다 */
export function apiRunner(k: AiKey, fetchFn: typeof fetch = fetch, configDir = ''): AskRunner {
  if (k.provider === 'chatgpt') return ({ cwd, prompt, file }) => codexAsk(configDir, cwd, prompt, file)
  return async ({ prompt, file }) => {
    const f = attach(file)
    return k.provider === 'claude' ? claudeAsk(k.key, f, prompt) : geminiAsk(k.key, f, prompt, fetchFn)
  }
}
