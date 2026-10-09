//go:build !windows

package jobs

// decodeConsoleOutput : hors Windows, les sorties console sont deja en UTF-8.
func decodeConsoleOutput(raw []byte) string {
	return string(raw)
}
