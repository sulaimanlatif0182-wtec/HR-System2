import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { AuthProvider } from './contexts/AuthContext';
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

function ProtectedPage({ children }: { children: ReactNode }) {
  return (
    <ProtectedRoute>
      <Layout>{children}</Layout>
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
              <ProtectedPage>
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
              <ProtectedPage>
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
              <ProtectedPage>
                <MonthlyReports />
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
              <ProtectedPage>
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