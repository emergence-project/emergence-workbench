// Emergence Workbench 창 (Tauri, 10/30 결정 "데스크톱 앱은 Tauri").
// 서버는 둘 중 하나다.
// - 저장소에서 설치한 맥(scripts/install.sh): 로그인 때 켜지는 서비스(scripts/service.sh). 창을 닫아도 에이전트 · 동기화는 계속 돈다.
// - 내려받은 앱(make-desktop.sh --standalone): 앱 안에 묶은 Node와 서버(scripts/bundle-app.mjs)를 창이 켜고, 앱을 끝내면 함께 끈다.
//   서비스가 있거나 서버가 이미 답하면 묶은 서버를 켜지 않는다.
// 창은 먼저 loading/index.html을 띄워 서버가 답할 때까지 기다린 뒤 서버 화면(127.0.0.1:5174)으로 넘어간다.
// 서버 밖 주소(논문 링크, GitHub 등)는 창 안에서도, 새 창으로도 열지 않고 기본 브라우저로 보낸다.
// 창 크기 · 자리는 window-state가, 마지막에 보던 화면은 last-url 파일이 기억한다. 메뉴는 맥 표준 메뉴에 설정 · 업데이트 · 새로 고침을 더한 것.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::net::{SocketAddr, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::Duration;
use tauri::menu::{AboutMetadata, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::webview::NewWindowResponse;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent, Wry};
use url::Url;

/// 서버 주소. scripts/open-app.sh · service.sh와 같다
const SERVER_PORT: u16 = 5174;

/// 창 안에서 열어도 되는 주소: 로딩 쪽(앱 안 파일)과 이 컴퓨터의 서버
fn stays_inside(url: &Url) -> bool {
    match url.scheme() {
        "tauri" | "asset" | "about" | "data" | "blob" => true,
        "http" | "https" => {
            let local = matches!(url.host_str(), Some("127.0.0.1" | "localhost" | "tauri.localhost"));
            local && (url.port_or_known_default() == Some(SERVER_PORT) || url.host_str() == Some("tauri.localhost"))
        }
        _ => false,
    }
}

/// 다음에 열 때 이어 볼 화면: 서버 화면이면 그 주소, 아니면 없음
fn resume_target(url: &Url) -> Option<String> {
    let server = matches!(url.scheme(), "http" | "https")
        && matches!(url.host_str(), Some("127.0.0.1" | "localhost"))
        && url.port_or_known_default() == Some(SERVER_PORT);
    server.then(|| url.to_string())
}

fn last_url_file(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|d| d.join("last-url"))
}

/// 여는 중 쪽이 읽는 값: 지난번에 보던 서버 화면(JSON 글), 없으면 null
fn resume_script(app: &AppHandle) -> String {
    let last = last_url_file(app)
        .and_then(|f| std::fs::read_to_string(f).ok())
        .and_then(|s| Url::parse(s.trim()).ok())
        .and_then(|u| resume_target(&u));
    let value = last.map(|u| format!("{u:?}")).unwrap_or_else(|| "null".into());
    format!("window.__rwResume = {value};")
}

fn remember_page(window: &WebviewWindow) {
    let (Ok(url), Some(file)) = (window.url(), last_url_file(window.app_handle())) else { return };
    if let Some(target) = resume_target(&url) {
        if let Some(dir) = file.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        let _ = std::fs::write(file, target);
    }
}

/// 맥 표준 메뉴(앱 · 편집 · 보기 · 창, 이름은 맥 한국어 메뉴와 같게)에 앱의 설정 · 업데이트 · 새로 고침 · 처음 화면을 더한다
fn app_menu(app: &AppHandle) -> tauri::Result<Menu<Wry>> {
    let about = AboutMetadata { name: Some("Emergence Workbench".into()), ..Default::default() };
    let app_sub = Submenu::with_items(app, "Emergence Workbench", true, &[
        &PredefinedMenuItem::about(app, Some("Emergence Workbench 정보"), Some(about))?,
        &PredefinedMenuItem::separator(app)?,
        &MenuItem::with_id(app, "settings", "설정…", true, Some("CmdOrCtrl+,"))?,
        &MenuItem::with_id(app, "update", "업데이트 확인…", true, None::<&str>)?,
        &PredefinedMenuItem::separator(app)?,
        &PredefinedMenuItem::services(app, Some("서비스"))?,
        &PredefinedMenuItem::separator(app)?,
        &PredefinedMenuItem::hide(app, Some("Emergence Workbench 가리기"))?,
        &PredefinedMenuItem::hide_others(app, Some("기타 가리기"))?,
        &PredefinedMenuItem::show_all(app, Some("모두 보기"))?,
        &PredefinedMenuItem::separator(app)?,
        // 맥 표준 종료(NSApp terminate)는 ExitRequested 없이 끝나 보던 화면을 기억할 틈이 없다. 그래서 직접 만든다
        &MenuItem::with_id(app, "quit", "Emergence Workbench 종료", true, Some("CmdOrCtrl+Q"))?,
    ])?;
    let edit = Submenu::with_items(app, "편집", true, &[
        &PredefinedMenuItem::undo(app, Some("실행 취소"))?,
        &PredefinedMenuItem::redo(app, Some("실행 복귀"))?,
        &PredefinedMenuItem::separator(app)?,
        &PredefinedMenuItem::cut(app, Some("잘라내기"))?,
        &PredefinedMenuItem::copy(app, Some("복사하기"))?,
        &PredefinedMenuItem::paste(app, Some("붙여넣기"))?,
        &PredefinedMenuItem::select_all(app, Some("전체 선택"))?,
    ])?;
    let view = Submenu::with_items(app, "보기", true, &[
        &MenuItem::with_id(app, "reload", "새로 고침", true, Some("CmdOrCtrl+R"))?,
        &MenuItem::with_id(app, "home", "처음 화면", true, Some("CmdOrCtrl+Shift+H"))?,
        &PredefinedMenuItem::separator(app)?,
        &PredefinedMenuItem::fullscreen(app, Some("전체 화면"))?,
    ])?;
    let window = Submenu::with_items(app, "창", true, &[
        &PredefinedMenuItem::minimize(app, Some("최소화"))?,
        &PredefinedMenuItem::maximize(app, Some("확대/축소"))?,
        &PredefinedMenuItem::separator(app)?,
        &PredefinedMenuItem::close_window(app, Some("윈도우 닫기"))?,
    ])?;
    Menu::with_items(app, &[&app_sub, &edit, &view, &window])
}

/// 메뉴 항목이 창 안 화면에 하는 일 (서버 화면의 주소 #만 바꾼다)
fn menu_script(id: &str) -> Option<String> {
    let server = format!("http://127.0.0.1:{SERVER_PORT}/");
    Some(match id {
        "settings" => format!("location.href = {:?}", format!("{server}#/settings")),
        "update" => format!("location.href = {:?}", format!("{server}#/settings/sync")),
        "home" => format!("location.href = {server:?}"),
        "reload" => "location.reload()".into(),
        _ => return None,
    })
}

/// 기본 브라우저(메일 주소면 메일 앱)로 연다
fn open_outside(url: &Url) {
    #[cfg(target_os = "macos")]
    let _ = Command::new("open").arg(url.as_str()).spawn();
    #[cfg(target_os = "windows")]
    let _ = Command::new("cmd").args(["/C", "start", "", url.as_str()]).spawn();
    #[cfg(all(unix, not(target_os = "macos")))]
    let _ = Command::new("xdg-open").arg(url.as_str()).spawn();
}

/// 앱이 켠 묶은 서버 (끝낼 때 함께 끈다)
struct BundledServer(Mutex<Option<Child>>);

/// 서버 서비스(launchd)가 이 맥에 등록돼 있는지
fn service_installed() -> bool {
    #[cfg(target_os = "macos")]
    {
        if let Some(home) = std::env::var_os("HOME") {
            return Path::new(&home).join("Library/LaunchAgents/com.research-workspace.app.plist").exists();
        }
    }
    false
}

fn server_answers() -> bool {
    let addr = SocketAddr::from(([127, 0, 0, 1], SERVER_PORT));
    TcpStream::connect_timeout(&addr, Duration::from_millis(300)).is_ok()
}

/// 앱 안에 묶은 Node와 서버 (resources/standalone, scripts/bundle-app.mjs). 없으면 None
fn bundled_paths(resources: &Path) -> Option<(PathBuf, PathBuf)> {
    let root = resources.join("standalone");
    let node = root.join("node/bin/node");
    let entry = root.join("app/apps/server/dist/server.mjs");
    (node.is_file() && entry.is_file()).then_some((node, entry))
}

/// 묶은 서버가 쓸 PATH: 서비스(serve.sh)처럼 TeX · Homebrew · 사용자 도구(claude 등)를 찾게 한다
fn bundled_path_env() -> String {
    let home = std::env::var("HOME").unwrap_or_default();
    let mut dirs = vec![
        format!("{home}/.local/bin"),
        "/opt/homebrew/bin".into(),
        "/usr/local/bin".into(),
        "/Library/TeX/texbin".into(),
        "/usr/bin".into(),
        "/bin".into(),
        "/usr/sbin".into(),
        "/sbin".into(),
    ];
    if let Ok(p) = std::env::var("PATH") {
        dirs.extend(p.split(':').map(String::from));
    }
    dirs.dedup();
    dirs.join(":")
}

/// 묶은 서버를 켠다. 출력은 앱 기록 폴더의 server.log에
fn start_bundled(app: &AppHandle) -> Option<Child> {
    let (node, entry) = bundled_paths(&app.path().resource_dir().ok()?)?;
    let log = app.path().app_log_dir().ok().and_then(|d| {
        std::fs::create_dir_all(&d).ok()?;
        std::fs::File::create(d.join("server.log")).ok()
    });
    let (out, err) = match log.and_then(|f| f.try_clone().ok().map(|g| (f, g))) {
        Some((f, g)) => (Stdio::from(f), Stdio::from(g)),
        None => (Stdio::null(), Stdio::null()),
    };
    Command::new(node)
        .arg(entry)
        .env("RW_STATIC", "1")
        .env("RW_PORT", SERVER_PORT.to_string())
        .env("PATH", bundled_path_env())
        .stdin(Stdio::null())
        .stdout(out)
        .stderr(err)
        .spawn()
        .ok()
}

/// 앱을 끝낼 때 묶은 서버도 끈다
fn stop_bundled(app: &AppHandle) {
    if let Some(state) = app.try_state::<BundledServer>() {
        if let Some(mut child) = state.0.lock().ok().and_then(|mut c| c.take()) {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

/// 서버 서비스를 깨운다. 이미 돌고 있으면 아무 일도 하지 않는다(맥만, 다른 OS는 서비스가 아직 없다)
fn wake_server() {
    #[cfg(target_os = "macos")]
    {
        let uid = Command::new("id").arg("-u").output().ok().and_then(|o| String::from_utf8(o.stdout).ok());
        if let Some(uid) = uid {
            let _ = Command::new("launchctl")
                .args(["kickstart", &format!("gui/{}/com.research-workspace.app", uid.trim())])
                .spawn();
        }
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .menu(app_menu)
        .on_menu_event(|app, event| {
            if event.id().as_ref() == "quit" {
                if let Some(w) = app.get_webview_window("main") {
                    remember_page(&w);
                }
                app.exit(0);
                return;
            }
            if let (Some(window), Some(script)) = (app.get_webview_window("main"), menu_script(event.id().as_ref())) {
                let _ = window.eval(script);
            }
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { .. } = event {
                if let Some(w) = window.app_handle().get_webview_window(window.label()) {
                    remember_page(&w);
                }
            }
        })
        .setup(|app| {
            let bundled = if service_installed() {
                wake_server();
                None
            } else if server_answers() {
                None
            } else {
                start_bundled(app.handle())
            };
            let standalone = bundled.is_some();
            app.manage(BundledServer(Mutex::new(bundled)));
            WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .initialization_script(format!("{} window.__rwStandalone = {standalone};", resume_script(app.handle())))
                .title("Emergence Workbench")
                .inner_size(1440.0, 900.0)
                .min_inner_size(900.0, 600.0)
                .on_navigation(|url| {
                    if stays_inside(url) {
                        return true;
                    }
                    open_outside(url);
                    false
                })
                // 새 창으로 여는 링크(target=_blank, window.open): 서버 쪽 파일(PDF 등)은 앱의 새 창, 바깥 주소는 기본 브라우저
                .on_new_window(|url, _features| {
                    if stays_inside(&url) {
                        return NewWindowResponse::Allow;
                    }
                    open_outside(&url);
                    NewWindowResponse::Deny
                })
                .build()?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("Emergence Workbench 창을 열지 못했습니다")
        // 창 닫기 이벤트 없이 끝날 때(Dock의 종료, 로그아웃)도 창이 남아 있으면 기억한다
        .run(|app, event| {
            if let tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit = event {
                if let Some(w) = app.get_webview_window("main") {
                    remember_page(&w);
                }
            }
            if let tauri::RunEvent::Exit = event {
                stop_bundled(app);
            }
        });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bundled_paths_need_node_and_server() {
        let dir = std::env::temp_dir().join(format!("rw-bundled-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        assert!(bundled_paths(&dir).is_none());
        std::fs::create_dir_all(dir.join("standalone/node/bin")).unwrap();
        std::fs::write(dir.join("standalone/node/bin/node"), "").unwrap();
        assert!(bundled_paths(&dir).is_none());
        std::fs::create_dir_all(dir.join("standalone/app/apps/server/dist")).unwrap();
        std::fs::write(dir.join("standalone/app/apps/server/dist/server.mjs"), "").unwrap();
        let (node, entry) = bundled_paths(&dir).unwrap();
        assert!(node.ends_with("standalone/node/bin/node") && entry.ends_with("server.mjs"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn bundled_path_finds_tex_and_user_tools() {
        let p = bundled_path_env();
        assert!(p.contains("/Library/TeX/texbin") && p.contains("/opt/homebrew/bin") && p.contains("/.local/bin"));
    }

    #[test]
    fn server_and_loading_stay_inside() {
        for u in ["http://127.0.0.1:5174/#/r/x", "http://localhost:5174/", "tauri://localhost/index.html", "http://tauri.localhost/index.html", "about:blank"] {
            assert!(stays_inside(&Url::parse(u).unwrap()), "{u}");
        }
    }

    #[test]
    fn resume_only_server_pages() {
        assert_eq!(resume_target(&Url::parse("http://127.0.0.1:5174/#/r/x/flow").unwrap()).as_deref(), Some("http://127.0.0.1:5174/#/r/x/flow"));
        assert_eq!(resume_target(&Url::parse("tauri://localhost/index.html").unwrap()), None);
        assert_eq!(resume_target(&Url::parse("https://arxiv.org/").unwrap()), None);
    }

    #[test]
    fn menu_items_change_only_the_page_address() {
        assert_eq!(menu_script("update").as_deref(), Some("location.href = \"http://127.0.0.1:5174/#/settings/sync\""));
        assert_eq!(menu_script("reload").as_deref(), Some("location.reload()"));
        assert_eq!(menu_script("quit"), None);
    }

    #[test]
    fn other_addresses_go_outside() {
        for u in ["https://arxiv.org/abs/1", "https://github.com/x", "http://127.0.0.1:5173/", "mailto:a@b.c", "file:///etc/passwd"] {
            assert!(!stays_inside(&Url::parse(u).unwrap()), "{u}");
        }
    }
}
