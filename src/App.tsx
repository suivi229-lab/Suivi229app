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

function AppContent() {
  const { currentPage, sidebarOpen } = useApp();
  const { canAccess } = useAuth();

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
