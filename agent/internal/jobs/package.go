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

// expandWindowsEnv expands Windows %ENV_VAR% patterns and ensures safe directories
func expandWindowsEnv(targetPath string) string {
	progData := os.Getenv("ProgramData")
	if progData == "" {
		progData = "C:\\ProgramData"
	}

	// Always redirect APPDATA in service context to ProgramData to avoid systemprofile locks
	if targetPath == "" || strings.Contains(strings.ToUpper(targetPath), "APPDATA") {
		return filepath.Join(progData, "MAPT", "packages")
	}

	re := regexp.MustCompile(`%([^%]+)%`)
	result := re.ReplaceAllStringFunc(targetPath, func(m string) string {
		varName := strings.Trim(m, "%")
		val := os.Getenv(varName)
		if val == "" {
			if strings.EqualFold(varName, "ProgramData") {
				return progData
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
	isInteractive bool,
	timeoutSeconds int,
) (*ExecutionResult, error) {
	if timeoutSeconds <= 0 {
		timeoutSeconds = 600
	}

	// 1. Déterminer le dossier de destination (dans C:\ProgramData\MAPT\packages)
	resolvedDestDir := expandWindowsEnv(destinationFolder)
	_ = os.MkdirAll(resolvedDestDir, 0755)
	destPath := filepath.Join(resolvedDestDir, filename)
	ext := strings.ToLower(filepath.Ext(filename))

	// 2. Téléchargement ou vérification de l'intégrité SHA-256 locale existante
	needDownload := true
	if fi, err := os.Stat(destPath); err == nil && fi.Size() > 0 && expectedSHA256 != "" {
		if valid, _ := download.VerifySHA256(destPath, expectedSHA256); valid {
			needDownload = false
		}
	}

	if needDownload {
		// Si un processus utilisant ce binaire est resté bloqué en arrière-plan, le tuer pour
		// libérer le verrou sur le fichier. Uniquement avant un réel téléchargement : en mode
		// interactif, l'assistant est peut-être en cours d'utilisation par l'utilisateur.
		if ext == ".exe" {
			_ = exec.Command("taskkill", "/F", "/IM", filename).Run()
		}

		if err := downloader.DownloadFile(downloadURL, token, destPath, expectedSHA256); err != nil {
			return &ExecutionResult{
				ExitCode: 1,
				Error:    fmt.Sprintf("Échec du téléchargement/vérification SHA-256 : %v", err),
			}, err
		}
	}

	// 3. Mode Graphique Interactif : le binaire est copié sur le poste puis lancé sur le
	// bureau de l'utilisateur connecté. Le job est validé dès le lancement, l'installation
	// étant ensuite déroulée manuellement par l'utilisateur.
	if isInteractive {
		var interactiveArgs []string
		trimmedArgs := strings.TrimSpace(packageArgs)
		if trimmedArgs != "" {
			interactiveArgs = strings.Fields(trimmedArgs)
		}

		appToRun := destPath
		if strings.TrimSpace(runWith) != "" {
			appToRun = expandWindowsEnv(runWith)
			var combined []string
			if strings.TrimSpace(runWithArgs) != "" {
				combined = append(combined, strings.Fields(strings.TrimSpace(runWithArgs))...)
			}
			combined = append(combined, destPath)
			combined = append(combined, interactiveArgs...)
			interactiveArgs = combined
		} else if ext == ".msi" {
			appToRun = "msiexec.exe"
			interactiveArgs = append([]string{"/i", destPath}, interactiveArgs...)
		}

		return ExecuteInteractiveProcess(
			ctx,
			appToRun,
			interactiveArgs,
			resolvedDestDir,
			runAsAdmin,
		)
	}

	// 4. Préparation du contexte avec Timeout
	execCtx, cancel := context.WithTimeout(ctx, time.Duration(timeoutSeconds)*time.Second)
	defer cancel()

	// 5. Construction de la commande (Exécution directe et propre sous Windows en Session 0)
	var cmd *exec.Cmd

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

		cmd = exec.Command(runWithExpanded, args...)
	} else if strings.TrimSpace(installCommand) != "" {
		// Commande personnalisée exécutée via PowerShell
		resolvedCmd := strings.ReplaceAll(installCommand, filename, destPath)
		resolvedCmd = strings.ReplaceAll(resolvedCmd, "<file>", destPath)
		resolvedCmd = strings.ReplaceAll(resolvedCmd, "{file}", destPath)
		cmd = exec.Command("powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", resolvedCmd)
	} else if ext == ".msi" {
		// MSI standard via msiexec
		args := []string{"/i", destPath}
		if strings.TrimSpace(packageArgs) != "" {
			args = append(args, strings.Fields(strings.TrimSpace(packageArgs))...)
		} else {
			args = append(args, "/qn", "/norestart")
		}
		cmd = exec.Command("msiexec.exe", args...)
	} else if ext == ".vbs" || ext == ".vb" {
		// VBScript standard via cscript
		args := []string{"//nologo", destPath}
		if strings.TrimSpace(packageArgs) != "" {
			args = append(args, strings.Fields(strings.TrimSpace(packageArgs))...)
		}
		cmd = exec.Command("cscript.exe", args...)
	} else if ext == ".ps1" {
		// PowerShell script
		args := []string{"-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", destPath}
		if strings.TrimSpace(packageArgs) != "" {
			args = append(args, strings.Fields(strings.TrimSpace(packageArgs))...)
		}
		cmd = exec.Command("powershell.exe", args...)
	} else if ext == ".bat" || ext == ".cmd" {
		// Script Batch via cmd.exe /c
		args := []string{"/c", destPath}
		if strings.TrimSpace(packageArgs) != "" {
			args = append(args, strings.Fields(strings.TrimSpace(packageArgs))...)
		}
		cmd = exec.Command("cmd.exe", args...)
	} else {
		// Exécutable binaire direct (.exe) : aucun argument forcé par défaut
		var args []string
		trimmedArgs := strings.TrimSpace(packageArgs)
		if trimmedArgs != "" {
			args = strings.Fields(trimmedArgs)
		}
		cmd = exec.Command(destPath, args...)
	}

	// Définir le répertoire de travail dans le dossier du package (évite System32)
	cmd.Dir = resolvedDestDir
	// Contourner les alertes de zone de sécurité Windows SmartScreen sur les binaires téléchargés
	cmd.Env = append(os.Environ(), "SEE_MASK_NOZONECHECKS=1")

	var stdoutBuf, stderrBuf bytes.Buffer
	cmd.Stdout = &stdoutBuf
	cmd.Stderr = &stderrBuf

	start := time.Now()
	if err := cmd.Start(); err != nil {
		return &ExecutionResult{
			ExitCode: 1,
			Error:    fmt.Sprintf("Échec du lancement du processus : %v", err),
			Duration: time.Since(start),
		}, err
	}

	done := make(chan error, 1)
	go func() {
		done <- cmd.Wait()
	}()

	var runErr error
	select {
	case <-execCtx.Done():
		if cmd.Process != nil {
			// Tuer récursivement tout l'arbre de processus sous Windows (/T /F)
			_ = exec.Command("taskkill", "/F", "/T", "/PID", fmt.Sprintf("%d", cmd.Process.Pid)).Run()
		}
		runErr = execCtx.Err()
	case runErr = <-done:
	}
	duration := time.Since(start)

	output := stdoutBuf.String()
	errMsg := strings.TrimSpace(stderrBuf.String())

	exitCode := 0
	if runErr != nil {
		if exitError, ok := runErr.(*exec.ExitError); ok {
			exitCode = exitError.ExitCode()
		} else if execCtx.Err() == context.DeadlineExceeded {
			exitCode = -1
			errMsg = fmt.Sprintf("Délai d'installation dépassé après %d secondes (Timeout)", timeoutSeconds)
		} else {
			exitCode = 1
			if errMsg == "" {
				errMsg = runErr.Error()
			}
		}

		// Traitement du code 3010 (Succès avec redémarrage requis)
		if exitCode == 3010 {
			exitCode = 0
			if output == "" {
				output = "Installation réussie (Code 3010 : Redémarrage système requis)."
			}
			errMsg = ""
		} else if errMsg == "" && exitCode != 0 {
			switch exitCode {
			case 1:
				errMsg = "Code 1 : L'installateur a échoué. Vérifiez les arguments silencieux (/S, /qn, /verysilent)."
			case 2:
				errMsg = "Code 2 : Fichier introuvable ou application actuellement ouverte/verrouillée sur le poste."
			case 1603:
				errMsg = "Code 1603 : Erreur fatale Windows Installer. Une installation précédente est peut-être en attente de redémarrage."
			case 1618:
				errMsg = "Code 1618 : Une autre installation est déjà en cours sur ce poste."
			default:
				errMsg = fmt.Sprintf("Processus d'installation terminé avec le code d'erreur %d.", exitCode)
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
