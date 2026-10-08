import { defineConfig } from 'vitest/config'

// 서버 테스트는 임시 저장소를 만들고 git을 돌린다. 느린 맥(8GB)에서 기본 5초에 걸려 실패하지 않게 넉넉히 둔다.
export default defineConfig({ test: { env: { RW_LANG: 'ko' }, testTimeout: 20_000, hookTimeout: 20_000 } })
