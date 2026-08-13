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
import PolicyCenter from './pages/PolicyCenter';
import { FeatureFlagsProvider, useFeatureFlags } from './lib/featureFlags';
import type { FeatureFlagKey } from './lib/featureFlags';

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

function WorkerGuard({ children }: { children: ReactNode }) {
  const { profile } = useAuth();

  if (profile?.category === 'worker') {
    return <Navigate to="/performance" replace />;
  }

  return <>{children}</>;
}

function ProtectedPage({
  children,
  allowedRoles,
  workerAllowed = false,
}: {
  children: ReactNode;
  allowedRoles?: Role[];
  workerAllowed?: boolean;
}) {
  return (
    <ProtectedRoute>
      <Layout>
        <RoleGate allowedRoles={allowedRoles}>
          {workerAllowed ? <>{children}</> : <WorkerGuard>{children}</WorkerGuard>}
        </RoleGate>
      </Layout>
    </ProtectedRoute>
  );
}

function FeatureGate({
  children,
  feature,
}: {
  children: ReactNode;
  feature: FeatureFlagKey | FeatureFlagKey[];
}) {
  const { isEnabled } = useFeatureFlags();

  if (!isEnabled(feature)) {
    return (
      <div className="glass rounded-2xl p-8 max-w-2xl mx-auto text-center">
        <h1 className="font-display text-2xl font-bold">Feature disabled</h1>
        <p className="text-muted mt-2">
          This feature has been disabled by your administrator.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}

function App() {
  return (
    <AuthProvider>
      <FeatureFlagsProvider>
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
              <ProtectedPage workerAllowed>
                <Profile />
              </ProtectedPage>
            }
          />

          <Route
            path="/settings"
            element={
              <ProtectedPage workerAllowed>
                <Settings />
              </ProtectedPage>
            }
          />

          <Route
            path="/employees"
            element={
              <ProtectedPage allowedRoles={['admin', 'manager']}>
                <FeatureGate feature="employees">
                  <Employees />
                </FeatureGate>
              </ProtectedPage>
            }
          />

          <Route
            path="/profile-updates"
            element={
              <ProtectedPage>
                <FeatureGate feature="profile_updates">
                  <ProfileUpdates />
                </FeatureGate>
              </ProtectedPage>
            }
          />

          <Route
            path="/announcements"
            element={
              <ProtectedPage>
                <FeatureGate feature="announcements">
                  <Announcements />
                </FeatureGate>
              </ProtectedPage>
            }
          />

          <Route
            path="/hr-letters"
            element={
              <ProtectedPage allowedRoles={['admin', 'manager']}>
                <FeatureGate feature="hr_letters">
                  <HrLetters />
                </FeatureGate>
              </ProtectedPage>
            }
          />

          <Route
            path="/performance"
            element={
              <ProtectedPage workerAllowed>
                <FeatureGate feature="performance">
                  <Performance />
                </FeatureGate>
              </ProtectedPage>
            }
          />

          <Route
            path="/monthly-reports"
            element={
              <ProtectedPage allowedRoles={['admin', 'manager']}>
                <FeatureGate feature="monthly_reports">
                  <MonthlyReports />
                </FeatureGate>
              </ProtectedPage>
            }
          />

          <Route
            path="/backup"
            element={
              <ProtectedPage allowedRoles={['admin']}>
                <FeatureGate feature="backup">
                  <BackupCenter />
                </FeatureGate>
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
                <FeatureGate feature="system_health">
                  <SystemHealth />
                </FeatureGate>
              </ProtectedPage>
            }
          />

          <Route
            path="/policy-center"
            element={
              <ProtectedPage allowedRoles={['admin']}>
                <FeatureGate feature="policy_center">
                  <PolicyCenter />
                </FeatureGate>
              </ProtectedPage>
            }
          />

          <Route
            path="/attendance"
            element={
              <ProtectedPage>
                <FeatureGate feature="attendance">
                  <Attendance />
                </FeatureGate>
              </ProtectedPage>
            }
          />

          <Route
            path="/leave"
            element={
              <ProtectedPage>
                <FeatureGate feature={['leave_request', 'leave_approval']}>
                  <Leave />
                </FeatureGate>
              </ProtectedPage>
            }
          />

          <Route
            path="/payroll"
            element={
              <ProtectedPage>
                <FeatureGate feature="payroll">
                  <Payroll />
                </FeatureGate>
              </ProtectedPage>
            }
          />

          <Route
            path="/claims"
            element={
              <ProtectedPage>
                <FeatureGate feature={['claims_request', 'claims_approval']}>
                  <Claims />
                </FeatureGate>
              </ProtectedPage>
            }
          />

          <Route
            path="/org-chart"
            element={
              <ProtectedPage>
                <FeatureGate feature="org_chart">
                  <OrgChart />
                </FeatureGate>
              </ProtectedPage>
            }
          />

          <Route
            path="/audit-logs"
            element={
              <ProtectedPage allowedRoles={['admin']}>
                <FeatureGate feature="audit_logs">
                  <AuditLogs />
                </FeatureGate>
              </ProtectedPage>
            }
          />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </BrowserRouter>
      </FeatureFlagsProvider>
    </AuthProvider>
  );
}

export default App;