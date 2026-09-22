//go:build windows

package jobs

import (
	"context"
	"fmt"
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
	procWTSEnumerateSessionsW        = modwtsapi32.NewProc("WTSEnumerateSessionsW")
	procWTSFreeMemory                = modwtsapi32.NewProc("WTSFreeMemory")

	modadvapi32              = windows.NewLazySystemDLL("advapi32.dll")
	procCreateProcessAsUserW = modadvapi32.NewProc("CreateProcessAsUserW")
	procDuplicateTokenEx     = modadvapi32.NewProc("DuplicateTokenEx")
	procSetTokenInformation  = modadvapi32.NewProc("SetTokenInformation")

	moduserenv                  = windows.NewLazySystemDLL("userenv.dll")
	procCreateEnvironmentBlock  = moduserenv.NewProc("CreateEnvironmentBlock")
	procDestroyEnvironmentBlock = moduserenv.NewProc("DestroyEnvironmentBlock")
)

type WTS_SESSION_INFO struct {
	SessionID      uint32
	WinStationName *uint16
	State          uint32 // WTSActive = 0
}

func getActiveSessionID() (uint32, error) {
	// 1. D'abord vérifier la session console active
	r1, _, _ := procWTSGetActiveConsoleSessionId.Call()
	consoleSessionID := uint32(r1)
	if consoleSessionID != 0xFFFFFFFF {
		return consoleSessionID, nil
	}

	// 2. Sinon, énumérer les sessions pour trouver une session WTSActive (RDP ou autre)
	var sessionInfo *WTS_SESSION_INFO
	var count uint32
	rEnum, _, err := procWTSEnumerateSessionsW.Call(
		0, // WTS_CURRENT_SERVER_HANDLE
		0,
		1,
		uintptr(unsafe.Pointer(&sessionInfo)),
		uintptr(unsafe.Pointer(&count)),
	)
	if rEnum == 0 {
		return 0, fmt.Errorf("WTSEnumerateSessions failed: %v", err)
	}
	defer procWTSFreeMemory.Call(uintptr(unsafe.Pointer(sessionInfo)))

	sessions := (*[1 << 20]WTS_SESSION_INFO)(unsafe.Pointer(sessionInfo))[:count:count]
	for _, s := range sessions {
		if s.State == 0 { // WTSActive
			return s.SessionID, nil
		}
	}

	return 0, fmt.Errorf("aucune session utilisateur active trouvée (aucun utilisateur connecté)")
}

func getInteractiveToken(sessionID uint32, runAsAdmin bool) (windows.Token, error) {
	// Si runAsAdmin est demandé : on tente d'abord de dupliquer le token SYSTEM avec le SessionID cible
	if runAsAdmin {
		var currentProcessToken windows.Token
		err := windows.OpenProcessToken(windows.CurrentProcess(), windows.TOKEN_ALL_ACCESS, &currentProcessToken)
		if err == nil {
			defer currentProcessToken.Close()
			var systemPrimaryToken windows.Token
			r1, _, _ := procDuplicateTokenEx.Call(
				uintptr(currentProcessToken),
				uintptr(windows.TOKEN_ALL_ACCESS),
				0,
				uintptr(windows.SecurityIdentification),
				uintptr(windows.TokenPrimary),
				uintptr(unsafe.Pointer(&systemPrimaryToken)),
			)
			if r1 != 0 {
				targetSession := sessionID
				rSet, _, _ := procSetTokenInformation.Call(
					uintptr(systemPrimaryToken),
					12, // TokenSessionId
					uintptr(unsafe.Pointer(&targetSession)),
					unsafe.Sizeof(targetSession),
				)
				if rSet != 0 {
					return systemPrimaryToken, nil
				}
				systemPrimaryToken.Close()
			}
		}
	}

	// Fallback standard : Récupérer le token de l'utilisateur connecté via WTSQueryUserToken
	var impersonationHandle windows.Handle
	r1, _, err := procWTSQueryUserToken.Call(uintptr(sessionID), uintptr(unsafe.Pointer(&impersonationHandle)))
	if r1 == 0 {
		return 0, fmt.Errorf("WTSQueryUserToken failed pour session %d: %v", sessionID, err)
	}
	defer windows.CloseHandle(impersonationHandle)

	var userPrimaryToken windows.Token
	rDup, _, errDup := procDuplicateTokenEx.Call(
		uintptr(impersonationHandle),
		uintptr(windows.TOKEN_ALL_ACCESS),
		0,
		uintptr(windows.SecurityIdentification),
		uintptr(windows.TokenPrimary),
		uintptr(unsafe.Pointer(&userPrimaryToken)),
	)
	if rDup == 0 {
		return 0, fmt.Errorf("DuplicateTokenEx failed: %v", errDup)
	}

	return userPrimaryToken, nil
}

func ExecuteInteractiveProcess(
	ctx context.Context,
	appPath string,
	args []string,
	workingDir string,
	runAsAdmin bool,
	timeoutSeconds int,
) (*ExecutionResult, error) {
	sessionID, err := getActiveSessionID()
	if err != nil {
		return &ExecutionResult{
			ExitCode: 1,
			Error:    fmt.Sprintf("Mode interactif impossible : %v", err),
		}, err
	}

	token, err := getInteractiveToken(sessionID, runAsAdmin)
	if err != nil {
		return &ExecutionResult{
			ExitCode: 1,
			Error:    fmt.Sprintf("Échec d'obtention du token interactif (Session %d): %v", sessionID, err),
		}, err
	}
	defer token.Close()

	// Préparer l'environnement utilisateur
	var envBlock uintptr
	rEnv, _, _ := procCreateEnvironmentBlock.Call(uintptr(unsafe.Pointer(&envBlock)), uintptr(token), 0)
	if rEnv != 0 && envBlock != 0 {
		defer procDestroyEnvironmentBlock.Call(envBlock)
	}

	// Préparer StartupInfo avec le bureau interactif winsta0\default
	var si windows.StartupInfo
	si.Cb = uint32(unsafe.Sizeof(si))
	si.Desktop = windows.StringToUTF16Ptr(`winsta0\default`)

	// Construire la ligne de commande complète
	var cmdLine string
	if len(args) > 0 {
		cmdLine = fmt.Sprintf(`"%s" %s`, appPath, strings.Join(args, " "))
	} else {
		cmdLine = fmt.Sprintf(`"%s"`, appPath)
	}

	cmdLineUTF16, err := windows.UTF16PtrFromString(cmdLine)
	if err != nil {
		return &ExecutionResult{ExitCode: 1, Error: err.Error()}, err
	}

	var dirUTF16 *uint16
	if workingDir != "" {
		dirUTF16, _ = windows.UTF16PtrFromString(workingDir)
	}

	var pi windows.ProcessInformation
	flags := uint32(windows.CREATE_UNICODE_ENVIRONMENT)

	rProc, _, errCreate := procCreateProcessAsUserW.Call(
		uintptr(token),
		0,
		uintptr(unsafe.Pointer(cmdLineUTF16)),
		0,
		0,
		0,
		uintptr(flags),
		envBlock,
		uintptr(unsafe.Pointer(dirUTF16)),
		uintptr(unsafe.Pointer(&si)),
		uintptr(unsafe.Pointer(&pi)),
	)

	if rProc == 0 {
		return &ExecutionResult{
			ExitCode: 1,
			Error:    fmt.Sprintf("CreateProcessAsUserW failed (Session %d): %v", sessionID, errCreate),
		}, errCreate
	}

	defer windows.CloseHandle(pi.Thread)
	defer windows.CloseHandle(pi.Process)

	start := time.Now()

	// Par défaut, pour une installation graphique interactive où l'utilisateur clique, donner un temps suffisant (ex: 1800s / 30m)
	if timeoutSeconds <= 0 {
		timeoutSeconds = 1800
	}
	execCtx, cancel := context.WithTimeout(ctx, time.Duration(timeoutSeconds)*time.Second)
	defer cancel()

	done := make(chan uint32, 1)
	errChan := make(chan error, 1)

	go func() {
		event, waitErr := windows.WaitForSingleObject(pi.Process, windows.INFINITE)
		if waitErr != nil {
			errChan <- waitErr
			return
		}
		if event == windows.WAIT_OBJECT_0 {
			var code uint32
			_ = windows.GetExitCodeProcess(pi.Process, &code)
			done <- code
		} else {
			errChan <- fmt.Errorf("wait event returned %d", event)
		}
	}()

	var exitCode uint32
	var runErr error

	select {
	case <-execCtx.Done():
		// Timeout ou annulation : tuer l'arborescence pour libérer le fichier
		_ = exec.Command("taskkill", "/F", "/T", "/PID", fmt.Sprintf("%d", pi.ProcessId)).Run()
		if execCtx.Err() == context.DeadlineExceeded {
			runErr = fmt.Errorf("délai d'installation graphique dépassé après %d secondes", timeoutSeconds)
		} else {
			runErr = execCtx.Err()
		}
		exitCode = 1
	case code := <-done:
		exitCode = code
	case waitErr := <-errChan:
		runErr = waitErr
		exitCode = 1
	}

	duration := time.Since(start)

	var errMsg string
	if runErr != nil {
		errMsg = runErr.Error()
	}

	output := fmt.Sprintf("Processus graphique exécuté avec succès sur la session utilisateur %d (PID: %d). Durée: %.1fs.", sessionID, pi.ProcessId, duration.Seconds())

	return &ExecutionResult{
		ExitCode: int(exitCode),
		Output:   output,
		Error:    errMsg,
		Duration: duration,
	}, nil
}
