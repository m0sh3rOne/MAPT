import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Layout } from './components/layout/Layout';
import { Login } from './pages/Login/Login';
import { Dashboard } from './pages/Dashboard/Dashboard';
import { Devices } from './pages/Devices/Devices';
import { DeviceDetail } from './pages/Devices/DeviceDetail';
import { Deployments } from './pages/Deployments/Deployments';
import { DeploymentDetail } from './pages/Deployments/DeploymentDetail';
import { Packages } from './pages/Packages/Packages';
import { Scripts } from './pages/Scripts/Scripts';
import { Groups } from './pages/Groups/Groups';
import { Audit } from './pages/Audit/Audit';
import { Users } from './pages/Users/Users';
import { McpServer } from './pages/McpServer/McpServer';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { token, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">
        Chargement de la session...
      </div>
    );
  }

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

export const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />

            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Dashboard />} />
              <Route path="devices" element={<Devices />} />
              <Route path="devices/:id" element={<DeviceDetail />} />
              <Route path="deployments" element={<Deployments />} />
              <Route path="deployments/:id" element={<DeploymentDetail />} />
              <Route path="packages" element={<Packages />} />
              <Route path="scripts" element={<Scripts />} />
              <Route path="groups" element={<Groups />} />
              <Route path="audit" element={<Audit />} />
              <Route path="users" element={<Users />} />
              <Route path="mcp-server" element={<McpServer />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
};
