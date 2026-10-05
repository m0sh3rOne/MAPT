//go:build !windows

package inventory

import (
	"runtime"
)

// GetOSInfo retourne le nom de l'OS pour les systèmes non-Windows
func GetOSInfo() (caption, displayVersion, build, arch string) {
	return runtime.GOOS, "", runtime.GOARCH, runtime.GOARCH
}
