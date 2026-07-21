import { ThemeProvider } from './context/ThemeContext';
import { AppProvider, useApp } from './context/AppContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import CRMPage from './pages/CRMPage';
import StockPage from './pages/StockPage';
import BillingPage from './pages/BillingPage';
import InstallationPage from './pages/InstallationPage';
import TeamPage from './pages/TeamPage';
import LoginPage from './pages/LoginPage';
import { Loader2 } from 'lucide-react';

function AppContent() {
  const { currentPage, sidebarOpen } = useApp();
  const { session, loading, canAccess } = useAuth();

  // Écran de chargement pendant la vérification de session
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={32} className="animate-spin text-blue-600" />
          <p className="text-sm text-gray-500 dark:text-gray-400">Chargement…</p>
        </div>
      </div>
    );
  }

  // Pas de session → page de connexion
  if (!session) {
    return <LoginPage />;
  }

  const pages: Record<string, React.ReactNode> = {
    dashboard: <Dashboard />,
    crm: <CRMPage />,
    stock: <StockPage />,
    billing: <BillingPage />,
    installation: <InstallationPage />,
    team: <TeamPage />,
  };

  const activePage = canAccess(currentPage) ? currentPage : 'dashboard';

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 transition-colors duration-200">
      <Sidebar />
      <main className={`transition-all duration-300 ${sidebarOpen ? 'ml-64' : 'ml-20'} min-h-screen`}>
        <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
          {pages[activePage] || <Dashboard />}
        </div>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppProvider>
          <AppContent />
        </AppProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
