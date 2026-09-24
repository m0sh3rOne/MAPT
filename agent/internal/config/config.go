package config

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"

	"github.com/google/uuid"
)

type Config struct {
	ServerURL         string `json:"server_url"`
	EnrollmentToken   string `json:"enrollment_token"`
	DeviceUUID        string `json:"device_uuid"`
	AgentToken        string `json:"agent_token"`
	PollInterval      int    `json:"poll_interval_seconds"`
	HeartbeatInterval int    `json:"heartbeat_interval_seconds"`
	InventoryInterval int    `json:"inventory_interval_seconds"`
	AgentVersion      string `json:"agent_version"`
	configPath        string
}

func DefaultConfig() *Config {
	return &Config{
		ServerURL:         "http://localhost:8000/api/v1",
		EnrollmentToken:   "mapt-enrollment-secret-token-2026",
		DeviceUUID:        uuid.New().String(),
		AgentToken:        "",
		PollInterval:      30,
		HeartbeatInterval: 30,
		InventoryInterval: 3600,
		AgentVersion:      "1.0.0",
		configPath:        "mapt-agent-config.json",
	}
}

func LoadConfig(path string) (*Config, error) {
	if path == "" {
		path = "mapt-agent-config.json"
	}
	if !filepath.IsAbs(path) {
		if exe, err := os.Executable(); err == nil {
			path = filepath.Join(filepath.Dir(exe), path)
		}
	}
	cfg := DefaultConfig()
	cfg.configPath = path

	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			_ = cfg.Save()
			return cfg, nil
		}
		return nil, err
	}

	data = bytes.TrimPrefix(data, []byte("\xef\xbb\xbf"))
	if err := json.Unmarshal(data, cfg); err != nil {
		return nil, err
	}
	if cfg.DeviceUUID == "" {
		cfg.DeviceUUID = uuid.New().String()
		_ = cfg.Save()
	}
	cfg.configPath = path
	return cfg, nil
}

func (c *Config) Save() error {
	dir := filepath.Dir(c.configPath)
	if dir != "" && dir != "." {
		_ = os.MkdirAll(dir, 0755)
	}
	data, err := json.MarshalIndent(c, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(c.configPath, data, 0600)
}

func (c *Config) IsEnrolled() bool {
	return c.AgentToken != "" && c.DeviceUUID != ""
}
