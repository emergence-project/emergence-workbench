# 피드백 중계 서버 (Cloudflare Worker)

GitHub 없이 앱을 쓰는 사람(설치 파일로 깐 친구 등)의 피드백을 관리자의 비공개 저장소로 옮기는 작은 서버다.
앱은 피드백을 남기고 30초 뒤(설정 › 동기화의 올리기 간격) 자동으로 이 서버에 보내고, 서버는 저장소의
`feedback/from/<보낸 사람>-<앱 번호>/날짜.md`와 `feedback/pictures/`에 커밋한다. 관리자 앱은 개인 저장소를 받을 때
그것을 함께 읽어 피드백 화면에 보낸 사람 이름 태그를 달아 보여 준다. GitHub 키는 이 서버에만 있고 앱에는 없다.

코드는 `feedback-worker.js` 한 파일이다. 앱 쪽은 `apps/server/src/feedbackRelay.ts`, 폴더 · 그림 이름 규칙은
`apps/server/src/feedbackBundle.ts`와 같아야 하고 `feedbackRelay.test.ts`가 둘을 맞춰 본다.

## 처음 한 번 (관리자, 15분쯤)

1. **GitHub 키:** GitHub › Settings › Developer settings › Personal access tokens › Fine-grained tokens › Generate new token.
   Repository access는 **Only select repositories**로 개인 저장소 하나만, Permissions는 **Contents: Read and write**만. 만료는 1년.
2. **Cloudflare:** https://dash.cloudflare.com 에 가입(무료). Workers & Pages › Create › **Create Worker** › 이름 `workbench-feedback` › Deploy.
3. **코드 붙이기:** 만든 Worker › **Edit code** › 원래 코드를 지우고 `feedback-worker.js` 내용을 붙여 넣고 Deploy.
4. **값 넣기:** Worker › Settings › Variables and Secrets › Add:
   - `GITHUB_TOKEN` (종류 Secret): 1번의 키
   - `REPO` (Text): 개인 저장소, 예 `owner/research-workspace-backup`
   - (고르기) `INVITE_CODE` (Secret): 넣으면 이 코드를 아는 앱만 보낼 수 있다. 지금 앱은 코드를 보내지 않으므로 비워 둔다.
5. **주소 알리기:** Worker 주소(`https://workbench-feedback.<계정>.workers.dev`)를 에이전트에게 주면
   `FEEDBACK_RELAY_URL`(apps/server/src/feedbackRelay.ts)에 넣고 새 설치 파일을 만든다. 주소를 브라우저로 열어
   `{"ok":true,...}`가 보이면 서버가 돌고 있다.

## 한도

한 번에 날짜 파일 60개 · 그림 40장(장마다 4MB) · 25MB까지. 같은 사람의 같은 날짜 파일은 새 글로 바뀐다(앱이 늘 그날의 전체를 보낸다).
Cloudflare 무료 한도는 하루 요청 10만 번이다.

## 끄기

Worker를 지우거나 GitHub 키를 지우면 바로 멈춘다. 앱은 보내지 못한 것을 기억했다가 다음에 다시 보내고, 피드백 화면에서 파일로 보내기도 할 수 있다.
