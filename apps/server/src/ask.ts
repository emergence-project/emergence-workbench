import { spawn } from 'node:child_process'
import { applyNoteFixes, parseNoteFixes } from '@rw/core'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { commentSourceFile, commentsFile, guardBody, unguardBody, parseComments, type CommentFile } from './comments.js'
import { answerHead } from './commentFormat.js'
import { hashOf, writeAtomic } from './fsutil.js'
import { ConflictError, WorkbenchError } from './workbench.js'
import { t } from './i18n.js'

/**
 * PDF를 읽으며 남긴 질문에 맥의 Claude Code(`claude -p`)가 답한다 (2026-10-01 결정: 논문 Q&A는 맥의 claude -p).
 * 답은 질문 아래에 `### 답 · claude · 날짜 시각`으로 덧붙이고 `- 상태: 답함`을 단다 (comments.ts의 형식).
 * Claude는 읽기 도구만 쓴다: 저장소 파일을 고치지 않는다.
 */

/** 질문 하나를 Claude에게 넘기고 답 글을 받는다. 테스트에서는 가짜로 바꾼다 */
export type AskRunner = (job: { cwd: string; prompt: string }) => Promise<string>

const ASK_TIMEOUT_MS = 6 * 60_000
const READ_ONLY_TOOLS = 'Read,Glob,Grep'

/** 서비스(launchd)로 돌 때는 PATH가 짧아 claude를 못 찾으므로 흔한 설치 위치를 더한다 */
function claudeEnv(): NodeJS.ProcessEnv {
  const home = os.homedir()
  const extra = [path.join(home, '.local/bin'), path.join(home, '.claude/local'), '/opt/homebrew/bin', '/usr/local/bin']
  return { ...process.env, PATH: [process.env.PATH ?? '', ...extra].filter(Boolean).join(':') }
}

/**
 * cwd는 받은(clone) 저장소일 수 있다. -p는 폴더를 믿을지 묻지 않으므로, 그 저장소의 .claude/settings.json(훅: 셸 명령)과
 * .mcp.json(MCP 서버)을 읽지 않게 사용자 설정만 쓰고 MCP 설정은 모두 건너뛴다.
 */
export const claudeArgs = ['-p', '--output-format', 'text', '--setting-sources', 'user', '--strict-mcp-config']

function runnerWith(args: string[]): AskRunner {
  return ({ cwd, prompt }) => new Promise((resolve, reject) => {
    const bin = process.env.RW_CLAUDE_BIN ?? 'claude'
    const p = spawn(bin, [...claudeArgs, ...args], { cwd, env: claudeEnv(), stdio: ['pipe', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    const timer = setTimeout(() => { p.kill('SIGTERM'); reject(new WorkbenchError(504, t(`Claude가 ${ASK_TIMEOUT_MS / 60_000}분 안에 답하지 못했습니다`, `Claude did not answer within ${ASK_TIMEOUT_MS / 60_000} minutes`))) }, ASK_TIMEOUT_MS)
    p.stdout.on('data', (d: Buffer) => { out += d.toString() })
    p.stderr.on('data', (d: Buffer) => { err += d.toString() })
    p.on('error', (e: NodeJS.ErrnoException) => {
      clearTimeout(timer)
      reject(e.code === 'ENOENT'
        ? new WorkbenchError(503, t('이 컴퓨터에서 claude 명령을 찾지 못했습니다. Claude Code를 설치하고 로그인해 주세요', 'The claude command was not found on this computer. Install Claude Code and sign in'))
        : new WorkbenchError(500, t(`claude를 실행하지 못했습니다: ${e.message}`, `Could not run claude: ${e.message}`)))
    })
    p.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0 && out.trim()) resolve(out.trim())
      else reject(new WorkbenchError(502, t(`Claude가 답하지 못했습니다${err.trim() ? `: ${err.trim().slice(0, 300)}` : ` (종료 코드 ${code})`}`, `Claude could not answer${err.trim() ? `: ${err.trim().slice(0, 300)}` : ` (exit code ${code})`}`)))
    })
    p.stdin.end(prompt)
  })
}

// --tools limits which tools exist at all (the prompt carries untrusted PDF and note text);
// --allowedTools only approves them automatically, so user or project allow rules could otherwise add Edit or Bash.
export const claudeRunner = runnerWith(['--tools', READ_ONLY_TOOLS, '--allowedTools', READ_ONLY_TOOLS])
export const claudeClassifierRunner = runnerWith(['--model', 'haiku', '--tools', ''])

export interface AskContext {
  /** 연구 저장소 (claude가 도는 폴더) */
  repo: string
  /** 질문이 가리키는 파일의 저장소 기준 경로 (찾았으면) */
  file?: string
}

/** 노트 기록 파일과 논문 코멘트 파일 둘 다 (하이라이트는 보지 않는다) */
export function askPrompt(f: Omit<CommentFile, 'highlights'>, id: string, ctx: AskContext): string {
  const q = f.comments.find((c) => c.id === id)!
  return [
    f.target.startsWith('paper-') || f.target.startsWith('manuscript')
      ? t('연구자가 연구 작업대 앱에서 PDF를 읽다가 남긴 질문에 답해 주세요.', 'Answer a question a researcher left while reading a PDF in the Emergence Workbench app.')
      : t('연구자가 연구 작업대 앱에서 자기 노트를 읽다가 남긴 질문이나 부탁(검산, 정리, 반례 찾기 등)에 답해 주세요.', 'Answer a question or request (checking a calculation, tidying up, finding a counterexample, etc.) a researcher left while reading their own note in the Emergence Workbench app.'),
    '',
    t(`- 대상: ${f.title}`, `- Target: ${f.title}`),
    ctx.file ? t(`- 파일: ${ctx.file} (이 폴더 기준)`, `- File: ${ctx.file} (relative to this folder)`) : f.source ? t(`- 원래 파일 이름: ${f.source} (이 폴더 안에서 찾아 주세요)`, `- Original file name: ${f.source} (find it inside this folder)`) : null,
    q.page ? t(`- 위치: ${q.page}쪽`, `- Location: page ${q.page}`) : null,
    q.quote ? t(`- 고른 글: "${q.quote}"`, `- Selected text: "${q.quote}"`) : null,
    q.answers.length ? t(`- 앞서 단 답:\n${q.answers.map((a) => `  ${a.by}: ${a.body.replace(/\n/g, '\n  ')}`).join('\n')}`, `- Earlier answers:\n${q.answers.map((a) => `  ${a.by}: ${a.body.replace(/\n/g, '\n  ')}`).join('\n')}`) : null,
    '',
    t('질문:', 'Question:'),
    q.body || t('(고른 글을 설명해 주세요)', '(Explain the selected text)'),
    '',
    t('지침:', 'Instructions:'),
    t('- 그 파일을 Read로 읽고(가리킨 쪽·고른 글 근처부터) 근거를 찾아 한국어로 답합니다. 기호와 용어는 그 파일을 따릅니다.', '- Read that file with Read (starting near the page or selected text), find the grounds and answer in English. Follow the file\'s notation and terms.'),
    t('- 검산을 부탁하면 식을 한 줄씩 따라가며 맞는지 보고, 틀리면 어디서 왜 틀렸는지와 고친 식을 적습니다.', '- When asked to check a calculation, follow the equations line by line; if something is wrong, say where and why, and give the corrected equation.'),
    ...(canFix(f.target)
      ? [t('- 고칠 글을 제안할 때는(고쳐 달라는 부탁이면 반드시) 노트 원문에서 바꿀 부분을 ```before 블록에 그대로, 바꾼 글을 바로 뒤 ```after 블록에 적습니다. before는 파일의 글과 글자·줄바꿈 하나까지 같아야 하고, 노트 안에 한 곳만 있도록 충분히 길게 고릅니다. 고칠 곳이 여럿이면 쌍을 여럿 둡니다. 연구자가 "노트에 적용"을 누르면 앱이 바꿉니다. 블록 앞에 무엇을 왜 바꾸는지 한두 줄 적습니다.', '- When you suggest a change (always, if asked to fix something), put the part of the note source to replace verbatim in a ```before block, and the new text right after in an ```after block. before must match the file text exactly, down to each character and line break, and be long enough to occur only once in the note. For several changes, use several pairs. When the researcher presses "Apply to note", the app makes the change. Before the blocks, write a line or two on what you change and why.')]
      : [t('- 고칠 글을 제안할 때는 바꿀 부분과 바꾼 글을 그대로 보여 줍니다(연구자가 직접 옮깁니다).', '- When you suggest a change, show the part to replace and the new text verbatim (the researcher copies it over).')]),
    t('- 근거가 된 쪽·식·절 번호를 밝히고, 논문에 없는 추론은 추론이라고 표시합니다. 모르면 모른다고 합니다.', '- Cite the page, equation and section numbers you rely on, and mark reasoning that is not in the paper as your own inference. If you do not know, say so.'),
    t('- 짧은 문단과 - 목록으로 씁니다(제목 줄은 쓰지 않음). 수식은 $…$로 씁니다. 파일은 고치지 않습니다. 답 글만 출력합니다.', '- Write short paragraphs and - lists (no heading lines). Write math as $…$. Do not edit files. Output only the answer text.'),
  ].filter((l) => l !== null).join('\n')
}

/** 질문 아래(다음 코멘트 머리 앞)에 답을 덧붙이고 상태를 답함으로. 그사이 바뀐 파일도 덮어쓰지 않고 그 자리에만 끼운다 */
export function appendAnswer(root: string, target: string, id: string, by: string, body: string, now = new Date(), state: '답함' | '끝냄' = '답함'): CommentFile {
  const file = commentsFile(root, target)
  if (!fs.existsSync(file)) throw new WorkbenchError(404, t('코멘트 파일이 없음', 'No comment file'))
  const lines = fs.readFileSync(file, 'utf8').split('\n')
  const head = lines.findIndex((l) => l.startsWith(`## ${id} · `))
  if (head === -1) throw new WorkbenchError(404, t(`질문이 없음: ${id}`, `No such question: ${id}`))
  let end = lines.findIndex((l, i) => i > head && /^## /.test(l))
  if (end === -1) end = lines.length
  while (end > head + 1 && !lines[end - 1]!.trim()) end--
  const block = ['', answerHead(by, now), '', guardBody(body), '', `- 상태: ${state}`]
  lines.splice(end, 0, ...block)
  const text = lines.join('\n')
  writeAtomic(file, text.endsWith('\n') ? text : `${text}\n`)
  return parseComments(target, fs.readFileSync(file, 'utf8'))
}

/** 앱이 고침을 적용할 수 있는 대상: 연구 저장소의 Markdown 노트 (원고 · 유도 블록 · PDF는 아니다) */
export const canFix = (target: string) => /^(note|calc)-/.test(target)

/**
 * 답에 든 고침(```before/```after)을 노트에 적용한다 (10/7 사용자 요청). 사용자가 "노트에 적용"을 눌렀을 때만 부른다.
 * 기록 파일이 읽은 그대로이고(baseHash), 바꿀 글이 노트에 꼭 한 곳씩 있을 때만 바꾸며, 아니면 아무것도 쓰지 않는다.
 * 적용하면 그 질문 아래에 `### 답 · 앱`으로 적용했다고 남기고 질문을 끝냄으로 둔다.
 */
export function applyAnswerFixes(root: string, target: string, id: string, answer: number, baseHash: string, now = new Date()): CommentFile {
  if (!canFix(target)) throw new WorkbenchError(400, t('연구 노트의 기록에서만 적용할 수 있습니다', 'This can be applied only from a research note\'s records'))
  const file = commentsFile(root, target)
  if (!fs.existsSync(file)) throw new WorkbenchError(404, t('코멘트 파일이 없음', 'No comment file'))
  const raw = fs.readFileSync(file, 'utf8')
  if (hashOf(raw) !== baseHash) throw new ConflictError(t('다른 곳에서 코멘트 파일이 바뀌었음', 'The comment file changed elsewhere'), hashOf(raw))
  const f = parseComments(target, raw)
  const q = f.comments.find((c) => c.id === id)
  const a = q?.answers[answer]
  if (!q || !a || a.by !== 'claude') throw new WorkbenchError(404, t('적용할 답이 없음', 'No answer to apply'))
  if (q.answers.slice(answer + 1).some((later) => later.by === '앱')) throw new WorkbenchError(409, t('이미 노트에 적용한 답입니다', 'This answer is already applied to the note'))
  const fixes = parseNoteFixes(unguardBody(a.body))
  if (!fixes.length) throw new WorkbenchError(400, t('이 답에는 적용할 고침(before/after)이 없습니다', 'This answer has no fixes (before/after) to apply'))
  const source = commentSourceFile(root, f)
  if (!source || !source.endsWith('.md')) throw new WorkbenchError(404, t('고칠 노트 파일을 찾지 못했습니다', 'The note file to fix was not found'))
  const text = fs.readFileSync(source, 'utf8')
  const result = applyNoteFixes(text, fixes)
  if ('error' in result) throw new WorkbenchError(409, result.error)
  if (hashOf(fs.readFileSync(source, 'utf8')) !== hashOf(text)) throw new WorkbenchError(409, t('그사이 노트가 바뀌었습니다. 다시 눌러 주세요', 'The note changed in the meantime. Try again'))
  writeAtomic(source, result.text)
  return appendAnswer(root, target, id, '앱', `${fixes.length === 1 ? '고침을' : `고침 ${fixes.length}곳을`} 노트에 적용했습니다.`, now, '끝냄')
}
