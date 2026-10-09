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

type ExecutionResult struct {
	ExitCode int
	Output   string
	Error    string
	Duration time.Duration
}

func ExecutePowerShell(ctx context.Context, scriptContent string, timeoutSeconds int) (*ExecutionResult, error) {
	if timeoutSeconds <= 0 {
		timeoutSeconds = 300
	}

	execCtx, cancel := context.WithTimeout(ctx, time.Duration(timeoutSeconds)*time.Second)
	defer cancel()

	// Écriture du script dans un fichier temporaire avec BOM UTF-8 (requis par Windows PowerShell 5.1)
	tempDir := os.TempDir()
	scriptFile := filepath.Join(tempDir, fmt.Sprintf("mapt_script_%d.ps1", time.Now().UnixNano()))
	
	var contentBytes []byte
	if !bytes.HasPrefix([]byte(scriptContent), []byte{0xEF, 0xBB, 0xBF}) {
		contentBytes = append([]byte{0xEF, 0xBB, 0xBF}, []byte(scriptContent)...)
	} else {
		contentBytes = []byte(scriptContent)
	}

	if err := os.WriteFile(scriptFile, contentBytes, 0600); err != nil {
		return nil, fmt.Errorf("failed to write temp powershell script: %w", err)
	}
	defer os.Remove(scriptFile)

	// Commande PowerShell standard
	cmd := exec.CommandContext(
		execCtx,
		"powershell.exe",
		"-NoProfile",
		"-NonInteractive",
		"-ExecutionPolicy", "Bypass",
		"-File", scriptFile,
	)

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
			errMsg = fmt.Sprintf("Script execution timed out after %d seconds", timeoutSeconds)
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
