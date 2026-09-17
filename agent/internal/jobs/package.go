package jobs

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"mapt-agent/internal/download"
)

// expandWindowsEnv expands Windows %ENV_VAR% patterns
func expandWindowsEnv(targetPath string) string {
	if targetPath == "" {
		return filepath.Join(os.TempDir(), "mapt_packages")
	}

	re := regexp.MustCompile(`%([^%]+)%`)
	result := re.ReplaceAllStringFunc(targetPath, func(m string) string {
		varName := strings.Trim(m, "%")
		val := os.Getenv(varName)
		if val == "" {
			if strings.EqualFold(varName, "APPDATA") {
				// Fallback if running under SYSTEM context without APPDATA
				progData := os.Getenv("ProgramData")
				if progData != "" {
					return filepath.Join(progData, "MAPT")
				}
				return filepath.Join(os.TempDir(), "MAPT")
			}
			return m
		}
		return val
	})
	return result
}

func ExecutePackage(
	ctx context.Context,
	downloader *download.Downloader,
	downloadURL string,
	token string,
	filename string,
	expectedSHA256 string,
	runWith string,
	runWithArgs string,
	packageArgs string,
	runAsAdmin bool,
	destinationFolder string,
	installCommand string,
	timeoutSeconds int,
) (*ExecutionResult, error) {
	if timeoutSeconds <= 0 {
		timeoutSeconds = 600
	}

	// 1. Déterminer le dossier de destination (avec expansion de %APPDATA%, %TEMP%, etc.)
	resolvedDestDir := expandWindowsEnv(destinationFolder)
	_ = os.MkdirAll(resolvedDestDir, 0755)
	destPath := filepath.Join(resolvedDestDir, filename)

	// 2. Téléchargement et vérification de l'intégrité SHA-256
	if err := downloader.DownloadFile(downloadURL, token, destPath, expectedSHA256); err != nil {
		return &ExecutionResult{
			ExitCode: 1,
			Error:    fmt.Sprintf("Download/verification failed: %v", err),
		}, err
	}

	// 3. Préparation du contexte avec Timeout
	execCtx, cancel := context.WithTimeout(ctx, time.Duration(timeoutSeconds)*time.Second)
	defer cancel()

	// 4. Construction de la commande (Exécution directe et propre sous Windows)
	var cmd *exec.Cmd

	ext := strings.ToLower(filepath.Ext(filename))

	if strings.TrimSpace(runWith) != "" {
		// Cas Snapin FOG : Run With (ex: msiexec.exe, cscript.exe, powershell.exe)
		runWithExpanded := expandWindowsEnv(runWith)
		var args []string

		if strings.TrimSpace(runWithArgs) != "" {
			args = append(args, strings.Fields(strings.TrimSpace(runWithArgs))...)
		}
		args = append(args, destPath)
		if strings.TrimSpace(packageArgs) != "" {
			args = append(args, strings.Fields(strings.TrimSpace(packageArgs))...)
		}

		cmd = exec.CommandContext(execCtx, runWithExpanded, args...)
	} else if strings.TrimSpace(installCommand) != "" {
		// Commande personnalisée exécutée via PowerShell
		resolvedCmd := strings.ReplaceAll(installCommand, filename, destPath)
		resolvedCmd = strings.ReplaceAll(resolvedCmd, "<file>", destPath)
		resolvedCmd = strings.ReplaceAll(resolvedCmd, "{file}", destPath)
		cmd = exec.CommandContext(execCtx, "powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", resolvedCmd)
	} else if ext == ".msi" {
		// MSI standard via msiexec
		args := []string{"/i", destPath}
		if strings.TrimSpace(packageArgs) != "" {
			args = append(args, strings.Fields(strings.TrimSpace(packageArgs))...)
		} else {
			args = append(args, "/qn", "/norestart")
		}
		cmd = exec.CommandContext(execCtx, "msiexec.exe", args...)
	} else if ext == ".vbs" || ext == ".vb" {
		// VBScript standard via cscript
		args := []string{"//nologo", destPath}
		if strings.TrimSpace(packageArgs) != "" {
			args = append(args, strings.Fields(strings.TrimSpace(packageArgs))...)
		}
		cmd = exec.CommandContext(execCtx, "cscript.exe", args...)
	} else if ext == ".ps1" {
		// PowerShell script
		args := []string{"-NoProfile", "-ExecutionPolicy", "Bypass", "-File", destPath}
		if strings.TrimSpace(packageArgs) != "" {
			args = append(args, strings.Fields(strings.TrimSpace(packageArgs))...)
		}
		cmd = exec.CommandContext(execCtx, "powershell.exe", args...)
	} else if ext == ".bat" || ext == ".cmd" {
		// Script Batch via cmd.exe /c
		args := []string{"/c", destPath}
		if strings.TrimSpace(packageArgs) != "" {
			args = append(args, strings.Fields(strings.TrimSpace(packageArgs))...)
		}
		cmd = exec.CommandContext(execCtx, "cmd.exe", args...)
	} else {
		// Exécutable binaire direct (.exe)
		var args []string
		if strings.TrimSpace(packageArgs) != "" {
			args = strings.Fields(strings.TrimSpace(packageArgs))
		}
		cmd = exec.CommandContext(execCtx, destPath, args...)
	}

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
			errMsg = fmt.Sprintf("Package installation timed out after %d seconds", timeoutSeconds)
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
