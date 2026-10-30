# Security

[한국어](#한국어)

## Reporting a vulnerability

Please do not open a public issue. Use **Report a vulnerability** on this repository's Security tab (GitHub private vulnerability reporting). Include the app version (Settings › About this app), what you did, and what happened.

## Supported versions

Only the latest release and `main` get security fixes.

## How the app limits harm

- The server listens on `127.0.0.1` only and checks the `Origin` of every request, so web pages you visit cannot call it.
- Writes send the hash they read and are refused when the file changed in between, so neither you nor an agent silently overwrites the other.
- LaTeX compiles run `latexmk -norc`, so a `latexmkrc` file inside a cloned repository is never executed.
- Paths are checked to stay inside the project folder before any read or write.

---

## 한국어

**취약점 알리기:** 공개 이슈로 올리지 말고, 이 저장소 Security 탭의 **Report a vulnerability**(비공개 취약점 보고)를 써 주세요. 앱 버전(설정 › 앱 기본정보), 한 일, 일어난 일을 적어 주세요.

**고치는 버전:** 최신 릴리스와 `main`만 보안 수정을 받습니다.

**앱이 피해를 줄이는 방법:** 서버는 `127.0.0.1`에서만 열리고 요청마다 `Origin`을 확인해, 내가 방문한 웹 페이지가 앱을 부르지 못합니다. 쓰기는 읽을 때 받은 hash를 확인해 바깥에서 고친 내용을 덮어쓰지 않습니다. LaTeX 컴파일은 `latexmk -norc`로 돌려, 받은 저장소에 든 `latexmkrc`를 실행하지 않습니다. 읽고 쓰기 전에 경로가 프로젝트 폴더 안인지 확인합니다.
