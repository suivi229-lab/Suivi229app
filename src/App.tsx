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
import AIPage from './pages/AIPage';
import LoginPage from './pages/LoginPage';
import { Loader2, Menu, MapPin } from 'lucide-react';

function AppContent() {
  const { currentPage, sidebarOpen, setSidebarOpen } = useApp();
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
    ai: <AIPage />,
  };

  const activePage = canAccess(currentPage) ? currentPage : 'dashboard';

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 transition-colors duration-200">
      <Sidebar />

      {/* Barre de navigation mobile */}
      <header className="md:hidden fixed top-0 left-0 right-0 z-20 h-14 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex items-center px-4 gap-3">
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          aria-label="Ouvrir le menu"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-brand-600 flex items-center justify-center">
            <MapPin className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-gray-900 dark:text-white text-sm">Suivi 229+</span>
        </div>
      </header>

      <main className={`transition-all duration-300 pt-14 md:pt-0 ${sidebarOpen ? 'md:ml-64' : 'md:ml-20'} min-h-screen`}>
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
