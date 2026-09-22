//go:build !windows

package jobs

import (
	"context"
	"fmt"
)

func ExecuteInteractiveProcess(
	ctx context.Context,
	appPath string,
	args []string,
	workingDir string,
	runAsAdmin bool,
	timeoutSeconds int,
) (*ExecutionResult, error) {
	return nil, fmt.Errorf("interactive process execution is only supported on Windows")
}
