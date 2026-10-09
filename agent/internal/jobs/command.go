package jobs

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

func ExecuteCommand(ctx context.Context, commandStr string, timeoutSeconds int) (*ExecutionResult, error) {
	if timeoutSeconds <= 0 {
		timeoutSeconds = 300
	}

	execCtx, cancel := context.WithTimeout(ctx, time.Duration(timeoutSeconds)*time.Second)
	defer cancel()

	var cmd *exec.Cmd
	trimmed := strings.TrimSpace(commandStr)

	// Direct execution for PowerShell to bypass cmd.exe / .bat quote stripping and mangling
	lower := strings.ToLower(trimmed)
	if strings.HasPrefix(lower, "powershell") {
		if strings.Contains(trimmed, "-EncodedCommand") {
			idx := strings.Index(trimmed, "-EncodedCommand")
			encodedPart := strings.TrimSpace(trimmed[idx+len("-EncodedCommand"):])
			cmd = exec.CommandContext(execCtx, "powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encodedPart)
		} else if strings.Contains(trimmed, "-Command") {
			idx := strings.Index(trimmed, "-Command")
			cmdPart := strings.TrimSpace(trimmed[idx+len("-Command"):])
			cmdPart = strings.Trim(cmdPart, "\"")
			cmd = exec.CommandContext(execCtx, "powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", cmdPart)
		}
	} else if strings.HasPrefix(trimmed, "$") || strings.Contains(trimmed, "$ErrorActionPreference") || strings.Contains(trimmed, "Write-Output") || strings.Contains(trimmed, "Get-ChildItem") || strings.Contains(trimmed, "Get-CimInstance") {
		// Detect pure PowerShell script content passed as a generic command
		return ExecutePowerShell(ctx, commandStr, timeoutSeconds)
	}

	// If command is long (> 500 chars) or contains newlines, execute via temporary script to avoid cmd.exe 8191-char limit
	if cmd == nil && (len(trimmed) > 500 || strings.Contains(trimmed, "\n")) {
		tempDir := os.TempDir()
		tempFile := filepath.Join(tempDir, fmt.Sprintf("mapt_cmd_%d.bat", time.Now().UnixNano()))
		batContent := "@echo off\r\n" + trimmed + "\r\n"
		if err := os.WriteFile(tempFile, []byte(batContent), 0600); err == nil {
			defer os.Remove(tempFile)
			cmd = exec.CommandContext(execCtx, "cmd.exe", "/c", tempFile)
		}
	}

	if cmd == nil {
		cmd = exec.CommandContext(execCtx, "cmd.exe", "/c", commandStr)
	}

	var stdoutBuf, stderrBuf bytes.Buffer
	cmd.Stdout = &stdoutBuf
	cmd.Stderr = &stderrBuf

	start := time.Now()
	runErr := cmd.Run()
	duration := time.Since(start)

	output := decodeConsoleOutput(stdoutBuf.Bytes())
	errMsg := decodeConsoleOutput(stderrBuf.Bytes())

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

	output := decodeConsoleOutput(stdoutBuf.Bytes())
	errMsg := decodeConsoleOutput(stderrBuf.Bytes())

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
