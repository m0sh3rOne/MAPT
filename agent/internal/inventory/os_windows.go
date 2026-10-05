//go:build windows

package inventory

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os/exec"
	"runtime"
	"strings"
	"time"

	"golang.org/x/sys/windows/registry"
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
	cmd := exec.CommandContext(ctx, "powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", cmdStr)
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
