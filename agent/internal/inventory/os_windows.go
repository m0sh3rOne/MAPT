//go:build windows

package inventory

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os/exec"
	"runtime"
	"strings"
	"time"
	"unicode/utf16"
	"unsafe"

	"golang.org/x/sys/windows"
	"golang.org/x/sys/windows/registry"
)

var (
	modKernel32                      = windows.NewLazySystemDLL("kernel32.dll")
	procWTSGetActiveConsoleSessionId = modKernel32.NewProc("WTSGetActiveConsoleSessionId")
	modWtsapi32                      = windows.NewLazySystemDLL("wtsapi32.dll")
	procWTSQuerySessionInformationW  = modWtsapi32.NewProc("WTSQuerySessionInformationW")
	procWTSFreeMemory                = modWtsapi32.NewProc("WTSFreeMemory")
)

const (
	wtsUserName   = 5
	wtsDomainName = 7
)

func getOSInfoFromRegistry() (caption, displayVersion, build, arch string) {
	arch = "64-bit"
	if runtime.GOARCH == "386" {
		arch = "32-bit"
	} else if runtime.GOARCH == "arm64" {
		arch = "ARM64"
	}

	k, err := registry.OpenKey(registry.LOCAL_MACHINE, `SOFTWARE\Microsoft\Windows NT\CurrentVersion`, registry.QUERY_VALUE)
	if err != nil {
		return "", "", "", arch
	}
	defer k.Close()

	prodName, _, _ := k.GetStringValue("ProductName")
	dispVer, _, _ := k.GetStringValue("DisplayVersion")
	if dispVer == "" {
		dispVer, _, _ = k.GetStringValue("ReleaseId")
	}
	bld, _, _ := k.GetStringValue("CurrentBuild")
	if bld == "" {
		bld, _, _ = k.GetStringValue("CurrentBuildNumber")
	}
	ubr, _, err := k.GetIntegerValue("UBR")
	fullBuild := bld
	if err == nil && ubr > 0 && bld != "" {
		fullBuild = fmt.Sprintf("%s.%d", bld, ubr)
	}

	caption = strings.TrimPrefix(prodName, "Microsoft ")
	caption = strings.TrimSpace(caption)
	if caption == "" {
		caption = "Windows"
	}

	return caption, dispVer, fullBuild, arch
}

// GetOSInfo retourne le nom d'affichage précis (winver), la version (23H2), le build complet et l'architecture
func GetOSInfo() (caption, displayVersion, build, arch string) {
	// 1. Détection ultra-rapide et fiable par Registre Windows (0ms, 100% stable en Service Windows)
	regCap, regDispVer, regBld, regArch := getOSInfoFromRegistry()
	if regCap != "" && regCap != "Windows" && regBld != "" {
		return regCap, regDispVer, regBld, regArch
	}

	caption = regCap
	if caption == "" {
		caption = "Windows"
	}
	displayVersion = regDispVer
	build = regBld
	arch = regArch

	// 2. Fallback PowerShell / WMI si le registre n'a pas renvoyé toutes les données
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()

	cmdStr := `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8;
$os = Get-CimInstance Win32_OperatingSystem -ErrorAction SilentlyContinue;
$regNt = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion' -ErrorAction SilentlyContinue;
$dispVer = if ($regNt.DisplayVersion) { $regNt.DisplayVersion } elseif ($regNt.ReleaseId) { $regNt.ReleaseId } else { "" };
$ubr = if ($regNt.UBR) { $regNt.UBR } else { "" };
$bNum = if ($os.BuildNumber) { $os.BuildNumber } else { $regNt.CurrentBuild };
$fullBuild = if ($ubr) { "$bNum.$ubr" } else { "$bNum" };
$cap = if ($os.Caption) { $os.Caption.Replace("Microsoft ", "").Trim() } else { "Windows" };
$arc = if ($os.OSArchitecture) { $os.OSArchitecture } else { "64-bit" };
@{caption=$cap; displayVersion=$dispVer; build=$fullBuild; arch=$arc} | ConvertTo-Json -Compress
`
	utf16Runes := utf16.Encode([]rune(cmdStr))
	utf16Bytes := make([]byte, len(utf16Runes)*2)
	for i, r := range utf16Runes {
		utf16Bytes[i*2] = byte(r)
		utf16Bytes[i*2+1] = byte(r >> 8)
	}
	encodedScript := base64.StdEncoding.EncodeToString(utf16Bytes)

	cmd := exec.CommandContext(ctx, "powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encodedScript)
	var out bytes.Buffer
	cmd.Stdout = &out
	if err := cmd.Run(); err == nil {
		var res struct {
			Caption        string `json:"caption"`
			DisplayVersion string `json:"displayVersion"`
			Build          string `json:"build"`
			Arch           string `json:"arch"`
		}
		if json.Unmarshal(out.Bytes(), &res) == nil {
			if res.Caption != "" {
				caption = res.Caption
			}
			if res.DisplayVersion != "" {
				displayVersion = res.DisplayVersion
			}
			if res.Build != "" {
				build = res.Build
			}
			if res.Arch != "" {
				arch = res.Arch
			}
		}
	}
	return
}

// GetActiveConsoleUser retourne le nom d'utilisateur actuellement connecté en session active (DOMAINE\User ou User)
func GetActiveConsoleUser() string {
	r1, _, _ := procWTSGetActiveConsoleSessionId.Call()
	sessionID := uint32(r1)
	if sessionID == 0xFFFFFFFF || sessionID == 0 {
		return ""
	}

	var userPtr uintptr
	var userBytes uint32
	rU, _, _ := procWTSQuerySessionInformationW.Call(
		0, // WTS_CURRENT_SERVER_HANDLE
		uintptr(sessionID),
		uintptr(wtsUserName),
		uintptr(unsafe.Pointer(&userPtr)),
		uintptr(unsafe.Pointer(&userBytes)),
	)
	if rU == 0 || userPtr == 0 {
		return ""
	}
	defer procWTSFreeMemory.Call(userPtr)

	userName := windows.UTF16PtrToString((*uint16)(unsafe.Pointer(userPtr)))
	userName = strings.TrimSpace(userName)
	if userName == "" {
		return ""
	}

	var domPtr uintptr
	var domBytes uint32
	rD, _, _ := procWTSQuerySessionInformationW.Call(
		0,
		uintptr(sessionID),
		uintptr(wtsDomainName),
		uintptr(unsafe.Pointer(&domPtr)),
		uintptr(unsafe.Pointer(&domBytes)),
	)
	domainName := ""
	if rD != 0 && domPtr != 0 {
		domainName = windows.UTF16PtrToString((*uint16)(unsafe.Pointer(domPtr)))
		domainName = strings.TrimSpace(domainName)
		procWTSFreeMemory.Call(domPtr)
	}

	if domainName != "" {
		return fmt.Sprintf("%s\\%s", domainName, userName)
	}
	return userName
}
