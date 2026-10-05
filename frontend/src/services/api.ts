import axios from 'axios';
import {
  User, Device, DeviceInventory, DeviceGroup, DeviceActionHistory,
  Package, PackageVersion, Script, ScriptVersion,
  Deployment, DeploymentTarget, JobLog, AuditLog, WolResult
} from '../types';

const API_BASE_URL = '/api/v1';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('mapt_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('mapt_token');
      localStorage.removeItem('mapt_user');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export const api = {
  // Auth & Profile
  login: async (username: string, password: string) => {
    const res = await apiClient.post('/auth/login', { username, password });
    return res.data;
  },
  getMe: async (): Promise<User> => {
    const res = await apiClient.get('/auth/me');
    return res.data;
  },
  updateProfile: async (data: { email?: string }): Promise<User> => {
    const res = await apiClient.put('/auth/profile', data);
    return res.data;
  },
  changePassword: async (current_password: string, new_password: string): Promise<{ message: string }> => {
    const res = await apiClient.post('/auth/change-password', { current_password, new_password });
    return res.data;
  },
  getEnrollmentToken: async (): Promise<{ enrollment_token: string }> => {
    const res = await apiClient.get('/auth/enrollment-token');
    return res.data;
  },

  // Users Management (Admin / Super Admin)
  getUsers: async (): Promise<User[]> => {
    const res = await apiClient.get('/auth/users');
    return res.data;
  },
  getUser: async (id: string): Promise<User> => {
    const res = await apiClient.get(`/auth/users/${id}`);
    return res.data;
  },
  createUser: async (data: { username: string; password: string; email?: string; role?: string }): Promise<User> => {
    const res = await apiClient.post('/auth/users', data);
    return res.data;
  },
  updateUser: async (id: string, data: { username?: string; email?: string; password?: string; role?: string; is_active?: boolean }): Promise<User> => {
    const res = await apiClient.put(`/auth/users/${id}`, data);
    return res.data;
  },
  deleteUser: async (id: string): Promise<{ message: string }> => {
    const res = await apiClient.delete(`/auth/users/${id}`);
    return res.data;
  },

  // Devices
  getDevices: async (): Promise<Device[]> => {
    const res = await apiClient.get('/admin/devices');
    return res.data;
  },
  getDevice: async (id: string): Promise<Device> => {
    const res = await apiClient.get(`/admin/devices/${id}`);
    return res.data;
  },
  getDeviceInventory: async (id: string): Promise<DeviceInventory | null> => {
    const res = await apiClient.get(`/admin/devices/${id}/inventory`);
    return res.data;
  },
  getDeviceActions: async (id: string): Promise<DeviceActionHistory[]> => {
    const res = await apiClient.get(`/admin/devices/${id}/actions`);
    return res.data;
  },
  clearDeviceActions: async (id: string): Promise<{ success: boolean; count: number; message: string }> => {
    const res = await apiClient.delete(`/admin/devices/${id}/actions`);
    return res.data;
  },
  deleteDeviceAction: async (id: string, targetId: string): Promise<{ success: boolean; count: number; message: string }> => {
    const res = await apiClient.delete(`/admin/devices/${id}/actions/${targetId}`);
    return res.data;
  },
  enableDevice: async (id: string): Promise<Device> => {
    const res = await apiClient.post(`/admin/devices/${id}/enable`);
    return res.data;
  },
  disableDevice: async (id: string): Promise<Device> => {
    const res = await apiClient.post(`/admin/devices/${id}/disable`);
    return res.data;
  },
  approveDevice: async (id: string): Promise<Device> => {
    const res = await apiClient.post(`/admin/devices/${id}/approve`);
    return res.data;
  },
  unapproveDevice: async (id: string): Promise<Device> => {
    const res = await apiClient.post(`/admin/devices/${id}/unapprove`);
    return res.data;
  },
  approveDevicesBatch: async (deviceIds: string[]): Promise<{ status: string; count: number; message: string }> => {
    const res = await apiClient.post('/admin/devices/batch-approve', {
      device_ids: deviceIds
    });
    return res.data;
  },
  deleteDevice: async (id: string, uninstallAgent: boolean = true) => {
    const res = await apiClient.delete(`/admin/devices/${id}`, {
      params: { uninstall_agent: uninstallAgent }
    });
    return res.data;
  },
  deleteDevicesBatch: async (deviceIds: string[], uninstallAgent: boolean = true): Promise<{ status: string; count: number; message: string }> => {
    const res = await apiClient.post('/admin/devices/batch-delete', {
      device_ids: deviceIds,
      uninstall_agent: uninstallAgent
    });
    return res.data;
  },
  wakeDevice: async (id: string, broadcastIp?: string, port?: number): Promise<WolResult> => {
    const res = await apiClient.post(`/admin/devices/${id}/wol`, {
      broadcast_ip: broadcastIp,
      port: port
    });
    return res.data;
  },
  wakeDevices: async (deviceIds: string[], broadcastIp?: string, port?: number): Promise<WolResult[]> => {
    const res = await apiClient.post('/admin/devices/wol/batch', {
      device_ids: deviceIds,
      broadcast_ip: broadcastIp,
      port: port
    });
    return res.data;
  },
  sendCustomWol: async (macAddress: string, broadcastIp?: string, port?: number): Promise<WolResult> => {
    const res = await apiClient.post('/admin/devices/wol/custom', {
      mac_address: macAddress,
      broadcast_ip: broadcastIp,
      port: port
    });
    return res.data;
  },

  // Groups
  getGroups: async (): Promise<DeviceGroup[]> => {
    const res = await apiClient.get('/admin/groups');
    return res.data;
  },
  wakeGroup: async (groupId: string, broadcastIp?: string, port?: number): Promise<WolResult[]> => {
    const res = await apiClient.post(`/admin/groups/${groupId}/wol`, {
      broadcast_ip: broadcastIp,
      port: port
    });
    return res.data;
  },
  createGroup: async (name: string, description?: string, operator_ids?: string[]): Promise<DeviceGroup> => {
    const res = await apiClient.post('/admin/groups', { name, description, operator_ids });
    return res.data;
  },
  updateGroup: async (id: string, name: string, description?: string, operator_ids?: string[]): Promise<DeviceGroup> => {
    const res = await apiClient.put(`/admin/groups/${id}`, { name, description, operator_ids });
    return res.data;
  },
  deleteGroup: async (id: string) => {
    const res = await apiClient.delete(`/admin/groups/${id}`);
    return res.data;
  },
  addDevicesToGroup: async (groupId: string, deviceIds: string[]) => {
    const res = await apiClient.post(`/admin/groups/${groupId}/devices`, { device_ids: deviceIds });
    return res.data;
  },
  setGroupDevices: async (groupId: string, deviceIds: string[]) => {
    const res = await apiClient.put(`/admin/groups/${groupId}/devices`, { device_ids: deviceIds });
    return res.data;
  },
  removeDeviceFromGroup: async (groupId: string, deviceId: string) => {
    const res = await apiClient.delete(`/admin/groups/${groupId}/devices/${deviceId}`);
    return res.data;
  },

  // Packages
  getPackages: async (): Promise<Package[]> => {
    const res = await apiClient.get('/admin/packages');
    return res.data;
  },
  getPackage: async (id: string): Promise<Package> => {
    const res = await apiClient.get(`/admin/packages/${id}`);
    return res.data;
  },
  createPackage: async (data: { name: string; description?: string; package_type: string }): Promise<Package> => {
    const res = await apiClient.post('/admin/packages', data);
    return res.data;
  },
  createPackageWithFile: async (
    formData: FormData,
    onProgress?: (percent: number, loaded: number, total: number) => void
  ): Promise<Package> => {
    const res = await apiClient.post('/admin/packages/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (progressEvent) => {
        if (progressEvent.total && onProgress) {
          const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(percent, progressEvent.loaded, progressEvent.total);
        }
      },
    });
    return res.data;
  },
  getPackageVersions: async (id: string): Promise<PackageVersion[]> => {
    const res = await apiClient.get(`/admin/packages/${id}/versions`);
    return res.data;
  },
  uploadPackageVersion: async (
    packageId: string,
    formData: FormData,
    onProgress?: (percent: number, loaded: number, total: number) => void
  ): Promise<PackageVersion> => {
    const res = await apiClient.post(`/admin/packages/${packageId}/versions`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (progressEvent) => {
        if (progressEvent.total && onProgress) {
          const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(percent, progressEvent.loaded, progressEvent.total);
        }
      },
    });
    return res.data;
  },
  updatePackage: async (id: string, data: { name?: string; description?: string; package_type?: string }): Promise<Package> => {
    const res = await apiClient.put(`/admin/packages/${id}`, data);
    return res.data;
  },
  updatePackageVersion: async (packageId: string, versionId: string, data: {
    run_with?: string;
    run_with_args?: string;
    package_args?: string;
    run_as_admin?: boolean;
    is_interactive?: boolean;
    destination_folder?: string;
    install_command?: string;
    uninstall_command?: string;
  }): Promise<PackageVersion> => {
    const res = await apiClient.put(`/admin/packages/${packageId}/versions/${versionId}`, data);
    return res.data;
  },
  deletePackage: async (id: string) => {
    const res = await apiClient.delete(`/admin/packages/${id}`);
    return res.data;
  },
  exportPackage: async (packageId: string, versionId?: string): Promise<{ blob: Blob; filename: string }> => {
    const res = await apiClient.get(`/admin/packages/${packageId}/export`, {
      params: versionId ? { version_id: versionId } : undefined,
      responseType: 'blob',
    });
    let filename = `mapt_package_${packageId}.zip`;
    const disposition = res.headers['content-disposition'];
    if (disposition) {
      const match = disposition.match(/filename="?([^";]+)"?/);
      if (match && match[1]) {
        filename = match[1];
      }
    }
    return { blob: res.data, filename };
  },
  inspectPackageZip: async (file: File): Promise<any> => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await apiClient.post('/admin/packages/inspect-zip', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },
  importPackageZip: async (
    formData: FormData,
    onProgress?: (percent: number, loaded: number, total: number) => void
  ): Promise<Package> => {
    const res = await apiClient.post('/admin/packages/import-zip', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (progressEvent) => {
        if (progressEvent.total && onProgress) {
          const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(percent, progressEvent.loaded, progressEvent.total);
        }
      },
    });
    return res.data;
  },

  // Scripts
  getScripts: async (): Promise<Script[]> => {
    const res = await apiClient.get('/admin/scripts');
    return res.data;
  },
  getScript: async (id: string): Promise<Script> => {
    const res = await apiClient.get(`/admin/scripts/${id}`);
    return res.data;
  },
  createScript: async (data: { name: string; description?: string; language: string; initial_content: string; timeout_seconds: number }): Promise<Script> => {
    const res = await apiClient.post('/admin/scripts', data);
    return res.data;
  },
  getScriptVersions: async (id: string): Promise<ScriptVersion[]> => {
    const res = await apiClient.get(`/admin/scripts/${id}/versions`);
    return res.data;
  },
  addScriptVersion: async (scriptId: string, data: { content: string; timeout_seconds: number }): Promise<ScriptVersion> => {
    const res = await apiClient.post(`/admin/scripts/${scriptId}/versions`, data);
    return res.data;
  },
  deleteScript: async (id: string) => {
    const res = await apiClient.delete(`/admin/scripts/${id}`);
    return res.data;
  },

  // Deployments
  getDeployments: async (): Promise<Deployment[]> => {
    const res = await apiClient.get('/admin/deployments');
    return res.data;
  },
  getDeployment: async (id: string): Promise<Deployment> => {
    const res = await apiClient.get(`/admin/deployments/${id}`);
    return res.data;
  },
  getDeploymentTargets: async (id: string): Promise<DeploymentTarget[]> => {
    const res = await apiClient.get(`/admin/deployments/${id}/targets`);
    return res.data;
  },
  createDeployment: async (data: any): Promise<Deployment> => {
    const res = await apiClient.post('/admin/deployments', data);
    return res.data;
  },
  cancelDeployment: async (id: string): Promise<Deployment> => {
    const res = await apiClient.post(`/admin/deployments/${id}/cancel`);
    return res.data;
  },
  cancelDeploymentTarget: async (deploymentId: string, targetId: string): Promise<DeploymentTarget> => {
    const res = await apiClient.post(`/admin/deployments/${deploymentId}/targets/${targetId}/cancel`);
    return res.data;
  },
  deleteDeployment: async (id: string): Promise<{ success: boolean; count: number; message: string }> => {
    const res = await apiClient.delete(`/admin/deployments/${id}`);
    return res.data;
  },
  clearFinishedDeployments: async (): Promise<{ success: boolean; count: number; message: string }> => {
    const res = await apiClient.delete('/admin/deployments/clear-finished');
    return res.data;
  },
  bulkDeleteDeployments: async (deploymentIds: string[]): Promise<{ success: boolean; count: number; message: string }> => {
    const res = await apiClient.post('/admin/deployments/bulk-delete', { deployment_ids: deploymentIds });
    return res.data;
  },
  retryDeploymentTarget: async (deploymentId: string, targetId: string): Promise<DeploymentTarget> => {
    const res = await apiClient.post(`/admin/deployments/${deploymentId}/targets/${targetId}/retry`);
    return res.data;
  },
  getTargetLogs: async (deploymentId: string, targetId: string): Promise<JobLog[]> => {
    const res = await apiClient.get(`/admin/deployments/${deploymentId}/targets/${targetId}/logs`);
    return res.data;
  },

  // Audit
  getAuditLogs: async (): Promise<AuditLog[]> => {
    const res = await apiClient.get('/admin/audit');
    return res.data;
  },
  exportAuditLogs: async (): Promise<Blob> => {
    const res = await apiClient.get('/admin/audit/export', { responseType: 'blob' });
    return res.data;
  },
  clearAuditLogs: async (): Promise<{ success: boolean; count: number; message: string }> => {
    const res = await apiClient.delete('/admin/audit/clear');
    return res.data;
  },
  bulkDeleteAuditLogs: async (logIds: string[]): Promise<{ success: boolean; count: number; message: string }> => {
    const res = await apiClient.post('/admin/audit/bulk-delete', { log_ids: logIds });
    return res.data;
  },
  deleteAuditLog: async (logId: string): Promise<{ success: boolean; count: number; message: string }> => {
    const res = await apiClient.delete(`/admin/audit/${logId}`);
    return res.data;
  }
};
