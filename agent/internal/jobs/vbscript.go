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

// ExecuteVBScript executes a VBScript via cscript.exe in batch console mode
func ExecuteVBScript(ctx context.Context, scriptContent string, timeoutSeconds int) (*ExecutionResult, error) {
	if timeoutSeconds <= 0 {
		timeoutSeconds = 300
	}

	execCtx, cancel := context.WithTimeout(ctx, time.Duration(timeoutSeconds)*time.Second)
	defer cancel()

	// Écriture du script dans un fichier temporaire .vbs
	tempDir := os.TempDir()
	scriptFile := filepath.Join(tempDir, fmt.Sprintf("mapt_script_%d.vbs", time.Now().UnixNano()))
	if err := os.WriteFile(scriptFile, []byte(scriptContent), 0600); err != nil {
		return nil, fmt.Errorf("failed to write temp vbscript: %w", err)
	}
	defer os.Remove(scriptFile)

	// Exécution via cscript.exe standard Windows sans bannière ni pop-up bloquant
	cmd := exec.CommandContext(execCtx, "cscript.exe", "//NoLogo", scriptFile)

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
			errMsg = fmt.Sprintf("VBScript execution timed out after %d seconds", timeoutSeconds)
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
