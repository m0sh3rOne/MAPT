package inventory

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"net"
	"os"
	"os/exec"
	"os/user"
	"runtime"
	"strings"
	"time"
	"unicode/utf16"
)

type InventoryData struct {
	WINSName          string                   `json:"wins_name,omitempty"`
	OSCaption         string                   `json:"os_caption,omitempty"`
	OSDisplayVersion  string                   `json:"os_display_version,omitempty"`
	OSBuild           string                   `json:"os_build,omitempty"`
	OSArchitecture    string                   `json:"os_architecture,omitempty"`
	CPUModel          string                   `json:"cpu_model"`
	CPUCores          int                      `json:"cpu_cores"`
	TotalMemoryMB     int                      `json:"total_memory_mb"`
	DiskTotalGB       float64                  `json:"disk_total_gb"`
	DiskFreeGB        float64                  `json:"disk_free_gb"`
	MACAddresses      []string                 `json:"mac_addresses"`
	NetworkInterfaces []map[string]interface{} `json:"network_interfaces"`
	CurrentUser       string                   `json:"current_user"`
	LastBootAt        *time.Time               `json:"last_boot_at,omitempty"`
	InstalledSoftware []map[string]interface{} `json:"installed_software,omitempty"`
	LocalUsers        []map[string]interface{} `json:"local_users,omitempty"`
}

func CollectInventory() *InventoryData {
	data := &InventoryData{
		CPUModel:          runtime.GOARCH + " " + runtime.Compiler,
		CPUCores:          runtime.NumCPU(),
		TotalMemoryMB:     8192,
		DiskTotalGB:       500.0,
		DiskFreeGB:        250.0,
		MACAddresses:      make([]string, 0),
		NetworkInterfaces: make([]map[string]interface{}, 0),
		CurrentUser:       "",
		InstalledSoftware: make([]map[string]interface{}, 0),
		LocalUsers:        make([]map[string]interface{}, 0),
	}

	// Current User
	if u, err := user.Current(); err == nil {
		data.CurrentUser = u.Username
	} else if uEnv := os.Getenv("USERNAME"); uEnv != "" {
		data.CurrentUser = uEnv
	}

	// NetBIOS / WINS computer name
	wins := os.Getenv("COMPUTERNAME")
	if wins == "" {
		wins, _ = os.Hostname()
	}
	data.WINSName = strings.ToUpper(strings.TrimSpace(wins))

	// Default fallback for Network interfaces & MACs using Go net package
	if ifaces, err := net.Interfaces(); err == nil {
		for _, iface := range ifaces {
			mac := iface.HardwareAddr.String()
			if mac != "" {
				data.MACAddresses = append(data.MACAddresses, mac)
			}
			addrs, _ := iface.Addrs()
			ipList := make([]string, 0)
			for _, addr := range addrs {
				ipList = append(ipList, addr.String())
			}
			data.NetworkInterfaces = append(data.NetworkInterfaces, map[string]interface{}{
				"name":         iface.Name,
				"mac":          mac,
				"ip_addresses": ipList,
				"primary_ip":   func() string { if len(ipList) > 0 { return ipList[0] }; return "" }(),
				"flags":        iface.Flags.String(),
			})
		}
	}

	// Baseline OS info from fast registry / OS detection
	cap, dispVer, bld, arch := GetOSInfo()
	data.OSCaption = cap
	data.OSDisplayVersion = dispVer
	data.OSBuild = bld
	data.OSArchitecture = arch

	// Windows advanced collection
	if runtime.GOOS == "windows" {
		collectWindowsAdvanced(data)
	}

	return data
}

func collectWindowsAdvanced(data *InventoryData) {
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	psScript := `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8;
$OutputEncoding = [System.Text.Encoding]::UTF8;
$res = @{}
try {
    $cs = Get-CimInstance Win32_ComputerSystem -ErrorAction SilentlyContinue
    $proc = Get-CimInstance Win32_Processor -ErrorAction SilentlyContinue | Select-Object -First 1
    $os = Get-CimInstance Win32_OperatingSystem -ErrorAction SilentlyContinue
    $drive = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'" -ErrorAction SilentlyContinue
    $regNt = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion' -ErrorAction SilentlyContinue

    $activeUser = if ($cs.UserName) { $cs.UserName } else { "" }
    if ($activeUser) { $res['current_user'] = $activeUser }
    if ($proc) { $res['cpu_model'] = $proc.Name }
    if ($cs.TotalPhysicalMemory) { $res['total_memory_mb'] = [int]($cs.TotalPhysicalMemory / 1MB) }
    if ($drive) {
        $res['disk_total_gb'] = [math]::Round($drive.Size / 1GB, 1)
        $res['disk_free_gb'] = [math]::Round($drive.FreeSpace / 1GB, 1)
    }
    if ($os.LastBootUpTime) {
        $res['last_boot_at'] = $os.LastBootUpTime.ToString('o')
    }

    # Détails complets du système d'exploitation (winver)
    $dispVer = if ($regNt.DisplayVersion) { $regNt.DisplayVersion } elseif ($regNt.ReleaseId) { $regNt.ReleaseId } else { "" }
    $ubr = if ($regNt.UBR) { $regNt.UBR } else { "" }
    $bNum = if ($os.BuildNumber) { $os.BuildNumber } else { $regNt.CurrentBuild }
    $fullBuild = if ($ubr) { "$bNum.$ubr" } else { "$bNum" }
    $caption = if ($os.Caption) { $os.Caption.Replace("Microsoft ", "").Trim() } else { "Windows" }
    $arch = if ($os.OSArchitecture) { $os.OSArchitecture } else { "64-bit" }

    if ($caption) { $res['os_caption'] = $caption }
    if ($dispVer) { $res['os_display_version'] = $dispVer }
    if ($fullBuild) { $res['os_build'] = $fullBuild }
    if ($arch) { $res['os_architecture'] = $arch }

    $wins = if ($env:COMPUTERNAME) { $env:COMPUTERNAME } else { (Get-CimInstance Win32_ComputerSystem -ErrorAction SilentlyContinue).Name }
    if ($wins) { $res['wins_name'] = $wins.Trim().ToUpper() }
} catch {}

try {
    $adminMembers = @()
    $adminGroup = Get-LocalGroupMember -Group "Administrateurs" -ErrorAction SilentlyContinue
    if (-not $adminGroup) {
        $adminGroup = Get-LocalGroupMember -Group "Administrators" -ErrorAction SilentlyContinue
    }
    if ($adminGroup) {
        $adminMembers = $adminGroup | ForEach-Object { $_.Name.Split('\')[-1] }
    }

    $computerName = $env:COMPUTERNAME
    $userDict = @{}

    # 1. Comptes locaux SAM (Get-LocalUser)
    try {
        Get-LocalUser -ErrorAction SilentlyContinue | ForEach-Object {
            $isAdm = $adminMembers -contains $_.Name
            $isLogged = $activeUser -and ($activeUser.Split('\')[-1] -ieq $_.Name)
            $userDict[$_.Name.ToLower()] = [PSCustomObject]@{
                name = $_.Name
                domain = $computerName
                account_type = 'Local'
                full_name = $_.FullName
                description = $_.Description
                enabled = [bool]$_.Enabled
                privilege = if ($isAdm) { 'Administrateur' } else { 'Utilisateur standard' }
                is_admin = $isAdm
                is_logged_in = [bool]$isLogged
                last_logon = if ($_.LastLogon) { $_.LastLogon.ToString('o') } else { $null }
            }
        }
    } catch {}

    # 2. Profils utilisateurs de la machine (inclus comptes de Domaine / Active Directory)
    try {
        Get-CimInstance Win32_UserProfile -ErrorAction SilentlyContinue | Where-Object { -not $_.Special -and $_.LocalPath -notmatch 'defaultuser0|ServiceProfiles' } | ForEach-Object {
            $sid = $_.SID
            $ntAccount = ""
            try {
                $ntAccount = (New-Object System.Security.Principal.SecurityIdentifier($sid)).Translate([System.Security.Principal.NTAccount]).Value
            } catch {
                $ntAccount = Split-Path $_.LocalPath -Leaf
            }

            $dom = ""
            $uname = $ntAccount
            if ($ntAccount -match '\\') {
                $parts = $ntAccount.Split('\')
                $dom = $parts[0]
                $uname = $parts[1]
            }

            $isDomain = $dom -and ($dom -inotmatch "^$computerName$" -and $dom -inotmatch "^BUILTIN$" -and $dom -inotmatch "^NT AUTHORITY$")
            $accountType = if ($isDomain) { 'Domaine' } else { 'Local' }
            $isAdm = $adminMembers -contains $uname -or $adminMembers -contains $ntAccount
            $isLogged = [bool]$_.Loaded -or ($activeUser -and ($activeUser -ieq $ntAccount -or $activeUser.Split('\')[-1] -ieq $uname))

            $lastLogonStr = if ($_.LastUseTime) { $_.LastUseTime.ToString('o') } else { $null }
            $key = $uname.ToLower()

            if ($userDict.ContainsKey($key)) {
                if ($isLogged) { $userDict[$key].is_logged_in = $true }
                if ($isDomain) {
                    $userDict[$key].account_type = 'Domaine'
                    $userDict[$key].domain = $dom
                }
                if (-not $userDict[$key].last_logon -and $lastLogonStr) {
                    $userDict[$key].last_logon = $lastLogonStr
                }
            } else {
                $userDict[$key] = [PSCustomObject]@{
                    name = $uname
                    domain = if ($dom) { $dom } else { if ($isDomain) { 'Domaine' } else { $computerName } }
                    account_type = $accountType
                    full_name = if ($dom) { "$dom\$uname" } else { $uname }
                    description = "Profil utilisateur ($($_.LocalPath))"
                    enabled = $true
                    privilege = if ($isAdm) { 'Administrateur' } else { 'Utilisateur standard' }
                    is_admin = $isAdm
                    is_logged_in = [bool]$isLogged
                    last_logon = $lastLogonStr
                }
            }
        }
    } catch {}

    # 3. S'assurer que l'utilisateur ACTUELLEMENT CONNECTÉ est TOUJOURS présent et marqué 'is_logged_in = $true'
    if ($activeUser) {
        $actDom = ""
        $actUname = $activeUser
        if ($activeUser -match '\\') {
            $parts = $activeUser.Split('\')
            $actDom = $parts[0]
            $actUname = $parts[1]
        }
        $actKey = $actUname.ToLower()
        $isDomainUser = $actDom -and ($actDom -inotmatch "^$computerName$" -and $actDom -inotmatch "^BUILTIN$" -and $actDom -inotmatch "^NT AUTHORITY$")
        $actType = if ($isDomainUser) { 'Domaine' } else { 'Local' }
        $isAdm = $adminMembers -contains $actUname -or $adminMembers -contains $activeUser

        if ($userDict.ContainsKey($actKey)) {
            $userDict[$actKey].is_logged_in = $true
            if ($isDomainUser) {
                $userDict[$actKey].account_type = 'Domaine'
                $userDict[$actKey].domain = $actDom
            }
        } else {
            $userDict[$actKey] = [PSCustomObject]@{
                name = $actUname
                domain = if ($actDom) { $actDom } else { if ($isDomainUser) { 'Domaine' } else { $computerName } }
                account_type = $actType
                full_name = if ($actDom) { "$actDom\$actUname" } else { $actUname }
                description = "Utilisateur connecté en session active"
                enabled = $true
                privilege = if ($isAdm) { 'Administrateur' } else { 'Utilisateur standard' }
                is_admin = $isAdm
                is_logged_in = $true
                last_logon = (Get-Date).ToString('o')
            }
        }
    }

    $res['local_users'] = @($userDict.Values)
} catch {}

try {
    $sw = Get-ItemProperty HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*, HKLM:\Software\Wow6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*, HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\* -ErrorAction SilentlyContinue |
        Where-Object { $_.DisplayName -and $_.SystemComponent -ne 1 -and $_.ParentKeyName -eq $null } |
        Select-Object @{N='name';E={$_.DisplayName}}, @{N='version';E={$_.DisplayVersion}}, @{N='publisher';E={$_.Publisher}}, @{N='install_date';E={$_.InstallDate}}, @{N='uninstall_string';E={$_.UninstallString}}, @{N='quiet_uninstall_string';E={$_.QuietUninstallString}}, @{N='pschildname';E={$_.PSChildName}}, @{N='windows_installer';E={[bool]$_.WindowsInstaller}}, @{N='install_location';E={$_.InstallLocation}} |
        Sort-Object name -Unique
    $res['installed_software'] = @($sw)
} catch {}

try {
    $adapters = Get-CimInstance Win32_NetworkAdapter -ErrorAction SilentlyContinue | Where-Object { $_.PhysicalAdapter -or $_.MACAddress }
    $configs = Get-CimInstance Win32_NetworkAdapterConfiguration -ErrorAction SilentlyContinue

    $netList = foreach ($cfg in $configs) {
        if (-not $cfg.MACAddress) { continue }
        $adapter = $adapters | Where-Object { $_.Index -eq $cfg.Index } | Select-Object -First 1

        $ipv4List = @()
        $ipv6List = @()
        if ($cfg.IPAddress) {
            foreach ($ip in $cfg.IPAddress) {
                if ($ip -match '^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$') {
                    $ipv4List += $ip
                } elseif ($ip -match ':') {
                    $ipv6List += $ip
                }
            }
        }

        $isPhys = if ($adapter.PhysicalAdapter) { $true } else { $false }
        $hasGw = if ($cfg.DefaultIPGateway -and $cfg.DefaultIPGateway.Count -gt 0) { $true } else { $false }
        $hasIpv4 = if ($ipv4List.Count -gt 0 -and -not ($ipv4List[0].StartsWith('169.254.'))) { $true } else { $false }
        $isConn = ($adapter.NetConnectionStatus -eq 2) -or ($hasIpv4 -and $cfg.IPEnabled)
        $statusStr = if ($isConn) { 'Connected' } else { 'Disconnected' }

        [PSCustomObject]@{
            name = if ($adapter.NetConnectionID) { $adapter.NetConnectionID } else { $cfg.Description }
            description = $cfg.Description
            mac = $cfg.MACAddress
            ip_addresses = $ipv4List
            ipv6_addresses = $ipv6List
            primary_ip = if ($ipv4List.Count -gt 0) { $ipv4List[0] } else { $null }
            subnet_masks = if ($cfg.IPSubnet) { @($cfg.IPSubnet) } else { @() }
            default_gateways = if ($cfg.DefaultIPGateway) { @($cfg.DefaultIPGateway) } else { @() }
            dns_servers = if ($cfg.DNSServerSearchOrder) { @($cfg.DNSServerSearchOrder) } else { @() }
            dhcp_enabled = [bool]$cfg.DHCPEnabled
            status = $statusStr
            is_physical = [bool]$isPhys
            has_gateway = [bool]$hasGw
            is_connected = [bool]$isConn
        }
    }

    # Sort network interfaces so Connected interfaces with default gateway come FIRST!
    $sortedNet = $netList | Sort-Object @{Expression={
        if ($_.is_connected -and $_.has_gateway -and $_.is_physical) { 1 }
        elseif ($_.is_connected -and $_.has_gateway) { 2 }
        elseif ($_.is_connected -and $_.is_physical) { 3 }
        elseif ($_.is_connected) { 4 }
        elseif ($_.is_physical) { 5 }
        else { 6 }
    }}
    $res['network_interfaces'] = @($sortedNet)
} catch {}

$res | ConvertTo-Json -Depth 4 -Compress
`

	utf16Runes := utf16.Encode([]rune(psScript))
	utf16Bytes := make([]byte, len(utf16Runes)*2)
	for i, r := range utf16Runes {
		utf16Bytes[i*2] = byte(r)
		utf16Bytes[i*2+1] = byte(r >> 8)
	}
	encodedScript := base64.StdEncoding.EncodeToString(utf16Bytes)

	cmd := exec.CommandContext(ctx, "powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encodedScript)
	var out bytes.Buffer
	cmd.Stdout = &out
	if err := cmd.Run(); err != nil {
		return
	}

	var parsed struct {
		WINSName          string                   `json:"wins_name"`
		OSCaption         string                   `json:"os_caption"`
		OSDisplayVersion  string                   `json:"os_display_version"`
		OSBuild           string                   `json:"os_build"`
		OSArchitecture    string                   `json:"os_architecture"`
		CurrentUser       string                   `json:"current_user"`
		CPUModel          string                   `json:"cpu_model"`
		TotalMemoryMB     int                      `json:"total_memory_mb"`
		DiskTotalGB       float64                  `json:"disk_total_gb"`
		DiskFreeGB        float64                  `json:"disk_free_gb"`
		LastBootAt        string                   `json:"last_boot_at"`
		LocalUsers        []map[string]interface{} `json:"local_users"`
		InstalledSoftware []map[string]interface{} `json:"installed_software"`
		NetworkInterfaces []map[string]interface{} `json:"network_interfaces"`
	}

	if err := json.Unmarshal(out.Bytes(), &parsed); err == nil {
		if parsed.WINSName != "" {
			data.WINSName = parsed.WINSName
		}
		if parsed.OSCaption != "" {
			data.OSCaption = parsed.OSCaption
		}
		if parsed.OSDisplayVersion != "" {
			data.OSDisplayVersion = parsed.OSDisplayVersion
		}
		if parsed.OSBuild != "" {
			data.OSBuild = parsed.OSBuild
		}
		if parsed.OSArchitecture != "" {
			data.OSArchitecture = parsed.OSArchitecture
		}
		if parsed.CurrentUser != "" {
			data.CurrentUser = parsed.CurrentUser
		}
		if parsed.CPUModel != "" {
			data.CPUModel = parsed.CPUModel
		}
		if parsed.TotalMemoryMB > 0 {
			data.TotalMemoryMB = parsed.TotalMemoryMB
		}
		if parsed.DiskTotalGB > 0 {
			data.DiskTotalGB = parsed.DiskTotalGB
		}
		if parsed.DiskFreeGB >= 0 {
			data.DiskFreeGB = parsed.DiskFreeGB
		}
		if parsed.LastBootAt != "" {
			if t, err := time.Parse(time.RFC3339, parsed.LastBootAt); err == nil {
				data.LastBootAt = &t
			}
		}
		if len(parsed.LocalUsers) > 0 {
			data.LocalUsers = parsed.LocalUsers
		}
		if len(parsed.InstalledSoftware) > 0 {
			data.InstalledSoftware = parsed.InstalledSoftware
		}
		if len(parsed.NetworkInterfaces) > 0 {
			data.NetworkInterfaces = parsed.NetworkInterfaces
			// Sync sorted MACAddresses list (connected physical MACs first)
			macList := make([]string, 0)
			for _, netIface := range parsed.NetworkInterfaces {
				if m, ok := netIface["mac"].(string); ok && m != "" {
					macList = append(macList, m)
				}
			}
			if len(macList) > 0 {
				data.MACAddresses = macList
			}
		}
	}
}

func GetPrimaryIP() string {
	// Try connecting via UDP route lookup to common external hosts
	for _, target := range []string{"8.8.8.8:80", "1.1.1.1:80", "9.9.9.9:80"} {
		if conn, err := net.DialTimeout("udp", target, 800*time.Millisecond); err == nil {
			localAddr := conn.LocalAddr().(*net.UDPAddr)
			conn.Close()
			ipStr := localAddr.IP.String()
			if ipStr != "" && ipStr != "127.0.0.1" && !strings.HasPrefix(ipStr, "169.254.") {
				return ipStr
			}
		}
	}

	// Fallback: inspect network interfaces for the first non-loopback IPv4 address
	if ifaces, err := net.Interfaces(); err == nil {
		for _, iface := range ifaces {
			if iface.Flags&net.FlagUp == 0 || iface.Flags&net.FlagLoopback != 0 {
				continue
			}
			if addrs, err := iface.Addrs(); err == nil {
				for _, addr := range addrs {
					if ipNet, ok := addr.(*net.IPNet); ok && !ipNet.IP.IsLoopback() {
						if ip4 := ipNet.IP.To4(); ip4 != nil {
							ipStr := ip4.String()
							if !strings.HasPrefix(ipStr, "169.254.") {
								return ipStr
							}
						}
					}
				}
			}
		}
	}

	return "127.0.0.1"
}
