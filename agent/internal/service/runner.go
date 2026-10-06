package service

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"time"

	"mapt-agent/internal/api"
	"mapt-agent/internal/config"
	"mapt-agent/internal/inventory"
	"mapt-agent/internal/jobs"
	"mapt-agent/internal/logging"
)

type Runner struct {
	cfg      *config.Config
	client   *api.Client
	executor *jobs.Executor
	logger   *logging.Logger
}

func NewRunner(cfg *config.Config, logger *logging.Logger) *Runner {
	return &Runner{
		cfg:      cfg,
		client:   api.NewClient(cfg, logger),
		executor: jobs.NewExecutor(logger),
		logger:   logger,
	}
}

func (r *Runner) Run(ctx context.Context) error {
	r.logger.Info("Starting MAPT Windows Agent v%s (Device UUID: %s)...", r.cfg.AgentVersion, r.cfg.DeviceUUID)

	hostname, _ := os.Hostname()
	primaryIP := inventory.GetPrimaryIP()

	// 1. Enrôlement initial si nécessaire (avec retry automatique sans couper le service)
	for !r.cfg.IsEnrolled() {
		r.logger.Info("Agent not enrolled yet. Initiating enrollment with server %s...", r.cfg.ServerURL)
		osCap, osDispVer, osBld, _ := inventory.GetOSInfo()
		err := r.client.Enroll(hostname, osCap, osDispVer, osBld, primaryIP)
		if err != nil {
			r.logger.Warn("Enrollment attempt failed: %v. Retrying in 5 seconds...", err)
			select {
			case <-ctx.Done():
				return nil
			case <-time.After(5 * time.Second):
				continue
			}
		}
		r.logger.Info("Agent successfully enrolled! Agent token received and saved.")
		break
	}
	if r.cfg.IsEnrolled() {
		r.logger.Info("Agent is already enrolled.")
	}

	// 2. Premier Heartbeat et envoi initial de l'inventaire
	osCap, osDispVer, osBld, _ := inventory.GetOSInfo()
	_ = r.client.Heartbeat(hostname, primaryIP, osCap, osDispVer, osBld)
	invData := inventory.CollectInventory()
	if err := r.client.SendInventory(invData); err != nil {
		r.logger.Warn("Initial inventory submission failed: %v", err)
	} else {
		r.logger.Info("Initial hardware and system inventory submitted.")
	}

	// Tickers
	heartbeatInterval := time.Duration(r.cfg.HeartbeatInterval) * time.Second
	if heartbeatInterval <= 0 {
		heartbeatInterval = 30 * time.Second
	}
	pollInterval := time.Duration(r.cfg.PollInterval) * time.Second
	if pollInterval <= 0 {
		pollInterval = 30 * time.Second
	}
	inventoryInterval := time.Duration(r.cfg.InventoryInterval) * time.Second
	if inventoryInterval <= 0 {
		inventoryInterval = 3600 * time.Second
	}

	// 1. Goroutine dédiée au Heartbeat périodique
	// Crucial : Le heartbeat ne doit JAMAIS être bloqué par un déploiement long, un téléchargement ou un script
	go func() {
		hbTicker := time.NewTicker(heartbeatInterval)
		defer hbTicker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-hbTicker.C:
				currHost, _ := os.Hostname()
				currIP := inventory.GetPrimaryIP()
				cap, dispVer, bld, _ := inventory.GetOSInfo()
				if err := r.client.Heartbeat(currHost, currIP, cap, dispVer, bld); err != nil {
					r.logger.Warn("Heartbeat failed: %v", err)
				}
			}
		}
	}()

	// 2. Goroutine dédiée à l'inventaire périodique
	go func() {
		invTicker := time.NewTicker(inventoryInterval)
		defer invTicker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-invTicker.C:
				r.logger.Info("Collecting periodic system inventory...")
				inv := inventory.CollectInventory()
				_ = r.client.SendInventory(inv)
			}
		}
	}()

	// 3. Goroutine dédiée à la détection événementielle des ouvertures de session utilisateur (Logon)
	go func() {
		sessTicker := time.NewTicker(4 * time.Second)
		defer sessTicker.Stop()
		lastSeenUser := ""
		// Initialiser avec l'utilisateur actuel si déjà présent
		if initUser := inventory.GetActiveConsoleUser(); initUser != "" {
			lastSeenUser = initUser
		}

		for {
			select {
			case <-ctx.Done():
				return
			case <-sessTicker.C:
				currentUser := inventory.GetActiveConsoleUser()
				if currentUser != "" && currentUser != lastSeenUser {
					r.logger.Info("User logon detected: %s (Previous: %s). Checking for on-login recurring tasks...", currentUser, lastSeenUser)
					lastSeenUser = currentUser
					_ = r.client.NotifyLogin()
					r.pollAndExecuteJobsWithTrigger(ctx, "login")
					// Rafraîchir l'inventaire avec la nouvelle session utilisateur
					inv := inventory.CollectInventory()
					_ = r.client.SendInventory(inv)
				} else if currentUser == "" && lastSeenUser != "" {
					lastSeenUser = ""
				}
			}
		}
	}()

	// 4. Boucle principale de scrutation et exécution des jobs
	pollTicker := time.NewTicker(pollInterval)
	defer pollTicker.Stop()

	// Exécuter une première recherche de jobs immédiatement
	r.pollAndExecuteJobs(ctx)

	for {
		select {
		case <-ctx.Done():
			r.logger.Info("Stopping MAPT Agent runner (context cancelled)...")
			return nil

		case <-pollTicker.C:
			r.pollAndExecuteJobs(ctx)
		}
	}
}

func (r *Runner) pollAndExecuteJobs(ctx context.Context) {
	r.pollAndExecuteJobsWithTrigger(ctx, "")
}

func (r *Runner) pollAndExecuteJobsWithTrigger(ctx context.Context, trigger string) {
	jobList, err := r.client.GetJobsWithTrigger(trigger)
	if err != nil {
		r.logger.Warn("Failed to fetch pending jobs: %v", err)
		return
	}

	if len(jobList) == 0 {
		return
	}

	r.logger.Info("Received %d job(s) to execute (trigger: %s).", len(jobList), trigger)

	for _, job := range jobList {
		r.executeSingleJob(ctx, &job)
	}
}

func (r *Runner) executeSingleJob(ctx context.Context, job *jobs.JobPayload) {
	defer func() {
		if rec := recover(); rec != nil {
			r.logger.Error("PANIC interceptée lors de l'exécution du job %s: %v", job.JobID, rec)
			logs := r.logger.FlushBuffer()
			_ = r.client.SendLogs(job.JobID, logs)
			_ = r.client.FailJob(job.JobID, 1, fmt.Sprintf("Erreur inattendue de l'agent : %v", rec), "")
		}
	}()

	r.logger.Info("Processing Job ID: %s (Type: %s)", job.JobID, job.Type)

	// 1. ACK
	if err := r.client.AckJob(job.JobID); err != nil {
		r.logger.Error("Failed to ACK job %s: %v", job.JobID, err)
	}

	// 2. Progression initiale
	_ = r.client.ProgressJob(job.JobID, 10, "Job initialisé sur l'agent")

	// 3. Exécution
	result, err := r.executor.Execute(ctx, job, r.cfg.ServerURL, r.cfg.AgentToken)

	// 4. Envoi des logs collectés
	logs := r.logger.FlushBuffer()
	_ = r.client.SendLogs(job.JobID, logs)

	// 5. Rapport final
	if err != nil || (result != nil && result.ExitCode != 0) {
		exitCode := 1
		errMsg := "Unknown error"
		output := ""
		if result != nil {
			exitCode = result.ExitCode
			errMsg = result.Error
			output = result.Output
		}
		if errMsg == "" && err != nil {
			errMsg = err.Error()
		}
		r.logger.Error("Job %s failed with exit code %d: %s", job.JobID, exitCode, errMsg)
		_ = r.client.FailJob(job.JobID, exitCode, errMsg, output)
	} else {
		durationSec := 0.0
		output := ""
		if result != nil {
			durationSec = result.Duration.Seconds()
			output = result.Output
		}
		r.logger.Info("Job %s completed successfully (duration: %.2fs)", job.JobID, durationSec)
		_ = r.client.CompleteJob(job.JobID, 0, durationSec, output)

		// Rafraîchir l'inventaire matériel et logiciel immédiatement après un job réussi (désinstallation, installation, script, etc.)
		go func() {
			time.Sleep(3 * time.Second) // Temporisation pour laisser le temps aux désinstalleurs Windows d'écrire dans la base de registre
			r.logger.Info("Refreshing system and software inventory post-job...")
			inv := inventory.CollectInventory()
			if err := r.client.SendInventory(inv); err != nil {
				r.logger.Warn("Failed to submit post-job inventory: %v", err)
			} else {
				r.logger.Info("Post-job system and software inventory updated successfully.")
			}
		}()
	}
}

func RunStandalone(configPath string, serverURLOverride string) {
	logger := logging.NewLogger()
	cfg, err := config.LoadConfig(configPath)
	if err != nil {
		logger.Error("Failed to load config: %v", err)
		return
	}

	if serverURLOverride != "" {
		cfg.ServerURL = serverURLOverride
		_ = cfg.Save()
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)

	runner := NewRunner(cfg, logger)

	go func() {
		<-sigChan
		logger.Info("Signal received, stopping agent...")
		cancel()
	}()

	if err := runner.Run(ctx); err != nil {
		logger.Error("Agent encountered fatal error: %v", err)
	}
}
