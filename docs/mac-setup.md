# Running it on a Mac

[한국어](mac-setup.ko.md)

You need Node 22 and pnpm. TeX Live (latexmk, xelatex, synctex) is only needed for compiling.

**Background service.** For everyday use the app runs as a macOS background service (a LaunchAgent). It starts when you log in, restarts if it stops, and does not depend on any terminal window or agent session. One server serves the built screen and the API at `http://127.0.0.1:5174`.

```sh
pnpm install
pnpm service:install    # build the screen, register and start the service (once)
pnpm service:restart    # rebuild and restart after the code changes
pnpm service:status     # is it running
pnpm service:logs       # recent log (~/Library/Logs/research-workspace.log)
pnpm service:uninstall  # remove the service (research files and settings stay)
```

The update button in Settings does the same as `service:restart`: it fast-forwards to the new version on GitHub, rebuilds and restarts the service. It stops if the app folder has local commits.

Automatic updates (2026-10-09): when running as the service, the app pulls new versions every 10 minutes and builds them into `apps/web/dist-next` (the served `dist` stays as is). It restarts only while idle: an open window has had no input for 5 minutes and nothing left to save, or no window is open and no write request came for 5 minutes. Running requests (compile, paper download, questions) postpone it. "New version · Restart" in the top bar restarts right away. When the server starts on the new commit it swaps `dist-next` in as `dist`. Local code edits on the Mac stop the pull.

**Opening it.** `zsh scripts/make-app.sh` makes an app launcher in `~/Applications` with a shortcut on the Desktop (icon source: `scripts/app-icon.svg`). It opens the app in a window without an address bar.

**A Dock icon of its own.** In the Chrome window that shows the app, choose ⋮ › Cast, save and share › **Install page as app** (install details: `apps/web/public/manifest.webmanifest`). The app then opens in its own window with its own Dock icon; right-click it in the Dock › Options › Keep in Dock. The launcher opens the installed app when there is one. In Safari (macOS 14 or later), File › Add to Dock does the same.

**iPad access to code (optional).** `scripts/remote/ipad-code-server.sh` serves this Mac's code-server (VS Code in the browser) on the Tailscale address only, with password login on. Run it as a LaunchAgent; the password lives in the code-server config file. It waits for Tailscale to come up. Tests: `pnpm test:scripts`.

**Settings.** The slider icon at the bottom of the rail. Theme, text size, density, accent color, editor font and screen language are saved under `ui:` in the app config (`~/.config/research-workspace/config.yaml`). The same file holds the registered projects and tags, the shared library (`library`) and an Obsidian vault to read (`study`). The ⓘ above it is the About page, and the speech bubble collects feedback.

**Project sources and STATUS.md.** List `sources:` in a project's `workbench/research.yaml` (canonical folder `canon`, task list `tasks`, `bib`, materials folder `materials`, review documents `reviews`, manuscript `manuscript`) and the app reads them. With `agent-status: true` the app rewrites `workbench/STATUS.md`, a summary for agents to read first, whenever something changes (generated, not tracked by git).

**Feedback mode.** Turn on the speech bubble at the right of the title bar and click any part of the screen to leave a comment on it. Comments go to `feedback/<date>.md` with the part name (each element's `data-ui`), so a coding agent knows exactly which part you meant. `feedback/` lives in your personal repository (`personalRepo:` in the config) or, without one, only on this computer. To tell other people, "Send to GitHub" in the feedback window opens an issue draft ([maintaining.md](maintaining.md)).

**Development.** `pnpm dev` runs the server on 8130 and the screen on 5173; `pnpm test` runs the tests. `pnpm start` builds and runs on 5174 without the service (it stops when you close the terminal).

`pnpm dev` is sample mode (`RW_SANDBOX=1`). Its ports differ from the service, so both can run at once. It uses `.sandbox/config` as settings and copies the sample project (`fixtures/sample-research`) into `.sandbox/`; your real `~/.config/research-workspace` and research repositories are never touched. `pnpm dev:en` uses the English sample. The Claude Code preview setup is `.claude/launch.json`.
