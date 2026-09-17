package main

import (
	"flag"
	"fmt"
	"os"

	"mapt-agent/internal/service"
)

func main() {
	configPath := flag.String("config", "mapt-agent-config.json", "Chemin vers le fichier de configuration JSON")
	serverURL := flag.String("server", "", "URL de base de l'API MAPT (ex: http://localhost:8000/api/v1)")
	showVersion := flag.Bool("version", false, "Affiche la version de l'agent")

	flag.Parse()

	if *showVersion {
		fmt.Println("MAPT Windows Agent v1.0.0 (Go)")
		os.Exit(0)
	}

	fmt.Println("==================================================")
	fmt.Println("   MAPT Agent - Client d'administration de parc   ")
	fmt.Println("==================================================")

	service.RunStandalone(*configPath, *serverURL)
}
