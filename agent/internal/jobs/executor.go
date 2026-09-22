package jobs

import (
	"context"
	"fmt"

	"mapt-agent/internal/download"
	"mapt-agent/internal/logging"
)

type JobPayload struct {
	JobID          string                 `json:"job_id"`
	Type           string                 `json:"type"`
	TimeoutSeconds int                    `json:"timeout_seconds"`
	Payload        map[string]interface{} `json:"payload"`
}

type Executor struct {
	downloader *download.Downloader
	logger     *logging.Logger
}

func NewExecutor(logger *logging.Logger) *Executor {
	return &Executor{
		downloader: download.NewDownloader(),
		logger:     logger,
	}
}

func (e *Executor) Execute(ctx context.Context, job *JobPayload, serverURL string, token string) (*ExecutionResult, error) {
	e.logger.Info("Executing job %s (Type: %s, Timeout: %ds)", job.JobID, job.Type, job.TimeoutSeconds)

	switch job.Type {
	case "powershell", "script", "ps1":
		content, _ := job.Payload["content"].(string)
		return ExecutePowerShell(ctx, content, job.TimeoutSeconds)

	case "vbscript", "vbs":
		content, _ := job.Payload["content"].(string)
		return ExecuteVBScript(ctx, content, job.TimeoutSeconds)

	case "package":
		filename, _ := job.Payload["filename"].(string)
		storageKey, _ := job.Payload["storage_key"].(string)
		sha256Hash, _ := job.Payload["sha256"].(string)
		runWith, _ := job.Payload["run_with"].(string)
		runWithArgs, _ := job.Payload["run_with_args"].(string)
		packageArgs, _ := job.Payload["package_args"].(string)
		runAsAdmin, _ := job.Payload["run_as_admin"].(bool)
		destFolder, _ := job.Payload["destination_folder"].(string)
		installCmd, _ := job.Payload["install_command"].(string)
		isInteractive, _ := job.Payload["is_interactive"].(bool)
		downloadURL := fmt.Sprintf("%s/agent/packages/download/%s", serverURL, storageKey)

		return ExecutePackage(
			ctx,
			e.downloader,
			downloadURL,
			token,
			filename,
			sha256Hash,
			runWith,
			runWithArgs,
			packageArgs,
			runAsAdmin,
			destFolder,
			installCmd,
			isInteractive,
			job.TimeoutSeconds,
		)

	case "python", "py":
		content, _ := job.Payload["content"].(string)
		return ExecutePython(ctx, content, job.TimeoutSeconds)

	case "cmd", "batch", "bat":
		content, _ := job.Payload["content"].(string)
		return ExecuteCommand(ctx, content, job.TimeoutSeconds)

	case "command":
		cmdStr, _ := job.Payload["command"].(string)
		return ExecuteCommand(ctx, cmdStr, job.TimeoutSeconds)

	default:
		return nil, fmt.Errorf("unsupported job type: %s", job.Type)
	}
}
