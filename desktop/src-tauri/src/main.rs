// Emergence Workbench 창 (Tauri, 10/30 결정 "데스크톱 앱은 Tauri").
// 서버는 둘 중 하나다.
// - 저장소에서 설치한 맥(scripts/install.sh): 로그인 때 켜지는 서비스(scripts/service.sh). 창을 닫아도 에이전트 · 동기화는 계속 돈다.
// - 내려받은 앱(make-desktop.sh --standalone): 앱 안에 묶은 Node와 서버(scripts/bundle-app.mjs)를 창이 켜고, 앱을 끝내면 함께 끈다.
//   켤 때마다 빈 포트와 열쇠를 새로 만들어 서버에 넘기고(RW_PORT · RW_KEY), 서버는 열쇠 없는 요청을 받지 않는다(apps/server/src/appKey.ts).
//   그래서 같은 컴퓨터의 다른 사용자 계정이 켜 둔 앱이나 이 포트를 먼저 잡은 프로그램을 내 창이 열지 않는다(11/8 점검).
// 창은 먼저 loading/index.html을 띄워 서버가 답할 때까지 기다린 뒤 서버 화면으로 넘어간다(묶은 서버면 /__open으로 열쇠를 건네고).
// 서버 밖 주소(논문 링크, GitHub 등)는 창 안에서도, 새 창으로도 열지 않고 기본 브라우저로 보낸다.
// 창 크기 · 자리는 window-state가, 마지막에 보던 화면은 last-url 파일이 기억한다. 메뉴는 맥 표준 메뉴에 설정 · 업데이트 · 새로 고침을 더한 것.
// 윈도우: 서비스가 없어 늘 묶은 서버를 쓴다(node/node.exe, 콘솔 창 없이). 메뉴는 파일 · 보기 둘(편집 단축키는 창이 스스로 처리한다).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::net::{SocketAddr, TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;
#[cfg(target_os = "macos")]
use tauri::menu::AboutMetadata;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::webview::NewWindowResponse;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent, Wry};
use url::Url;

/// 맥 서비스의 서버 주소. scripts/open-app.sh · service.sh와 같다. 설치 파일로 깐 앱은 켤 때마다 빈 포트를 고른다
const SERVICE_PORT: u16 = 5174;
/// 창이 열쇠를 건네는 서버 경로 (appKey.ts OPEN_PATH)
const OPEN_PATH: &str = "/__open";

/// 이번에 창이 쓰는 서버: 포트와, 묶은 서버면 그 열쇠
struct Server {
    port: u16,
    key: Option<String>,
}
static SERVER: OnceLock<Server> = OnceLock::new();

fn server_port() -> u16 {
    SERVER.get().map(|s| s.port).unwrap_or(SERVICE_PORT)
}

fn server_url(port: u16) -> String {
    format!("http://127.0.0.1:{port}/")
}

/// 이 컴퓨터의 빈 포트 하나
fn free_port() -> Option<u16> {
    TcpListener::bind(("127.0.0.1", 0)).ok()?.local_addr().ok().map(|a| a.port())
}

/// 한 번 쓰는 열쇠: OS 난수 24바이트를 16진수로
fn new_key() -> Option<String> {
    let mut b = [0u8; 24];
    getrandom::fill(&mut b).ok()?;
    Some(b.iter().map(|x| format!("{x:02x}")).collect())
}

/// 창 안에서 열어도 되는 주소: 로딩 쪽(앱 안 파일)과 이번에 쓰는 서버
fn stays_inside(url: &Url, port: u16) -> bool {
    match url.scheme() {
        "tauri" | "asset" | "about" | "data" | "blob" => true,
        "http" | "https" => {
            let local = matches!(url.host_str(), Some("127.0.0.1" | "localhost" | "tauri.localhost"));
            local && (url.port_or_known_default() == Some(port) || url.host_str() == Some("tauri.localhost"))
        }
        _ => false,
    }
}

/// 서버 안의 경로 (#까지). 포트는 켤 때마다 바뀌므로 기억하지 않는다
fn page_of(url: &Url) -> String {
    let mut s = url.path().to_string();
    if let Some(q) = url.query() {
        s.push('?');
        s.push_str(q);
    }
    if let Some(f) = url.fragment() {
        s.push('#');
        s.push_str(f);
    }
    s
}

/// 다음에 열 때 이어 볼 화면: 이번 서버의 화면이면 그 경로, 아니면 없음
fn resume_target(url: &Url, port: u16) -> Option<String> {
    let server = matches!(url.scheme(), "http" | "https")
        && matches!(url.host_str(), Some("127.0.0.1" | "localhost"))
        && url.port_or_known_default() == Some(port);
    (server && url.path() != OPEN_PATH).then(|| page_of(url))
}

/// 적어 둔 화면을 읽는다: 경로(/…), 또는 예전 판이 적은 전체 주소(http://127.0.0.1:5174/#/…)의 경로
fn stored_resume(text: &str) -> Option<String> {
    let t = text.trim();
    if t.starts_with('/') && !t.starts_with("//") {
        return Some(t.to_string());
    }
    let u = Url::parse(t).ok()?;
    let local = matches!(u.scheme(), "http" | "https") && matches!(u.host_str(), Some("127.0.0.1" | "localhost"));
    (local && u.path() != OPEN_PATH).then(|| page_of(&u))
}

fn last_url_file(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|d| d.join("last-url"))
}

/// 여는 중 쪽이 읽는 값: 서버 주소, 열쇠(묶은 서버만), 지난번에 보던 서버 화면의 경로. 없으면 null
fn resume_script(app: &AppHandle, port: u16, key: Option<&str>) -> String {
    let last = last_url_file(app)
        .and_then(|f| std::fs::read_to_string(f).ok())
        .and_then(|s| stored_resume(&s));
    let js = |v: Option<&str>| v.map(|u| format!("{u:?}")).unwrap_or_else(|| "null".into());
    format!(
        "window.__rwServer = {:?}; window.__rwKey = {}; window.__rwResume = {};",
        server_url(port),
        js(key),
        js(last.as_deref())
    )
}

fn remember_page(window: &WebviewWindow) {
    let (Ok(url), Some(file)) = (window.url(), last_url_file(window.app_handle())) else { return };
    if let Some(target) = resume_target(&url, server_port()) {
        if let Some(dir) = file.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        let _ = std::fs::write(file, target);
    }
}

/// 윈도우 메뉴: 파일(설정 · 업데이트 · 종료)과 보기(새로 고침 · 처음 화면). 맥의 서비스 · 가리기 · 실행 취소 같은 항목은 윈도우에서 돌지 않아 넣지 않는다
#[cfg(not(target_os = "macos"))]
fn app_menu(app: &AppHandle) -> tauri::Result<Menu<Wry>> {
    let file = Submenu::with_items(app, "파일", true, &[
        &MenuItem::with_id(app, "settings", "설정…", true, Some("CmdOrCtrl+,"))?,
        &MenuItem::with_id(app, "update", "업데이트 확인…", true, None::<&str>)?,
        &PredefinedMenuItem::separator(app)?,
        &MenuItem::with_id(app, "quit", "끝내기", true, Some("CmdOrCtrl+Q"))?,
    ])?;
    let view = Submenu::with_items(app, "보기", true, &[
        &MenuItem::with_id(app, "reload", "새로 고침", true, Some("CmdOrCtrl+R"))?,
        &MenuItem::with_id(app, "home", "처음 화면", true, Some("CmdOrCtrl+Shift+H"))?,
    ])?;
    Menu::with_items(app, &[&file, &view])
}

/// 맥 표준 메뉴(앱 · 편집 · 보기 · 창, 이름은 맥 한국어 메뉴와 같게)에 앱의 설정 · 업데이트 · 새로 고침 · 처음 화면을 더한다
#[cfg(target_os = "macos")]
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
fn menu_script(id: &str, port: u16) -> Option<String> {
    let server = server_url(port);
    Some(match id {
        "settings" => format!("location.href = {:?}", format!("{server}#/settings")),
        "update" => format!("location.href = {:?}", format!("{server}#/settings/sync")),
        "home" => format!("location.href = {server:?}"),
        "reload" => "location.reload()".into(),
        _ => return None,
    })
}

/// 바깥으로 보낼 수 있는 주소: 웹 주소와 메일 주소만. file: 같은 것은 이 컴퓨터의 실행 파일을 열 수 있어 보내지 않는다
fn may_open_outside(url: &Url) -> bool {
    matches!(url.scheme(), "http" | "https" | "mailto")
}

/// 기본 브라우저(메일 주소면 메일 앱)로 연다
fn open_outside(url: &Url) {
    if !may_open_outside(url) {
        return;
    }
    #[cfg(target_os = "macos")]
    let _ = Command::new("open").arg(url.as_str()).spawn();
    // 윈도우: cmd /C start는 주소 속 &를 명령 구분자로 읽어 그 뒤를 명령으로 돌린다(11/8 점검). rundll32는 주소를 그대로 ShellExecute에 넘긴다
    #[cfg(target_os = "windows")]
    let _ = Command::new("rundll32").args(["url.dll,FileProtocolHandler", url.as_str()]).spawn();
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

/// 맥 서비스가 답하는지 (서비스가 없는 개발용 창이 저장소에서 켠 서버를 쓸 때)
fn server_answers() -> bool {
    let addr = SocketAddr::from(([127, 0, 0, 1], SERVICE_PORT));
    TcpStream::connect_timeout(&addr, Duration::from_millis(300)).is_ok()
}

/// 묶은 Node의 자리 (scripts/bundle-app.mjs와 같게)
#[cfg(target_os = "windows")]
const BUNDLED_NODE: &str = "node/node.exe";
#[cfg(not(target_os = "windows"))]
const BUNDLED_NODE: &str = "node/bin/node";

/// 앱 안에 묶은 Node와 서버 (resources/standalone, scripts/bundle-app.mjs). 없으면 None
fn bundled_paths(resources: &Path) -> Option<(PathBuf, PathBuf)> {
    let root = resources.join("standalone");
    let node = root.join(BUNDLED_NODE);
    let entry = root.join("app/apps/server/dist/server.mjs");
    (node.is_file() && entry.is_file()).then_some((node, entry))
}

/// 묶은 서버가 쓸 PATH: 서비스(serve.sh)처럼 TeX · Homebrew · 사용자 도구(claude 등)를 찾게 한다
#[cfg(not(target_os = "windows"))]
fn bundled_path_env(_standalone: &Path) -> String {
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

/// 윈도우: 지금 PATH 앞에 Git for Windows와 사용자 도구(claude 등) 자리를 더한다(창에서 켠 앱은 설치 직후 새 PATH를 못 받을 수 있다).
/// 맨 뒤에는 앱에 묶은 git(MinGit)을 둔다: 깐 git이 있으면 그것을, 없으면 묶은 것을 쓴다
#[cfg(target_os = "windows")]
fn bundled_path_env(standalone: &Path) -> String {
    let home = std::env::var("USERPROFILE").unwrap_or_default();
    let programs = std::env::var("ProgramFiles").unwrap_or_else(|_| r"C:\Program Files".into());
    let local = std::env::var("LOCALAPPDATA").unwrap_or_default();
    let mut dirs = vec![
        format!(r"{home}\.local\bin"),
        format!(r"{programs}\Git\cmd"),
        format!(r"{local}\Programs\Git\cmd"),
        format!(r"{local}\Programs\MiKTeX\miktex\bin\x64"),
    ];
    if let Ok(p) = std::env::var("PATH") {
        dirs.extend(p.split(';').filter(|d| !d.is_empty()).map(String::from));
    }
    dirs.push(standalone.join(r"git\cmd").to_string_lossy().into_owned());
    dirs.dedup();
    dirs.join(";")
}

/// 윈도우의 긴 경로 머리(\\?\)를 뗀다: PATH 항목과 Node가 읽는 스크립트 경로는 보통 경로여야 한다
fn plain_path(p: PathBuf) -> PathBuf {
    match p.to_str().and_then(|s| s.strip_prefix(r"\\?\")) {
        Some(rest) if !rest.starts_with("UNC") => PathBuf::from(rest),
        _ => p,
    }
}

/// 묶은 서버를 켠다(이 포트, 이 열쇠). 출력은 앱 기록 폴더의 server.log에
fn start_bundled(app: &AppHandle, port: u16, key: &str) -> Option<Child> {
    let resources = plain_path(app.path().resource_dir().ok()?);
    let (node, entry) = bundled_paths(&resources)?;
    let log = app.path().app_log_dir().ok().and_then(|d| {
        std::fs::create_dir_all(&d).ok()?;
        std::fs::File::create(d.join("server.log")).ok()
    });
    let (out, err) = match log.and_then(|f| f.try_clone().ok().map(|g| (f, g))) {
        Some((f, g)) => (Stdio::from(f), Stdio::from(g)),
        None => (Stdio::null(), Stdio::null()),
    };
    let mut cmd = Command::new(node);
    // 윈도우: 묶은 Node가 검은 콘솔 창을 띄우지 않게 한다(CREATE_NO_WINDOW). 서버가 부르는 git도 이 숨은 콘솔을 물려받는다
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }
    cmd.arg(entry)
        .env("RW_STATIC", "1")
        .env("RW_PORT", port.to_string())
        .env("RW_KEY", key)
        .env("PATH", bundled_path_env(&resources.join("standalone")))
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
            if let (Some(window), Some(script)) = (app.get_webview_window("main"), menu_script(event.id().as_ref(), server_port())) {
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
            // 맥 서비스가 있으면 그것(5174, 열쇠 없음). 아니면 앱에 묶은 서버를 새 포트 · 새 열쇠로 켠다.
            // 예전에는 5174에 무엇이든 답하면 그것을 썼다: 공용 PC에서 다른 사용자 계정이 켜 둔 앱이 내 창에 열렸다(11/8 점검)
            let fresh = if service_installed() {
                wake_server();
                None
            } else {
                free_port().zip(new_key()).and_then(|(port, key)| start_bundled(app.handle(), port, &key).map(|child| (port, key, child)))
            };
            let (server, bundled) = match fresh {
                Some((port, key, child)) => (Server { port, key: Some(key) }, Some(child)),
                // 묶은 서버가 없는 개발용 창: 저장소에서 켠 서버(5174)를 쓴다
                None => {
                    if !service_installed() && !server_answers() {
                        eprintln!("서버가 없습니다: 묶은 서버도, 5174에서 답하는 서버도 없습니다");
                    }
                    (Server { port: SERVICE_PORT, key: None }, None)
                }
            };
            let standalone = bundled.is_some();
            let script = resume_script(app.handle(), server.port, server.key.as_deref());
            let _ = SERVER.set(server);
            app.manage(BundledServer(Mutex::new(bundled)));
            WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .initialization_script(format!("{script} window.__rwStandalone = {standalone};"))
                .title("Emergence Workbench")
                .inner_size(1440.0, 900.0)
                .min_inner_size(900.0, 600.0)
                .on_navigation(|url| {
                    if stays_inside(url, server_port()) {
                        return true;
                    }
                    open_outside(url);
                    false
                })
                // 새 창으로 여는 링크(target=_blank, window.open): 서버 쪽 파일(PDF 등)은 앱의 새 창, 바깥 주소는 기본 브라우저
                .on_new_window(|url, _features| {
                    if stays_inside(&url, server_port()) {
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
        let node = dir.join("standalone").join(BUNDLED_NODE);
        std::fs::create_dir_all(node.parent().unwrap()).unwrap();
        std::fs::write(&node, "").unwrap();
        assert!(bundled_paths(&dir).is_none());
        std::fs::create_dir_all(dir.join("standalone/app/apps/server/dist")).unwrap();
        std::fs::write(dir.join("standalone/app/apps/server/dist/server.mjs"), "").unwrap();
        let (node, entry) = bundled_paths(&dir).unwrap();
        assert!(node.ends_with(Path::new("standalone").join(BUNDLED_NODE)) && entry.ends_with("server.mjs"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    #[cfg(not(target_os = "windows"))]
    fn bundled_path_finds_tex_and_user_tools() {
        let p = bundled_path_env(Path::new("/x/standalone"));
        assert!(p.contains("/Library/TeX/texbin") && p.contains("/opt/homebrew/bin") && p.contains("/.local/bin"));
    }

    #[test]
    #[cfg(target_os = "windows")]
    fn bundled_path_finds_git_and_user_tools() {
        let p = bundled_path_env(Path::new(r"C:\x\standalone"));
        assert!(p.contains(r"\Git\cmd") && p.contains(r"\.local\bin") && p.ends_with(r"C:\x\standalone\git\cmd"));
    }

    #[test]
    fn plain_path_drops_long_path_prefix() {
        assert_eq!(plain_path(PathBuf::from(r"\\?\C:\a\b")), PathBuf::from(r"C:\a\b"));
        assert_eq!(plain_path(PathBuf::from(r"\\?\UNC\srv\x")), PathBuf::from(r"\\?\UNC\srv\x"));
        assert_eq!(plain_path(PathBuf::from("/Applications/x")), PathBuf::from("/Applications/x"));
    }

    #[test]
    fn server_and_loading_stay_inside() {
        for u in ["http://127.0.0.1:51234/#/r/x", "http://localhost:51234/", "tauri://localhost/index.html", "http://tauri.localhost/index.html", "about:blank"] {
            assert!(stays_inside(&Url::parse(u).unwrap(), 51234), "{u}");
        }
        // 다른 포트의 서버(다른 사용자의 앱, 예전 5174)는 창 안에서 열지 않는다
        assert!(!stays_inside(&Url::parse("http://127.0.0.1:5174/").unwrap(), 51234));
    }

    #[test]
    fn resume_only_server_pages() {
        let at = |u: &str| resume_target(&Url::parse(u).unwrap(), 51234);
        assert_eq!(at("http://127.0.0.1:51234/#/r/x/flow").as_deref(), Some("/#/r/x/flow"));
        assert_eq!(at("http://127.0.0.1:51234/__open?k=secret&to=%2F").as_deref(), None);
        assert_eq!(at("http://127.0.0.1:5174/#/r/x").as_deref(), None);
        assert_eq!(at("tauri://localhost/index.html"), None);
        assert_eq!(at("https://arxiv.org/").as_deref(), None);
    }

    #[test]
    fn stored_resume_reads_paths_and_old_addresses() {
        assert_eq!(stored_resume("/#/r/x\n").as_deref(), Some("/#/r/x"));
        assert_eq!(stored_resume("http://127.0.0.1:5174/#/r/x/flow").as_deref(), Some("/#/r/x/flow"));
        assert_eq!(stored_resume("//evil.example/").as_deref(), None);
        assert_eq!(stored_resume("https://evil.example/#/r/x").as_deref(), None);
        assert_eq!(stored_resume("http://127.0.0.1:5174/__open?k=x").as_deref(), None);
    }

    #[test]
    fn keys_and_ports_are_fresh() {
        let (a, b) = (new_key().unwrap(), new_key().unwrap());
        assert!(a.len() == 48 && a.chars().all(|c| c.is_ascii_hexdigit()) && a != b);
        assert!(free_port().is_some_and(|p| p != 0));
    }

    #[test]
    fn menu_items_change_only_the_page_address() {
        assert_eq!(menu_script("update", 51234).as_deref(), Some("location.href = \"http://127.0.0.1:51234/#/settings/sync\""));
        assert_eq!(menu_script("reload", 51234).as_deref(), Some("location.reload()"));
        assert_eq!(menu_script("quit", 51234), None);
    }

    #[test]
    fn other_addresses_go_outside() {
        for u in ["https://arxiv.org/abs/1", "https://github.com/x", "http://127.0.0.1:5173/", "mailto:a@b.c", "file:///etc/passwd"] {
            assert!(!stays_inside(&Url::parse(u).unwrap(), 51234), "{u}");
        }
    }

    #[test]
    fn only_web_and_mail_addresses_open_outside() {
        for u in ["https://arxiv.org/abs/1?a=1&calc", "http://x.example/", "mailto:a@b.c"] {
            assert!(may_open_outside(&Url::parse(u).unwrap()), "{u}");
        }
        for u in ["file:///C:/Windows/System32/calc.exe", "ms-settings:", "javascript:alert(1)", "smb://host/share"] {
            assert!(!may_open_outside(&Url::parse(u).unwrap()), "{u}");
        }
    }
}
