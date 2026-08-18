import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import type { ReactNode } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';

const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Employees = lazy(() => import('./pages/Employees'));
const Attendance = lazy(() => import('./pages/Attendance'));
const Leave = lazy(() => import('./pages/Leave'));
const Payroll = lazy(() => import('./pages/Payroll'));
const Claims = lazy(() => import('./pages/Claims'));
const OrgChart = lazy(() => import('./pages/OrgChart'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const Profile = lazy(() => import('./pages/Profile'));
const Settings = lazy(() => import('./pages/Settings'));
const AuditLogs = lazy(() => import('./pages/AuditLogs'));
const ProfileUpdates = lazy(() => import('./pages/ProfileUpdates'));
const Announcements = lazy(() => import('./pages/Announcements'));
const HrLetters = lazy(() => import('./pages/HrLetters'));
const Performance = lazy(() => import('./pages/Performance'));
const MonthlyReports = lazy(() => import('./pages/MonthlyReports'));
const BackupCenter = lazy(() => import('./pages/BackupCenter'));
const AdminConfig = lazy(() => import('./pages/AdminConfig'));
const SystemHealth = lazy(() => import('./pages/SystemHealth'));
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

// Workers (kiosk login with employee ID) are intentionally limited to a small
// set of pages. Everything else redirects them back to their evaluation view.
const WORKER_ALLOWED_PATHS = ['/', '/dashboard', '/performance', '/leave', '/claims', '/profile'];

function WorkerGuard({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const location = useLocation();

  if (
    profile?.category === 'worker' &&
    !WORKER_ALLOWED_PATHS.includes(location.pathname)
  ) {
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

function PageFallback() {
  return (
    <div className="min-h-screen bg-bg grid place-items-center">
      <div className="w-10 h-10 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <FeatureFlagsProvider>
        <BrowserRouter>
          <Suspense fallback={<PageFallback />}>
          <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/reset-password" element={<ResetPassword />} />

          <Route
            path="/"
            element={
              <ProtectedPage workerAllowed>
                <Dashboard />
              </ProtectedPage>
            }
          />

          <Route
            path="/dashboard"
            element={
              <ProtectedPage workerAllowed>
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
              <ProtectedPage>
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
              <ProtectedPage workerAllowed>
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
              <ProtectedPage workerAllowed>
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
        </Suspense>
        </BrowserRouter>
      </FeatureFlagsProvider>
    </AuthProvider>
  );
}

export default App;