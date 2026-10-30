// Emergence Workbench 창 (Tauri, 10/30 결정 "데스크톱 앱은 Tauri").
// 창만 맡는다: 서버는 그대로 로그인 때 켜지는 서비스(scripts/service.sh)이고, 창을 닫아도 에이전트 · 동기화는 계속 돈다.
// 창은 먼저 loading/index.html을 띄워 서버가 답할 때까지 기다린 뒤 서버 화면(127.0.0.1:5174)으로 넘어간다.
// 서버 밖 주소(논문 링크, GitHub 등)는 창 안에서 열지 않고 기본 브라우저로 보낸다.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::Command;
use tauri::{WebviewUrl, WebviewWindowBuilder};
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

/// 기본 브라우저(메일 주소면 메일 앱)로 연다
fn open_outside(url: &Url) {
    #[cfg(target_os = "macos")]
    let _ = Command::new("open").arg(url.as_str()).spawn();
    #[cfg(target_os = "windows")]
    let _ = Command::new("cmd").args(["/C", "start", "", url.as_str()]).spawn();
    #[cfg(all(unix, not(target_os = "macos")))]
    let _ = Command::new("xdg-open").arg(url.as_str()).spawn();
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
        .setup(|app| {
            wake_server();
            WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
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
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Emergence Workbench 창을 열지 못했습니다");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn server_and_loading_stay_inside() {
        for u in ["http://127.0.0.1:5174/#/r/x", "http://localhost:5174/", "tauri://localhost/index.html", "http://tauri.localhost/index.html", "about:blank"] {
            assert!(stays_inside(&Url::parse(u).unwrap()), "{u}");
        }
    }

    #[test]
    fn other_addresses_go_outside() {
        for u in ["https://arxiv.org/abs/1", "https://github.com/x", "http://127.0.0.1:5173/", "mailto:a@b.c", "file:///etc/passwd"] {
            assert!(!stays_inside(&Url::parse(u).unwrap()), "{u}");
        }
    }
}
