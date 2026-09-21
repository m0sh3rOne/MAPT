package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/kardianos/service"
	"mapt-agent/internal/config"
	"mapt-agent/internal/logging"
	appService "mapt-agent/internal/service"
)

type program struct {
	configPath  string
	serverURL   string
	enrollToken string
	cancel      context.CancelFunc
	exitChan    chan struct{}
}

func (p *program) Start(s service.Service) error {
	p.exitChan = make(chan struct{})
	go p.run()
	return nil
}

func (p *program) run() {
	defer close(p.exitChan)
	logger := logging.NewLogger()

	cfg, err := config.LoadConfig(p.configPath)
	if err != nil {
		logger.Error("Erreur chargement configuration: %v", err)
		return
	}

	needsSave := false
	if p.serverURL != "" && cfg.ServerURL != p.serverURL {
		cfg.ServerURL = p.serverURL
		needsSave = true
	}
	if p.enrollToken != "" && cfg.EnrollmentToken != p.enrollToken {
		cfg.EnrollmentToken = p.enrollToken
		needsSave = true
	}
	if needsSave {
		_ = cfg.Save()
	}

	ctx, cancel := context.WithCancel(context.Background())
	p.cancel = cancel

	runner := appService.NewRunner(cfg, logger)
	if err := runner.Run(ctx); err != nil {
		logger.Error("Erreur exécution agent: %v", err)
	}
}

func (p *program) Stop(s service.Service) error {
	if p.cancel != nil {
		p.cancel()
	}
	<-p.exitChan
	return nil
}

func main() {
	serviceAction := flag.String("service", "", "Contrôle du service Windows (install, uninstall, start, stop, restart, status)")
	configPath := flag.String("config", "mapt-agent-config.json", "Chemin vers le fichier de configuration JSON")
	serverURL := flag.String("server", "", "URL de base de l'API MAPT (ex: http://localhost:8000/api/v1)")
	enrollToken := flag.String("enroll-token", "", "Jeton d'enrôlement MAPT pour l'enregistrement initial")
	standalone := flag.Bool("standalone", false, "Exécuter l'agent en mode console autonome (sans service Windows)")
	showVersion := flag.Bool("version", false, "Affiche la version de l'agent")

	flag.Parse()

	if *showVersion {
		fmt.Println("MAPT Windows Agent v1.0.0 (Go)")
		os.Exit(0)
	}

	// Si des paramètres server ou token sont fournis, les persister immédiatement dans le fichier config
	if *serverURL != "" || *enrollToken != "" {
		cfg, err := config.LoadConfig(*configPath)
		if err == nil {
			if *serverURL != "" {
				cfg.ServerURL = *serverURL
			}
			if *enrollToken != "" {
				cfg.EnrollmentToken = *enrollToken
			}
			_ = cfg.Save()
		}
	}

	prg := &program{
		configPath:  *configPath,
		serverURL:   *serverURL,
		enrollToken: *enrollToken,
	}

	svcConfig := &service.Config{
		Name:        "mapt-agent",
		DisplayName: "MAPT Endpoint Agent",
		Description: "Service d'administration, d'inventaire et de télémétrie MAPT pour Windows",
		Option: service.KeyValue{
			"StartType": "automatic",
		},
	}

	s, err := service.New(prg, svcConfig)
	if err != nil {
		log.Fatalf("Erreur initialisation service: %v", err)
	}

	if *serviceAction != "" {
		err := service.Control(s, *serviceAction)
		if err != nil {
			fmt.Printf("Action '%s' sur le service a échoué: %v\n", *serviceAction, err)
			os.Exit(1)
		}
		fmt.Printf("Action '%s' exécutée avec succès pour le service %s.\n", *serviceAction, svcConfig.Name)
		return
	}

	if *standalone || service.Interactive() {
		// Exécution interactive en console
		fmt.Println("==================================================")
		fmt.Println("   MAPT Agent - Mode Console Autonome             ")
		fmt.Println("==================================================")
		sigChan := make(chan os.Signal, 1)
		signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)
		go func() {
			<-sigChan
			fmt.Println("\nArrêt de l'agent...")
			if prg.cancel != nil {
				prg.cancel()
			}
		}()
		_ = prg.Start(s)
		<-prg.exitChan
		return
	}

	// Exécution standard gérée par le Service Control Manager Windows
	if err := s.Run(); err != nil {
		log.Fatalf("Erreur exécution service Windows: %v", err)
	}
}
