//go:build windows

package jobs

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
)

var (
	modwtsapi32                      = windows.NewLazySystemDLL("wtsapi32.dll")
	procWTSGetActiveConsoleSessionId = modwtsapi32.NewProc("WTSGetActiveConsoleSessionId")
	procWTSQueryUserToken            = modwtsapi32.NewProc("WTSQueryUserToken")

	modadvapi32              = windows.NewLazySystemDLL("advapi32.dll")
	procCreateProcessAsUserW = modadvapi32.NewProc("CreateProcessAsUserW")
	procDuplicateTokenEx     = modadvapi32.NewProc("DuplicateTokenEx")

	moduserenv                  = windows.NewLazySystemDLL("userenv.dll")
	procCreateEnvironmentBlock  = moduserenv.NewProc("CreateEnvironmentBlock")
	procDestroyEnvironmentBlock = moduserenv.NewProc("DestroyEnvironmentBlock")
)

// getActiveSessionID retourne l'identifiant de session console active (généralement 1 sur Windows)
func getActiveSessionID() (uint32, error) {
	r1, _, _ := procWTSGetActiveConsoleSessionId.Call()
	consoleSessionID := uint32(r1)
	if consoleSessionID != 0xFFFFFFFF && consoleSessionID != 0 {
		return consoleSessionID, nil
	}
	return 1, nil
}

// getCurrentSessionID retourne l'identifiant de session du processus agent
func getCurrentSessionID() (uint32, error) {
	var sessionID uint32
	if err := windows.ProcessIdToSessionId(windows.GetCurrentProcessId(), &sessionID); err != nil {
		return 0, err
	}
	return sessionID, nil
}

// launchInCurrentSession lance directement lorsque l'agent est déjà dans la session interactive
func launchInCurrentSession(appPath string, args []string, workingDir string) (uint32, error) {
	cmd := exec.Command(appPath, args...)
	cmd.Dir = workingDir
	cmd.Env = append(os.Environ(), "SEE_MASK_NOZONECHECKS=1")

	if err := cmd.Start(); err != nil {
		return 0, err
	}
	pid := uint32(cmd.Process.Pid)
	go func() { _ = cmd.Wait() }()
	return pid, nil
}

func launchSummary(appPath string, args []string, sessionID uint32, pid uint32) string {
	cmdLine := appPath
	if len(args) > 0 {
		cmdLine = fmt.Sprintf("%s %s", appPath, strings.Join(args, " "))
	}
	return fmt.Sprintf(
		"Assistant d'installation lancé avec succès sur le bureau utilisateur (Session %d, PID %d) : %s. "+
			"L'installation doit être poursuivie manuellement par l'utilisateur sur son écran.",
		sessionID, pid, cmdLine,
	)
}

// ExecuteInteractiveProcess lance un programme sur le bureau de l'utilisateur connecté de manière non-bloquante et infaillible.
func ExecuteInteractiveProcess(
	ctx context.Context,
	appPath string,
	args []string,
	workingDir string,
	runAsAdmin bool,
) (result *ExecutionResult, err error) {
	start := time.Now()

	// Protection absolue contre tout crash ou panique
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("panique interceptée lors du lancement interactif: %v", r)
			result = &ExecutionResult{
				ExitCode: 1,
				Error:    err.Error(),
				Duration: time.Since(start),
			}
		}
	}()

	sessionID, _ := getActiveSessionID()

	// Cas 1 : Si l'agent tourne déjà dans la session de l'utilisateur (mode console)
	if curSess, errSess := getCurrentSessionID(); errSess == nil && curSess == sessionID && curSess != 0 {
		pid, errLaunch := launchInCurrentSession(appPath, args, workingDir)
		if errLaunch != nil {
			return &ExecutionResult{
				ExitCode: 1,
				Error:    fmt.Sprintf("Échec du lancement direct en session %d : %v", sessionID, errLaunch),
				Duration: time.Since(start),
			}, errLaunch
		}
		return &ExecutionResult{
			ExitCode: 0,
			Output:   launchSummary(appPath, args, sessionID, pid),
			Duration: time.Since(start),
		}, nil
	}

	// Cas 2 : L'agent tourne en tant que Service Windows (Session 0)
	var userTokenHandle windows.Handle
	rWTS, _, errWTS := procWTSQueryUserToken.Call(uintptr(sessionID), uintptr(unsafe.Pointer(&userTokenHandle)))
	if rWTS == 0 || userTokenHandle == 0 {
		return &ExecutionResult{
			ExitCode: 1,
			Error:    fmt.Sprintf("Aucune session utilisateur active connectée sur le poste (WTSQueryUserToken session %d : %v)", sessionID, errWTS),
			Duration: time.Since(start),
		}, fmt.Errorf("WTSQueryUserToken failed: %v", errWTS)
	}
	defer windows.CloseHandle(userTokenHandle)

	// Dupliquer le token utilisateur en TokenPrimary
	var primaryToken windows.Token
	rDup, _, _ := procDuplicateTokenEx.Call(
		uintptr(userTokenHandle),
		uintptr(windows.TOKEN_ALL_ACCESS),
		0,
		uintptr(windows.SecurityIdentification),
		uintptr(windows.TokenPrimary),
		uintptr(unsafe.Pointer(&primaryToken)),
	)
	if rDup == 0 || primaryToken == 0 {
		primaryToken = windows.Token(userTokenHandle)
	} else {
		defer primaryToken.Close()
	}

	// Préparer l'environnement utilisateur
	var envBlock uintptr
	rEnv, _, _ := procCreateEnvironmentBlock.Call(uintptr(unsafe.Pointer(&envBlock)), uintptr(primaryToken), 0)
	if rEnv != 0 && envBlock != 0 {
		defer procDestroyEnvironmentBlock.Call(envBlock)
	}

	// Préparer StartupInfo avec le bureau interactif winsta0\default et SW_SHOW
	var si windows.StartupInfo
	si.Cb = uint32(unsafe.Sizeof(si))
	desktopName, _ := windows.UTF16PtrFromString(`winsta0\default`)
	si.Desktop = desktopName
	si.Flags = windows.STARTF_USESHOWWINDOW
	si.ShowWindow = windows.SW_SHOW

	// Construire la ligne de commande complète
	var cmdLine string
	if len(args) > 0 {
		cmdLine = fmt.Sprintf(`"%s" %s`, appPath, strings.Join(args, " "))
	} else {
		cmdLine = fmt.Sprintf(`"%s"`, appPath)
	}

	cmdLineUTF16, errUTF16 := windows.UTF16FromString(cmdLine)
	if errUTF16 != nil {
		return &ExecutionResult{ExitCode: 1, Error: errUTF16.Error(), Duration: time.Since(start)}, errUTF16
	}

	var dirUTF16 *uint16
	if workingDir != "" {
		dirUTF16, _ = windows.UTF16PtrFromString(workingDir)
	}

	var pi windows.ProcessInformation
	flags := uint32(windows.CREATE_NEW_CONSOLE)
	if envBlock != 0 {
		flags |= windows.CREATE_UNICODE_ENVIRONMENT
	}

	rProc, _, errCreate := procCreateProcessAsUserW.Call(
		uintptr(primaryToken),
		0,
		uintptr(unsafe.Pointer(&cmdLineUTF16[0])),
		0,
		0,
		0,
		uintptr(flags),
		envBlock,
		uintptr(unsafe.Pointer(dirUTF16)),
		uintptr(unsafe.Pointer(&si)),
		uintptr(unsafe.Pointer(&pi)),
	)

	// Si l'installeur requiert une élévation UAC (Code 740) ou échoue en direct, fallback via cmd.exe /c start
	if rProc == 0 {
		cmdStartLine := fmt.Sprintf(`cmd.exe /c start "" "%s" %s`, appPath, strings.Join(args, " "))
		cmdStartUTF16, errStartUTF16 := windows.UTF16FromString(cmdStartLine)
		if errStartUTF16 == nil {
			rProc, _, errCreate = procCreateProcessAsUserW.Call(
				uintptr(primaryToken),
				0,
				uintptr(unsafe.Pointer(&cmdStartUTF16[0])),
				0,
				0,
				0,
				uintptr(flags),
				envBlock,
				uintptr(unsafe.Pointer(dirUTF16)),
				uintptr(unsafe.Pointer(&si)),
				uintptr(unsafe.Pointer(&pi)),
			)
		}
	}

	if rProc == 0 {
		return &ExecutionResult{
			ExitCode: 1,
			Error:    fmt.Sprintf("CreateProcessAsUserW failed (session %d): %v", sessionID, errCreate),
			Duration: time.Since(start),
		}, errCreate
	}

	// Libérer proprement les handles de processus et de thread
	if pi.Thread != 0 {
		_ = windows.CloseHandle(pi.Thread)
	}
	if pi.Process != 0 {
		_ = windows.CloseHandle(pi.Process)
	}

	return &ExecutionResult{
		ExitCode: 0,
		Output:   launchSummary(appPath, args, sessionID, pi.ProcessId),
		Duration: time.Since(start),
	}, nil
}
