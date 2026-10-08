// 에이전트용 입구 (MCP, stdio). Claude Code · Codex 설정에 등록해 쓴다: docs/agent-mcp.md
// 표준 출력은 MCP 메시지만 쓴다. 맥에서 도는 앱 서버(RW_URL, 기본 http://127.0.0.1:8130)를 부른다.
import { tsxApi } from './ci/tsx-api.mjs'

const { tsImport } = await tsxApi()
const { startStdio } = await tsImport('../apps/server/src/mcp.ts', { parentURL: import.meta.url, tsconfig: false })
await startStdio()
