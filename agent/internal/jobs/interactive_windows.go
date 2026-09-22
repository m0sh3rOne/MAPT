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
	procWTSEnumerateSessionsW        = modwtsapi32.NewProc("WTSEnumerateSessionsW")
	procWTSQuerySessionInformationW  = modwtsapi32.NewProc("WTSQuerySessionInformationW")
	procWTSFreeMemory                = modwtsapi32.NewProc("WTSFreeMemory")

	modadvapi32              = windows.NewLazySystemDLL("advapi32.dll")
	procCreateProcessAsUserW = modadvapi32.NewProc("CreateProcessAsUserW")
	procDuplicateTokenEx     = modadvapi32.NewProc("DuplicateTokenEx")
	procSetTokenInformation  = modadvapi32.NewProc("SetTokenInformation")
	procGetTokenInformation  = modadvapi32.NewProc("GetTokenInformation")

	moduserenv                  = windows.NewLazySystemDLL("userenv.dll")
	procCreateEnvironmentBlock  = moduserenv.NewProc("CreateEnvironmentBlock")
	procDestroyEnvironmentBlock = moduserenv.NewProc("DestroyEnvironmentBlock")
)

type WTS_SESSION_INFO struct {
	SessionID      uint32
	WinStationName *uint16
	State          uint32 // WTSActive = 0
}

type TOKEN_LINKED_TOKEN struct {
	LinkedToken windows.Token
}

// sessionUserName retourne le nom de l'utilisateur ouvert sur une session Windows.
func sessionUserName(sessionID uint32) string {
	const wtsUserName = 5

	var buffer *uint16
	var bytesReturned uint32
	r1, _, _ := procWTSQuerySessionInformationW.Call(
		0, // WTS_CURRENT_SERVER_HANDLE
		uintptr(sessionID),
		wtsUserName,
		uintptr(unsafe.Pointer(&buffer)),
		uintptr(unsafe.Pointer(&bytesReturned)),
	)
	if r1 == 0 || buffer == nil {
		return ""
	}
	defer procWTSFreeMemory.Call(uintptr(unsafe.Pointer(buffer)))

	return strings.TrimSpace(windows.UTF16PtrToString(buffer))
}

func getActiveSessionID() (uint32, error) {
	// 1. D'abord vérifier la session console active (hors Session 0 réservée aux services)
	r1, _, _ := procWTSGetActiveConsoleSessionId.Call()
	consoleSessionID := uint32(r1)
	if consoleSessionID != 0xFFFFFFFF && consoleSessionID != 0 {
		return consoleSessionID, nil
	}

	// 2. Sinon, énumérer les sessions pour trouver une session WTSActive (RDP ou console)
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
		// WTSActive (State == 0), hors Session 0 (services)
		if s.State == 0 && s.SessionID != 0 {
			return s.SessionID, nil
		}
	}

	// 3. Fallback : si une session > 0 existe
	for _, s := range sessions {
		if s.SessionID != 0 {
			return s.SessionID, nil
		}
	}

	return 0, fmt.Errorf("aucune session utilisateur active trouvée sur le poste")
}

// getCurrentSessionID retourne l'identifiant de session Windows de l'agent lui-même.
func getCurrentSessionID() (uint32, error) {
	var sessionID uint32
	if err := windows.ProcessIdToSessionId(windows.GetCurrentProcessId(), &sessionID); err != nil {
		return 0, err
	}
	return sessionID, nil
}

func getInteractiveToken(sessionID uint32, runAsAdmin bool) (windows.Token, error) {
	// 1. Récupérer le jeton de l'utilisateur connecté dans la session cible
	var impersonationHandle windows.Handle
	r1, _, errWTS := procWTSQueryUserToken.Call(uintptr(sessionID), uintptr(unsafe.Pointer(&impersonationHandle)))
	if r1 != 0 && impersonationHandle != 0 {
		defer windows.CloseHandle(impersonationHandle)
		userToken := windows.Token(impersonationHandle)

		// Si runAsAdmin est demandé : tenter de récupérer le jeton Administrateur lié (TokenLinkedToken sous UAC)
		if runAsAdmin {
			var linked TOKEN_LINKED_TOKEN
			var returnLength uint32
			const tokenLinkedToken = 19
			rLinked, _, _ := procGetTokenInformation.Call(
				uintptr(userToken),
				uintptr(tokenLinkedToken),
				uintptr(unsafe.Pointer(&linked)),
				unsafe.Sizeof(linked),
				uintptr(unsafe.Pointer(&returnLength)),
			)
			if rLinked != 0 && linked.LinkedToken != 0 {
				var primaryAdminToken windows.Token
				rDup, _, _ := procDuplicateTokenEx.Call(
					uintptr(linked.LinkedToken),
					uintptr(windows.TOKEN_ALL_ACCESS),
					0,
					uintptr(windows.SecurityIdentification),
					uintptr(windows.TokenPrimary),
					uintptr(unsafe.Pointer(&primaryAdminToken)),
				)
				linked.LinkedToken.Close()
				if rDup != 0 {
					return primaryAdminToken, nil
				}
			}
		}

		// Dupliquer le jeton utilisateur primaire standard
		var userPrimaryToken windows.Token
		rDup, _, _ := procDuplicateTokenEx.Call(
			uintptr(userToken),
			uintptr(windows.TOKEN_ALL_ACCESS),
			0,
			uintptr(windows.SecurityIdentification),
			uintptr(windows.TokenPrimary),
			uintptr(unsafe.Pointer(&userPrimaryToken)),
		)
		if rDup != 0 {
			return userPrimaryToken, nil
		}
	}

	// 2. Fallback : Dupliquer le jeton SYSTEM actuel et lui assigner le SessionId cible
	var currentProcessToken windows.Token
	errOpen := windows.OpenProcessToken(windows.CurrentProcess(), windows.TOKEN_ALL_ACCESS, &currentProcessToken)
	if errOpen == nil {
		defer currentProcessToken.Close()
		var systemPrimaryToken windows.Token
		rDup, _, _ := procDuplicateTokenEx.Call(
			uintptr(currentProcessToken),
			uintptr(windows.TOKEN_ALL_ACCESS),
			0,
			uintptr(windows.SecurityIdentification),
			uintptr(windows.TokenPrimary),
			uintptr(unsafe.Pointer(&systemPrimaryToken)),
		)
		if rDup != 0 {
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

	return 0, fmt.Errorf("impossible d'obtenir un jeton interactif pour la session %d : %v", sessionID, errWTS)
}

// launchInCurrentSession lance le processus directement depuis la session de l'agent.
func launchInCurrentSession(appPath string, args []string, workingDir string) (uint32, error) {
	cmd := exec.Command(appPath, args...)
	cmd.Dir = workingDir
	cmd.Env = append(os.Environ(), "SEE_MASK_NOZONECHECKS=1")

	if err := cmd.Start(); err != nil {
		return 0, err
	}
	pid := uint32(cmd.Process.Pid)

	// Libération du handle du processus fils en arrière-plan sans bloquer
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
			"L'installation doit être finalisée manuellement par l'utilisateur sur son écran.",
		sessionID, pid, cmdLine,
	)
}

// ExecuteInteractiveProcess lance un programme sur le bureau de l'utilisateur connecté.
// Le job est validé dès que le processus est lancé avec succès (pas d'attente bloquante).
func ExecuteInteractiveProcess(
	ctx context.Context,
	appPath string,
	args []string,
	workingDir string,
	runAsAdmin bool,
) (*ExecutionResult, error) {
	start := time.Now()

	sessionID, err := getActiveSessionID()
	if err != nil {
		return &ExecutionResult{
			ExitCode: 1,
			Error:    fmt.Sprintf("Mode interactif impossible : %v", err),
			Duration: time.Since(start),
		}, err
	}

	// Cas 1 : Si l'agent tourne déjà dans la session interactive de l'utilisateur
	if currentSessionID, errSess := getCurrentSessionID(); errSess == nil && currentSessionID == sessionID {
		pid, errLaunch := launchInCurrentSession(appPath, args, workingDir)
		if errLaunch != nil {
			return &ExecutionResult{
				ExitCode: 1,
				Error:    fmt.Sprintf("Échec du lancement dans la session %d : %v", sessionID, errLaunch),
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
	token, err := getInteractiveToken(sessionID, runAsAdmin)
	if err != nil {
		return &ExecutionResult{
			ExitCode: 1,
			Error:    fmt.Sprintf("Échec d'obtention du jeton interactif (session %d) : %v", sessionID, err),
			Duration: time.Since(start),
		}, err
	}
	defer token.Close()

	// Préparer l'environnement utilisateur
	var envBlock uintptr
	rEnv, _, _ := procCreateEnvironmentBlock.Call(uintptr(unsafe.Pointer(&envBlock)), uintptr(token), 0)
	if rEnv != 0 && envBlock != 0 {
		defer procDestroyEnvironmentBlock.Call(envBlock)
	}

	// Préparer StartupInfo avec le bureau interactif winsta0\default et affichage SW_SHOW
	var si windows.StartupInfo
	si.Cb = uint32(unsafe.Sizeof(si))
	si.Desktop = windows.StringToUTF16Ptr(`winsta0\default`)
	si.Flags = windows.STARTF_USESHOWWINDOW
	si.ShowWindow = windows.SW_SHOW

	// Construire la ligne de commande complète
	var cmdLine string
	if len(args) > 0 {
		cmdLine = fmt.Sprintf(`"%s" %s`, appPath, strings.Join(args, " "))
	} else {
		cmdLine = fmt.Sprintf(`"%s"`, appPath)
	}

	cmdLineUTF16, err := windows.UTF16PtrFromString(cmdLine)
	if err != nil {
		return &ExecutionResult{ExitCode: 1, Error: err.Error(), Duration: time.Since(start)}, err
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
			Error:    fmt.Sprintf("CreateProcessAsUserW failed (session %d): %v", sessionID, errCreate),
			Duration: time.Since(start),
		}, errCreate
	}

	// Fermer nos handles : le processus lancé continue de vivre sur l'écran de l'utilisateur
	_ = windows.CloseHandle(pi.Thread)
	_ = windows.CloseHandle(pi.Process)

	return &ExecutionResult{
		ExitCode: 0,
		Output:   launchSummary(appPath, args, sessionID, pi.ProcessId),
		Duration: time.Since(start),
	}, nil
}
