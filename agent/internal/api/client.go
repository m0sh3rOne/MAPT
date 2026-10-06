package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"mapt-agent/internal/config"
	"mapt-agent/internal/inventory"
	"mapt-agent/internal/jobs"
	"mapt-agent/internal/logging"
)

type Client struct {
	cfg        *config.Config
	httpClient *http.Client
	logger     *logging.Logger
}

func NewClient(cfg *config.Config, logger *logging.Logger) *Client {
	return &Client{
		cfg: cfg,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
		logger: logger,
	}
}

func (c *Client) doRequest(method, path string, body interface{}, result interface{}, requiresAuth bool) error {
	var bodyReader io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return err
		}
		bodyReader = bytes.NewReader(data)
	}

	url := fmt.Sprintf("%s%s", c.cfg.ServerURL, path)
	req, err := http.NewRequest(method, url, bodyReader)
	if err != nil {
		return err
	}

	req.Header.Set("Content-Type", "application/json")
	if requiresAuth && c.cfg.AgentToken != "" {
		req.Header.Set("Authorization", "Bearer "+c.cfg.AgentToken)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("API error (%s): %s", resp.Status, string(respBody))
	}

	if result != nil {
		return json.NewDecoder(resp.Body).Decode(result)
	}

	return nil
}

func (c *Client) Enroll(hostname string, osName string, osVersion string, osBuild string, ipAddress string) error {
	payload := map[string]interface{}{
		"device_uuid":      c.cfg.DeviceUUID,
		"hostname":         hostname,
		"os_name":          osName,
		"os_version":       osVersion,
		"os_build":         osBuild,
		"agent_version":    c.cfg.AgentVersion,
		"ip_address":       ipAddress,
		"enrollment_token": c.cfg.EnrollmentToken,
	}

	var resp struct {
		DeviceID                 string `json:"device_id"`
		DeviceUUID               string `json:"device_uuid"`
		AgentToken               string `json:"agent_token"`
		PollIntervalSeconds      int    `json:"poll_interval_seconds"`
		HeartbeatIntervalSeconds int    `json:"heartbeat_interval_seconds"`
		InventoryIntervalSeconds int    `json:"inventory_interval_seconds"`
	}

	err := c.doRequest("POST", "/agent/enroll", payload, &resp, false)
	if err != nil {
		return err
	}

	c.cfg.AgentToken = resp.AgentToken
	if resp.DeviceUUID != "" {
		c.cfg.DeviceUUID = resp.DeviceUUID
	}
	c.cfg.PollInterval = resp.PollIntervalSeconds
	c.cfg.HeartbeatInterval = resp.HeartbeatIntervalSeconds
	c.cfg.InventoryInterval = resp.InventoryIntervalSeconds
	return c.cfg.Save()
}

func (c *Client) Heartbeat(hostname string, ipAddress string, osName string, osVersion string, osBuild string) error {
	payload := map[string]interface{}{
		"device_uuid":   c.cfg.DeviceUUID,
		"hostname":      hostname,
		"agent_version": c.cfg.AgentVersion,
		"ip_address":    ipAddress,
		"os_name":       osName,
		"os_version":    osVersion,
		"os_build":      osBuild,
		"timestamp":     time.Now().UTC().Format(time.RFC3339),
	}
	return c.doRequest("POST", "/agent/heartbeat", payload, nil, true)
}

func (c *Client) GetJobs() ([]jobs.JobPayload, error) {
	return c.GetJobsWithTrigger("")
}

func (c *Client) GetJobsWithTrigger(trigger string) ([]jobs.JobPayload, error) {
	var jobList []jobs.JobPayload
	path := "/agent/jobs"
	if trigger != "" {
		path = fmt.Sprintf("/agent/jobs?trigger=%s", trigger)
	}
	err := c.doRequest("GET", path, nil, &jobList, true)
	return jobList, err
}

func (c *Client) NotifyLogin() error {
	return c.doRequest("POST", "/agent/events/login", nil, nil, true)
}

func (c *Client) AckJob(jobID string) error {
	payload := map[string]interface{}{
		"acknowledged": true,
	}
	return c.doRequest("POST", fmt.Sprintf("/agent/jobs/%s/ack", jobID), payload, nil, true)
}

func (c *Client) ProgressJob(jobID string, progress int, message string) error {
	payload := map[string]interface{}{
		"status":   "RUNNING",
		"progress": progress,
		"message":  message,
	}
	return c.doRequest("POST", fmt.Sprintf("/agent/jobs/%s/progress", jobID), payload, nil, true)
}

func (c *Client) SendLogs(jobID string, entries []logging.LogEntry) error {
	if len(entries) == 0 {
		return nil
	}
	logsPayload := make([]map[string]interface{}, 0, len(entries))
	for _, e := range entries {
		logsPayload = append(logsPayload, map[string]interface{}{
			"level":     e.Level,
			"message":   e.Message,
			"timestamp": e.Timestamp.Format(time.RFC3339),
		})
	}
	payload := map[string]interface{}{
		"logs": logsPayload,
	}
	return c.doRequest("POST", fmt.Sprintf("/agent/jobs/%s/logs", jobID), payload, nil, true)
}

func (c *Client) CompleteJob(jobID string, exitCode int, durationSeconds float64, output string) error {
	payload := map[string]interface{}{
		"status":           "SUCCEEDED",
		"exit_code":        exitCode,
		"duration_seconds": durationSeconds,
		"output":           output,
	}
	return c.doRequest("POST", fmt.Sprintf("/agent/jobs/%s/complete", jobID), payload, nil, true)
}

func (c *Client) FailJob(jobID string, exitCode int, errorMsg string, output string) error {
	payload := map[string]interface{}{
		"status":    "FAILED",
		"exit_code": exitCode,
		"error":     errorMsg,
		"output":    output,
	}
	return c.doRequest("POST", fmt.Sprintf("/agent/jobs/%s/fail", jobID), payload, nil, true)
}

func (c *Client) SendInventory(inv *inventory.InventoryData) error {
	return c.doRequest("POST", "/agent/inventory", inv, nil, true)
}
