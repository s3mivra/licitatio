import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import { AcceptInviteScreen, ForgotPasswordScreen, LoginScreen, RegisterScreen, ResetPasswordScreen, VerifyEmailScreen } from './features/auth/AuthScreens';
import { BidDetail } from './features/bids/BidDetail';
import { BidsPage } from './features/bids/BidsPage';
import { AdminPage } from './features/admin/AdminPage';
import { Dashboard } from './features/dashboard/Dashboard';
import { TaskBoard } from './features/tasks/TaskBoard';
import { ExportPage } from './features/exports/ExportPage';
import { BlocksPage, ProposalEditor, ProposalsPage } from './features/proposals/ProposalPages';
import { EquipmentPage, PersonnelPage, ProjectsPage } from './features/registers/Registers';
import { MembersSettings } from './features/settings/MembersSettings';
import { AuditSettings, NotificationSettings, PlanSettings, StaffAccessSettings } from './features/settings/OtherSettings';
import { ProfileSettings } from './features/settings/ProfileSettings';
import { SettingsLayout } from './features/settings/SettingsLayout';
import { AppShell } from './features/shell/AppShell';
import { Home, StaffHome } from './features/shell/Home';
import { VaultDetail } from './features/vault/VaultDetail';
import { VaultList } from './features/vault/VaultList';
import { ApiError } from './lib/api';
import { AuthProvider, useAuth } from './lib/auth';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
      refetchOnWindowFocus: false,
    },
  },
});

function RequireAuth({ children }: { children: React.ReactElement }) {
  const { status } = useAuth();
  if (status === 'loading') return <div className="flex min-h-screen items-center justify-center text-sm text-slate-500" role="status">Loading…</div>;
  if (status === 'anonymous') return <Navigate to="/login" replace />;
  return children;
}

function PublicOnly({ children }: { children: React.ReactElement }) {
  const { status } = useAuth();
  if (status === 'authenticated') return <Navigate to="/" replace />;
  return children;
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<PublicOnly><LoginScreen /></PublicOnly>} />
      <Route path="/register" element={<PublicOnly><RegisterScreen /></PublicOnly>} />
      <Route path="/verify-email" element={<VerifyEmailScreen />} />
      <Route path="/forgot-password" element={<ForgotPasswordScreen />} />
      <Route path="/reset-password" element={<ResetPasswordScreen />} />
      <Route path="/accept-invite" element={<AcceptInviteScreen />} />
      <Route path="/" element={<RequireAuth><Home /></RequireAuth>} />
      <Route path="/staff" element={<RequireAuth><StaffHome /></RequireAuth>} />
      <Route path="/admin" element={<RequireAuth><AdminPage /></RequireAuth>} />
      <Route path="/o/:orgId" element={<RequireAuth><AppShell /></RequireAuth>}>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="vault" element={<VaultList />} />
        <Route path="vault/:id" element={<VaultDetail />} />
        <Route path="bids" element={<BidsPage />} />
        <Route path="bids/:id" element={<BidDetail />} />
        <Route path="exports/:id" element={<ExportPage />} />
        <Route path="tasks" element={<TaskBoard />} />
        <Route path="proposals" element={<ProposalsPage />} />
        <Route path="proposals/:id" element={<ProposalEditor />} />
        <Route path="blocks" element={<BlocksPage />} />
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="personnel" element={<PersonnelPage />} />
        <Route path="equipment" element={<EquipmentPage />} />
        <Route path="settings" element={<SettingsLayout />}>
          <Route index element={<Navigate to="profile" replace />} />
          <Route path="profile" element={<ProfileSettings />} />
          <Route path="members" element={<MembersSettings />} />
          <Route path="staff-access" element={<StaffAccessSettings />} />
          <Route path="notifications" element={<NotificationSettings />} />
          <Route path="plan" element={<PlanSettings />} />
          <Route path="audit" element={<AuditSettings />} />
        </Route>
        <Route path="*" element={<Navigate to="dashboard" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

registerSW({ immediate: true });

const root = document.getElementById('root');
if (!root) throw new Error('missing #root');
createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
