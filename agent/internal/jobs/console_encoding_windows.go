//go:build windows

package jobs

import (
	"unicode/utf8"
	"unsafe"

	"golang.org/x/sys/windows"
)

var (
	modKernel32             = windows.NewLazySystemDLL("kernel32.dll")
	procMultiByteToWideChar = modKernel32.NewProc("MultiByteToWideChar")
	procGetOEMCP            = modKernel32.NewProc("GetOEMCP")
	procGetACP              = modKernel32.NewProc("GetACP")
)

// decodeConsoleOutput convertit la sortie brute d'un processus console Windows en UTF-8.
// Windows PowerShell 5.1, cmd.exe, cscript, icacls, robocopy... ecrivent dans la page de
// code OEM (CP850 sur un Windows francais) : lue telle quelle en UTF-8, chaque accent
// devient le caractere de remplacement "�". Si la sortie est deja de l'UTF-8 valide
// (ex: ASCII pur ou script ayant force [Console]::OutputEncoding), elle est conservee.
func decodeConsoleOutput(raw []byte) string {
	if len(raw) == 0 {
		return ""
	}
	// Retirer un eventuel BOM UTF-8
	if len(raw) >= 3 && raw[0] == 0xEF && raw[1] == 0xBB && raw[2] == 0xBF {
		raw = raw[3:]
	}
	if utf8.Valid(raw) {
		return string(raw)
	}

	codePage := uint32(1) // CP_OEMCP
	if r, _, _ := procGetOEMCP.Call(); r != 0 {
		codePage = uint32(r)
	}
	if s, ok := multiByteToString(raw, codePage); ok {
		return s
	}
	// Repli sur la page de code ANSI (CP1252)
	if r, _, _ := procGetACP.Call(); r != 0 {
		if s, ok := multiByteToString(raw, uint32(r)); ok {
			return s
		}
	}
	return string(raw)
}

func multiByteToString(raw []byte, codePage uint32) (string, bool) {
	n, _, _ := procMultiByteToWideChar.Call(
		uintptr(codePage), 0,
		uintptr(unsafe.Pointer(&raw[0])), uintptr(len(raw)),
		0, 0,
	)
	if n == 0 {
		return "", false
	}
	buf := make([]uint16, n)
	n, _, _ = procMultiByteToWideChar.Call(
		uintptr(codePage), 0,
		uintptr(unsafe.Pointer(&raw[0])), uintptr(len(raw)),
		uintptr(unsafe.Pointer(&buf[0])), n,
	)
	if n == 0 {
		return "", false
	}
	return windows.UTF16ToString(buf[:n]), true
}
