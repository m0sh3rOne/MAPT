use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppConfig {
    pub pin: String,
    pub locked_apps: Vec<String>,
    pub launcher_locked: bool,
    pub server_port: u16,
    #[serde(default = "default_true")]
    pub allow_full_desktop: bool,
    pub allow_virtual_desktop: bool,
    #[serde(default)]
    pub expose_all_apps: bool,
    #[serde(default)]
    pub exposed_apps: Vec<String>,
    #[serde(default)]
    pub web_auth_enabled: bool,
    #[serde(default = "default_web_username")]
    pub web_username: String,
    #[serde(default)]
    pub web_password: String,
}

fn default_true() -> bool {
    true
}

fn default_web_username() -> String {
    "admin".to_string()
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            pin: "1234".to_string(),
            locked_apps: Vec::new(),
            launcher_locked: false,
            server_port: 8080,
            allow_full_desktop: true,
            allow_virtual_desktop: false,
            expose_all_apps: false,
            exposed_apps: Vec::new(),
            web_auth_enabled: false,
            web_username: default_web_username(),
            web_password: String::new(),
        }
    }
}

impl AppConfig {
    pub fn get_path() -> PathBuf {
        if let Some(mut path) = dirs::config_dir() {
            path.push("appMirror");
            let _ = fs::create_dir_all(&path);
            path.push("config.json");
            path
        } else {
            PathBuf::from("config.json")
        }
    }

    pub fn load() -> Self {
        let path = Self::get_path();
        if path.exists() {
            if let Ok(data) = fs::read_to_string(path) {
                if let Ok(config) = serde_json::from_str::<AppConfig>(&data) {
                    return config;
                }
            }
        }
        
        // Save default if it doesn't exist
        let config = Self::default();
        let _ = config.save();
        config
    }

    pub fn save(&self) -> anyhow::Result<()> {
        let path = Self::get_path();
        let data = serde_json::to_string_pretty(self)?;
        fs::write(path, data)?;
        Ok(())
    }
}
