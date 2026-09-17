package jobs

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"time"
)

func ExecuteCommand(ctx context.Context, commandStr string, timeoutSeconds int) (*ExecutionResult, error) {
	if timeoutSeconds <= 0 {
		timeoutSeconds = 300
	}

	execCtx, cancel := context.WithTimeout(ctx, time.Duration(timeoutSeconds)*time.Second)
	defer cancel()

	cmd := exec.CommandContext(execCtx, "cmd.exe", "/c", commandStr)

	var stdoutBuf, stderrBuf bytes.Buffer
	cmd.Stdout = &stdoutBuf
	cmd.Stderr = &stderrBuf

	start := time.Now()
	runErr := cmd.Run()
	duration := time.Since(start)

	output := stdoutBuf.String()
	errMsg := stderrBuf.String()

	exitCode := 0
	if runErr != nil {
		if exitError, ok := runErr.(*exec.ExitError); ok {
			exitCode = exitError.ExitCode()
		} else if execCtx.Err() == context.DeadlineExceeded {
			exitCode = -1
			errMsg = fmt.Sprintf("Command timed out after %d seconds", timeoutSeconds)
		} else {
			exitCode = 1
			if errMsg == "" {
				errMsg = runErr.Error()
			}
		}
	}

	return &ExecutionResult{
		ExitCode: exitCode,
		Output:   output,
		Error:    errMsg,
		Duration: duration,
	}, nil
}

func ExecutePython(ctx context.Context, scriptContent string, timeoutSeconds int) (*ExecutionResult, error) {
	if timeoutSeconds <= 0 {
		timeoutSeconds = 300
	}

	execCtx, cancel := context.WithTimeout(ctx, time.Duration(timeoutSeconds)*time.Second)
	defer cancel()

	tempDir := os.TempDir()
	scriptFile := filepath.Join(tempDir, fmt.Sprintf("mapt_script_%d.py", time.Now().UnixNano()))
	if err := os.WriteFile(scriptFile, []byte(scriptContent), 0600); err != nil {
		return nil, fmt.Errorf("failed to write temp python script: %w", err)
	}
	defer os.Remove(scriptFile)

	cmd := exec.CommandContext(execCtx, "python", scriptFile)

	var stdoutBuf, stderrBuf bytes.Buffer
	cmd.Stdout = &stdoutBuf
	cmd.Stderr = &stderrBuf

	start := time.Now()
	runErr := cmd.Run()
	duration := time.Since(start)

	output := stdoutBuf.String()
	errMsg := stderrBuf.String()

	exitCode := 0
	if runErr != nil {
		if exitError, ok := runErr.(*exec.ExitError); ok {
			exitCode = exitError.ExitCode()
		} else if execCtx.Err() == context.DeadlineExceeded {
			exitCode = -1
			errMsg = fmt.Sprintf("Python script timed out after %d seconds", timeoutSeconds)
		} else {
			exitCode = 1
			if errMsg == "" {
				errMsg = runErr.Error()
			}
		}
	}

	return &ExecutionResult{
		ExitCode: exitCode,
		Output:   output,
		Error:    errMsg,
		Duration: duration,
	}, nil
}
