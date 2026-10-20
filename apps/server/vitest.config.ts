import { defineConfig } from 'vitest/config'

// 파일 감시 테스트(app · libraryWatch · libraryReadIndex · todos)는 package.json test가 다른 테스트 뒤에 하나씩 돌린다:
// 맥에서 여러 파일이 함께 돌면 감시 알림이 가끔 빠진다(리눅스 CI와 따로 돌릴 때는 늘 통과, 10/20 점검).
// 서버 테스트는 임시 저장소를 만들고 git을 돌린다. 느린 맥(8GB)에서 기본 5초에 걸려 실패하지 않게 넉넉히 둔다.
// push.negotiate를 켠 사용자 git 설정에서는 테스트가 만든 bare 저장소로 올릴 때마다 "push negotiation failed" 경고가
// stderr에 쌓여 진짜 실패를 가린다. 테스트에서만 끈다(GIT_CONFIG_COUNT는 사용자 설정보다 앞선다).
export default defineConfig({
  test: {
    env: { RW_LANG: 'ko', GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'push.negotiate', GIT_CONFIG_VALUE_0: 'false' },
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
})
