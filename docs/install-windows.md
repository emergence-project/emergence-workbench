# Installing on Windows

There is an installer for Windows 10 and 11 (64-bit). It carries the server, the screens, Node and git, so nothing else needs to be installed.

## Install

1. On the [releases page](https://github.com/emergence-project/emergence-workbench/releases/latest), download `Emergence Workbench_<version>_x64-setup.exe` from **Assets**.
2. Open it. The installer is not signed, so Windows shows **"Windows protected your PC"**. Click **More info**, then **Run anyway**.
3. It installs for your account only and does not ask for administrator rights. **Emergence Workbench** then appears in the Start menu and on the desktop.

The first window is an empty workbench. Use **+ Register project** › **Start new** on Home to start a project, or sign in to GitHub under Settings › Accounts › Getting started to bring in an existing repository.

## Good to know

- **What runs:** opening the window starts the app's own server at `http://127.0.0.1:5174`; closing the window stops it. Nothing outside this computer can reach that address. What the app sends out is listed in [PRIVACY.md](../PRIVACY.md).
- **Settings and logs:** `C:\Users\<name>\.config\research-workspace\`. Server log: `%LOCALAPPDATA%\io.github.emergence-project.workbench\logs\server.log`.
- **git:** the app carries a small git (MinGit). If Git for Windows is installed, that one is used.
- **Agents:** the in-app agent uses Claude Code (`claude`) installed on this computer. Without it only the agent features are off.
- **Manuscript PDFs:** need TeX (MiKTeX or TeX Live). The manuscript templates name Mac fonts, so you may need to change fonts on Windows.
- **Updates:** the app does not update itself yet. Download the new release's installer and run it; it replaces the app and keeps settings and projects.
- **Uninstall:** Settings › Apps › Installed apps › Emergence Workbench. The settings folder and your project folders stay.

## Building (maintainer)

GitHub Actions builds the installer on a Windows machine (`.github/workflows/desktop.yml`).

- Try it: Actions › Desktop (Windows) › Run workflow. Artifacts `windows-installer` (the installer) and `windows-shots` (screens taken on Windows).
- Release: push a tag starting with `v` (e.g. `git tag v0.2.0 && git push origin v0.2.0`); the same job runs and attaches the installer to that tag's release.
- Signing: not signed yet. Removing the "protected your PC" prompt needs a code-signing certificate (e.g. Microsoft Trusted Signing, about $10 a month). Update this section when signing is added.
