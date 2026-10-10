# Contributing

Thanks for helping. [한국어](#한국어)

## Questions, bugs and requests

- **Questions** (how do I …): the Discussions tab.
- **Bugs and requests**: open an issue with the Bug or Request form. Issues and discussions are public, so leave out unpublished research, manuscripts, coauthor details and screenshots that show them.
- The maintainer answers in the issue. When a fix is merged, the issue closes with the app version that carries it.

## Changing the code

1. Fork this repository and work on a branch of your fork. Do not change the code in the folder your app runs from: the app's update button only fast-forwards, and stops on local commits.
2. Run it with sample data: `pnpm install`, then `pnpm dev` (screen at http://localhost:5173). Sample mode copies sample data into `.sandbox/` and never touches your real config or research repositories.
3. Before you open a pull request:
   - `pnpm test` and `pnpm type-check` pass.
   - If the screen changes: read [docs/design-system.md](docs/design-system.md), run `pnpm shots` before and after, and attach the pictures.
   - No private research content in code, tests, fixtures or pictures. Use the sample data in `fixtures/`.
4. Open the pull request against `main` and fill in the template. One change per pull request.

The maintainer reviews every pull request (`.github/CODEOWNERS`). Pull requests are squash-merged.

### Rules that keep research safe

- **Never lose a manuscript byte.** A change must not rewrite the body of a block or a note it was not asked to change.
- **Never overwrite an outside change.** Writes send the hash they read (`baseHash`); keep that check on every new write path.
- Your data is not app code. Settings live in the config folder (`~/.config/research-workspace/`), private records in your own private repository (`personalRepo:` in `config.yaml`), and research in your research repositories. Nothing in them belongs in a pull request.

[AGENTS.md](AGENTS.md) and [CLAUDE.md](CLAUDE.md) are for coding agents (Claude Code, Codex, …) working in this repository and for maintainers. Human contributors follow this file.

By contributing you agree that your contribution is licensed under the [MIT License](LICENSE).

---

## 한국어

- **질문**은 Discussions 탭, **버그·요청**은 이슈 양식(Bug, Request)으로 올려 주세요. 공개되므로 공개하지 않은 연구 내용·원고·공저자 정보·그런 내용이 보이는 그림은 빼 주세요. 답은 이슈에 달리고, 고쳐지면 그 앱 버전을 적고 닫습니다.
- **코드 기여**: 이 저장소를 fork해서 브랜치에서 고치고 `main`으로 PR을 보내 주세요. 앱이 도는 폴더의 코드는 고치지 마세요(업데이트 버튼은 앞으로 감기만 하고, 로컬 커밋이 있으면 멈춥니다).
- 확인은 `pnpm dev`(예제 모드, `.sandbox/`)에서 하고, PR 전에 `pnpm test`·`pnpm type-check`를 통과시켜 주세요. 화면을 바꾸면 [docs/design-system.md](docs/design-system.md)를 읽고 `pnpm shots` 전후 그림을 붙여 주세요.
- 원고 본문을 잃거나 바깥 수정을 덮어쓰는 변경은 받지 않습니다.
- 내 설정(`~/.config/research-workspace/`)·개인 저장소·연구 저장소는 앱 코드가 아니므로 PR에 넣지 않습니다.
- 모든 PR은 관리자가 검토하고 squash로 합칩니다. 기여한 코드는 [MIT 라이선스](LICENSE)로 공개됩니다.
