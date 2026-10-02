export interface User {
  id: string;
  username: string;
  email: string;
  role: 'super_admin' | 'administrator' | 'operator' | 'viewer';
  is_active: boolean;
  last_login_at?: string;
}

export interface Device {
  id: string;
  device_uuid: string;
  hostname: string;
  os_name: string;
  os_version?: string;
  os_build?: string;
  agent_version?: string;
  ip_address?: string;
  mac_address?: string;
  mac_addresses?: string[];
  enabled: boolean;
  is_approved?: boolean;
  is_online: boolean;
  last_seen_at?: string;
  created_at: string;
  updated_at: string;
  group_ids: string[];
}

export interface LocalUser {
  name: string;
  domain?: string;
  account_type?: 'Domaine' | 'Local' | string;
  full_name?: string;
  description?: string;
  enabled: boolean;
  privilege: string;
  is_admin: boolean;
  is_logged_in?: boolean;
  last_logon?: string | null;
}

export interface InstalledSoftware {
  name: string;
  version?: string;
  publisher?: string;
  install_date?: string;
  uninstall_string?: string;
  quiet_uninstall_string?: string;
  pschildname?: string;
  windows_installer?: boolean;
  install_location?: string;
}

export interface NetworkInterface {
  name: string;
  description?: string;
  mac: string;
  ip_addresses?: string[];
  ipv6_addresses?: string[];
  primary_ip?: string;
  subnet_masks?: string[];
  default_gateways?: string[] | string;
  dns_servers?: string[];
  dhcp_enabled?: boolean;
  status?: 'Connected' | 'Active' | 'Disconnected' | string;
  is_physical?: boolean;
  flags?: string;
}

export interface DeviceInventory {
  device_id: string;
  cpu_model?: string;
  cpu_cores?: number;
  total_memory_mb?: number;
  disk_total_gb?: number;
  disk_free_gb?: number;
  mac_addresses?: string[];
  network_interfaces?: NetworkInterface[];
  current_user?: string;
  last_boot_at?: string;
  installed_software?: InstalledSoftware[];
  local_users?: LocalUser[];
  updated_at: string;
}

export interface DeviceActionHistory {
  id: string;
  deployment_id?: string | null;
  deployment_name: string;
  deployment_type: string;
  custom_command?: string;
  status: string;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  exit_code?: number;
  error_message?: string;
}

export interface GroupOperator {
  id: string;
  username: string;
  email?: string;
  role: string;
}

export interface DeviceGroup {
  id: string;
  name: string;
  description?: string;
  device_count: number;
  device_ids?: string[];
  operator_ids?: string[];
  operators?: GroupOperator[];
  created_at: string;
}

export interface PackageVersion {
  id: string;
  package_id: string;
  version: string;
  filename: string;
  storage_key: string;
  sha256: string;
  size_bytes: number;
  run_with?: string;
  run_with_args?: string;
  package_args?: string;
  run_as_admin?: boolean;
  is_interactive?: boolean;
  destination_folder?: string;
  install_command?: string;
  uninstall_command?: string;
  created_at: string;
}

export interface Package {
  id: string;
  name: string;
  description?: string;
  package_type: string;
  created_by?: string;
  created_at: string;
  archived: boolean;
  latest_version?: PackageVersion;
  version_count: number;
}

export interface ScriptVersion {
  id: string;
  script_id: string;
  version: number;
  content: string;
  sha256: string;
  timeout_seconds: number;
  created_by?: string;
  created_at: string;
}

export interface Script {
  id: string;
  name: string;
  description?: string;
  language: string;
  created_by?: string;
  created_at: string;
  archived: boolean;
  latest_version?: ScriptVersion;
  version_count: number;
}

export interface DeploymentTarget {
  id: string;
  deployment_id: string;
  device_id: string;
  device_hostname?: string;
  device_ip?: string;
  status: 'PENDING' | 'OFFERED' | 'ACKED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'TIMED_OUT' | 'CANCELLED';
  retry_count: number;
  max_retries: number;
  created_at: string;
  offered_at?: string;
  acknowledged_at?: string;
  started_at?: string;
  completed_at?: string;
  exit_code?: number;
  error_message?: string;
}

export interface Deployment {
  id: string;
  name: string;
  description?: string;
  deployment_type: 'package' | 'script' | 'command';
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'CANCELLED';
  package_version_id?: string;
  script_version_id?: string;
  custom_command?: string;
  created_by?: string;
  wake_on_lan?: boolean;
  max_concurrency?: number;
  
  // Scheduling & Recurrence
  is_recurring?: boolean;
  schedule_type?: 'immediate' | 'once' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'cron';
  scheduled_at?: string;
  scheduled_time?: string;
  scheduled_days_of_week?: string;
  interval_value?: number;
  interval_unit?: string;
  cron_expression?: string;
  next_run_at?: string;
  last_run_at?: string;
  end_at?: string;
  target_all_devices?: boolean;
  target_device_ids?: string[];
  target_group_ids?: string[];

  created_at: string;
  started_at?: string;
  completed_at?: string;
  total_targets: number;
  succeeded_targets: number;
  failed_targets: number;
  running_targets: number;
  pending_targets: number;
}

export interface JobLog {
  id: string;
  timestamp: string;
  level: 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR';
  message: string;
}

export interface AuditLog {
  id: string;
  user_id?: string;
  user_username?: string;
  action: string;
  entity_type: string;
  entity_id?: string;
  details?: any;
  ip_address?: string;
  created_at: string;
}

export interface WolResult {
  device_id?: string;
  mac_address: string;
  broadcast_ip: string;
  port: number;
  success: boolean;
  message: string;
}
