import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import { AcceptInviteScreen, ForgotPasswordScreen, LoginScreen, RegisterScreen, ResetPasswordScreen, VerifyEmailScreen } from './features/auth/AuthScreens';
import { ApiError } from './lib/api';
import { AuthProvider, useAuth } from './lib/auth';
import './index.css';

const BidDetail = lazy(() => import('./features/bids/BidDetail').then((m) => ({ default: m.BidDetail })));
const BidsPage = lazy(() => import('./features/bids/BidsPage').then((m) => ({ default: m.BidsPage })));
const AdminPage = lazy(() => import('./features/admin/AdminPage').then((m) => ({ default: m.AdminPage })));
const AnalyticsPage = lazy(() => import('./features/analytics/AnalyticsPage').then((m) => ({ default: m.AnalyticsPage })));
const Dashboard = lazy(() => import('./features/dashboard/Dashboard').then((m) => ({ default: m.Dashboard })));
const TaskBoard = lazy(() => import('./features/tasks/TaskBoard').then((m) => ({ default: m.TaskBoard })));
const ExportPage = lazy(() => import('./features/exports/ExportPage').then((m) => ({ default: m.ExportPage })));
const BlocksPage = lazy(() => import('./features/proposals/ProposalPages').then((m) => ({ default: m.BlocksPage })));
const ProposalEditor = lazy(() => import('./features/proposals/ProposalPages').then((m) => ({ default: m.ProposalEditor })));
const ProposalsPage = lazy(() => import('./features/proposals/ProposalPages').then((m) => ({ default: m.ProposalsPage })));
const EquipmentPage = lazy(() => import('./features/registers/Registers').then((m) => ({ default: m.EquipmentPage })));
const PersonnelPage = lazy(() => import('./features/registers/Registers').then((m) => ({ default: m.PersonnelPage })));
const ProjectsPage = lazy(() => import('./features/registers/Registers').then((m) => ({ default: m.ProjectsPage })));
const MembersSettings = lazy(() => import('./features/settings/MembersSettings').then((m) => ({ default: m.MembersSettings })));
const AuditSettings = lazy(() => import('./features/settings/OtherSettings').then((m) => ({ default: m.AuditSettings })));
const NotificationSettings = lazy(() => import('./features/settings/OtherSettings').then((m) => ({ default: m.NotificationSettings })));
const PlanSettings = lazy(() => import('./features/settings/OtherSettings').then((m) => ({ default: m.PlanSettings })));
const StaffAccessSettings = lazy(() => import('./features/settings/OtherSettings').then((m) => ({ default: m.StaffAccessSettings })));
const ProfileSettings = lazy(() => import('./features/settings/ProfileSettings').then((m) => ({ default: m.ProfileSettings })));
const SettingsLayout = lazy(() => import('./features/settings/SettingsLayout').then((m) => ({ default: m.SettingsLayout })));
const AppShell = lazy(() => import('./features/shell/AppShell').then((m) => ({ default: m.AppShell })));
const Home = lazy(() => import('./features/shell/Home').then((m) => ({ default: m.Home })));
const StaffHome = lazy(() => import('./features/shell/Home').then((m) => ({ default: m.StaffHome })));
const VaultDetail = lazy(() => import('./features/vault/VaultDetail').then((m) => ({ default: m.VaultDetail })));
const VaultList = lazy(() => import('./features/vault/VaultList').then((m) => ({ default: m.VaultList })));
const Landing = lazy(() => import('./features/public/PublicPages').then((m) => ({ default: m.Landing })));
const AboutPage = lazy(() => import('./features/public/PublicPages').then((m) => ({ default: m.AboutPage })));
const GalleryPage = lazy(() => import('./features/public/PublicPages').then((m) => ({ default: m.GalleryPage })));
const PrivacyPage = lazy(() => import('./features/public/PublicPages').then((m) => ({ default: m.PrivacyPage })));
const TermsPage = lazy(() => import('./features/public/PublicPages').then((m) => ({ default: m.TermsPage })));
const InstallPage = lazy(() => import('./features/public/PublicPages').then((m) => ({ default: m.InstallPage })));

const Loading = () => <div className="flex min-h-[50vh] items-center justify-center text-sm text-slate-500" role="status">Loading…</div>;

function HomeOrLanding() {
  const { status } = useAuth();
  if (status === 'loading') return <Loading />;
  return status === 'authenticated' ? <Home /> : <Landing />;
}

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
    <Suspense fallback={<Loading />}>
    <Routes>
      <Route path="/about" element={<AboutPage />} />
      <Route path="/gallery" element={<GalleryPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/install" element={<InstallPage />} />
      <Route path="/login" element={<PublicOnly><LoginScreen /></PublicOnly>} />
      <Route path="/register" element={<PublicOnly><RegisterScreen /></PublicOnly>} />
      <Route path="/verify-email" element={<VerifyEmailScreen />} />
      <Route path="/forgot-password" element={<ForgotPasswordScreen />} />
      <Route path="/reset-password" element={<ResetPasswordScreen />} />
      <Route path="/accept-invite" element={<AcceptInviteScreen />} />
      <Route path="/" element={<HomeOrLanding />} />
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
        <Route path="analytics" element={<AnalyticsPage />} />
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
    </Suspense>
  );
}

registerSW({ immediate: true });

// Off unless VITE_SENTRY_DSN is set. No replays, no default PII; add the ingest host to the CSP connect-src.
const sentryDsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
if (sentryDsn) void import('@sentry/react').then((Sentry) => Sentry.init({ dsn: sentryDsn, sendDefaultPii: false, tracesSampleRate: 0 }));

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
