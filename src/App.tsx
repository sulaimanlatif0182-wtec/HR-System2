import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';

import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Employees from './pages/Employees';
import Attendance from './pages/Attendance';
import Leave from './pages/Leave';
import Payroll from './pages/Payroll';
import Claims from './pages/Claims';
import OrgChart from './pages/OrgChart';
import ResetPassword from './pages/ResetPassword';
import Profile from './pages/Profile';
import Settings from './pages/Settings';
import AuditLogs from './pages/AuditLogs';
import ProfileUpdates from './pages/ProfileUpdates';
import Announcements from './pages/Announcements';
import HrLetters from './pages/HrLetters';
import Performance from './pages/Performance';
import MonthlyReports from './pages/MonthlyReports';
import BackupCenter from './pages/BackupCenter';
import AdminConfig from './pages/AdminConfig';
import SystemHealth from './pages/SystemHealth';

type Role = 'admin' | 'manager' | 'employee';

function AccessDenied({ allowedRoles }: { allowedRoles: Role[] }) {
  return (
    <div className="glass rounded-2xl p-8 max-w-2xl mx-auto text-center">
      <h1 className="font-display text-2xl font-bold">Access restricted</h1>
      <p className="text-muted mt-2">
        This page is only available for: {allowedRoles.join(', ')}.
      </p>
      <p className="text-xs text-muted mt-3">
        If you believe this is wrong, please contact HR/Admin to check your role.
      </p>
    </div>
  );
}

function RoleGate({
  children,
  allowedRoles,
}: {
  children: ReactNode;
  allowedRoles?: Role[];
}) {
  const { profile } = useAuth();
  const role = (profile?.role || 'employee') as Role;

  if (!allowedRoles || allowedRoles.includes(role)) {
    return <>{children}</>;
  }

  return <AccessDenied allowedRoles={allowedRoles} />;
}

function ProtectedPage({
  children,
  allowedRoles,
}: {
  children: ReactNode;
  allowedRoles?: Role[];
}) {
  return (
    <ProtectedRoute>
      <Layout>
        <RoleGate allowedRoles={allowedRoles}>{children}</RoleGate>
      </Layout>
    </ProtectedRoute>
  );
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/reset-password" element={<ResetPassword />} />

          <Route
            path="/"
            element={
              <ProtectedPage>
                <Dashboard />
              </ProtectedPage>
            }
          />

          <Route
            path="/dashboard"
            element={
              <ProtectedPage>
                <Dashboard />
              </ProtectedPage>
            }
          />

          <Route
            path="/profile"
            element={
              <ProtectedPage>
                <Profile />
              </ProtectedPage>
            }
          />

          <Route
            path="/settings"
            element={
              <ProtectedPage>
                <Settings />
              </ProtectedPage>
            }
          />

          <Route
            path="/employees"
            element={
              <ProtectedPage allowedRoles={['admin', 'manager']}>
                <Employees />
              </ProtectedPage>
            }
          />

          <Route
            path="/profile-updates"
            element={
              <ProtectedPage>
                <ProfileUpdates />
              </ProtectedPage>
            }
          />

          <Route
            path="/announcements"
            element={
              <ProtectedPage>
                <Announcements />
              </ProtectedPage>
            }
          />

          <Route
            path="/hr-letters"
            element={
              <ProtectedPage allowedRoles={['admin', 'manager']}>
                <HrLetters />
              </ProtectedPage>
            }
          />

          <Route
            path="/performance"
            element={
              <ProtectedPage>
                <Performance />
              </ProtectedPage>
            }
          />

          <Route
            path="/monthly-reports"
            element={
              <ProtectedPage allowedRoles={['admin', 'manager']}>
                <MonthlyReports />
              </ProtectedPage>
            }
          />

          <Route
            path="/backup"
            element={
              <ProtectedPage allowedRoles={['admin']}>
                <BackupCenter />
              </ProtectedPage>
            }
          />

          <Route
            path="/admin-config"
            element={
              <ProtectedPage allowedRoles={['admin']}>
                <AdminConfig />
              </ProtectedPage>
            }
          />

          <Route
            path="/system-health"
            element={
              <ProtectedPage allowedRoles={['admin']}>
                <SystemHealth />
              </ProtectedPage>
            }
          />

          <Route
            path="/attendance"
            element={
              <ProtectedPage>
                <Attendance />
              </ProtectedPage>
            }
          />

          <Route
            path="/leave"
            element={
              <ProtectedPage>
                <Leave />
              </ProtectedPage>
            }
          />

          <Route
            path="/payroll"
            element={
              <ProtectedPage>
                <Payroll />
              </ProtectedPage>
            }
          />

          <Route
            path="/claims"
            element={
              <ProtectedPage>
                <Claims />
              </ProtectedPage>
            }
          />

          <Route
            path="/org-chart"
            element={
              <ProtectedPage>
                <OrgChart />
              </ProtectedPage>
            }
          />

          <Route
            path="/audit-logs"
            element={
              <ProtectedPage allowedRoles={['admin']}>
                <AuditLogs />
              </ProtectedPage>
            }
          />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;