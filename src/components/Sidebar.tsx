import { useApp } from '../context/AppContext';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard,
  Users,
  Package,
  Receipt,
  Zap,
  Sun,
  Moon,
  ChevronLeft,
  ChevronRight,
  MapPin,
  LogOut,
  Shield,
  Wrench,
  Eye,
  TrendingUp,
  UserCog,
} from 'lucide-react';

const allNavItems = [
  { id: 'dashboard' as const, label: 'Tableau de bord', icon: LayoutDashboard },
  { id: 'crm' as const, label: 'CRM & Abonnements', icon: Users },
  { id: 'stock' as const, label: 'Stock & Logistique', icon: Package },
  { id: 'billing' as const, label: 'Facturation', icon: Receipt },
  { id: 'installation' as const, label: 'Nouvelle Installation', icon: Zap },
  { id: 'team' as const, label: "Gestion de l'équipe", icon: UserCog },
];

const roleLabels: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  Admin: { label: 'Administrateur', icon: Shield, color: 'text-brand-600 dark:text-brand-400' },
  Technicien: { label: 'Technicien', icon: Wrench, color: 'text-amber-600 dark:text-amber-400' },
  Observateur: { label: 'Observateur', icon: Eye, color: 'text-gray-500 dark:text-gray-400' },
  Investisseur: { label: 'Investisseur', icon: TrendingUp, color: 'text-accent-600 dark:text-accent-400' },
};

export default function Sidebar() {
  const { currentPage, setCurrentPage, sidebarOpen, setSidebarOpen } = useApp();
  const { theme, toggleTheme } = useTheme();
  const { canAccess, signOut, role, user, profile } = useAuth();

  const visibleItems = allNavItems.filter(item => canAccess(item.id));
  const roleInfo = role ? roleLabels[role] : null;

  function handleNavClick(id: typeof allNavItems[number]['id']) {
    setCurrentPage(id);
    // Ferme automatiquement sur mobile
    if (window.innerWidth < 768) setSidebarOpen(false);
  }

  return (
    <>
      {/* Backdrop mobile — clique pour fermer */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`no-print fixed left-0 top-0 h-full z-40 flex flex-col
          bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800
          transition-all duration-300
          w-64
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          md:translate-x-0
          ${sidebarOpen ? 'md:w-64' : 'md:w-20'}
        `}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 h-16 border-b border-gray-200 dark:border-gray-800">
          <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-brand-600 flex items-center justify-center">
            <MapPin className="w-5 h-5 text-white" />
          </div>
          {/* Toujours visible sur mobile (sidebar est w-64), visible sur desktop si open */}
          <div className={`overflow-hidden ${sidebarOpen ? 'block' : 'md:hidden'}`}>
            <h1 className="text-lg font-bold text-gray-900 dark:text-white whitespace-nowrap">Suivi 229+</h1>
            <p className="text-[10px] text-gray-500 dark:text-gray-400 whitespace-nowrap">Tracking Véhicules</p>
          </div>
        </div>

        {/* User info */}
        <div className={`px-4 py-3 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 ${sidebarOpen ? 'block' : 'md:hidden'}`}>
          <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 truncate">
            {profile?.full_name || user?.email?.split('@')[0] || 'Utilisateur'}
          </p>
          {roleInfo && (
            <div className={`flex items-center gap-1 mt-0.5 ${roleInfo.color}`}>
              <roleInfo.icon className="w-3 h-3 flex-shrink-0" />
              <p className="text-[11px] font-medium">{roleInfo.label}</p>
            </div>
          )}
          <p className="text-[10px] text-gray-400 dark:text-gray-500 truncate mt-0.5">{user?.email}</p>
        </div>

        {!sidebarOpen && roleInfo && (
          <div className="hidden md:flex justify-center py-2 border-b border-gray-100 dark:border-gray-800">
            <div title={roleInfo.label} className={roleInfo.color}>
              <roleInfo.icon className="w-4 h-4" />
            </div>
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 py-4 space-y-1 px-3 overflow-y-auto">
          {visibleItems.map(item => {
            const Icon = item.icon;
            const active = currentPage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                  active
                    ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-400'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-200'
                }`}
                title={!sidebarOpen ? item.label : undefined}
              >
                <Icon className={`w-5 h-5 flex-shrink-0 ${active ? 'text-brand-600 dark:text-brand-400' : ''}`} />
                <span className={`whitespace-nowrap ${sidebarOpen ? 'block' : 'md:hidden'}`}>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Bottom controls */}
        <div className="px-3 pb-4 space-y-1">
          <button
            onClick={toggleTheme}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all duration-150"
            title={!sidebarOpen ? (theme === 'dark' ? 'Mode clair' : 'Mode sombre') : undefined}
          >
            {theme === 'dark' ? <Sun className="w-5 h-5 flex-shrink-0" /> : <Moon className="w-5 h-5 flex-shrink-0" />}
            <span className={sidebarOpen ? 'block' : 'md:hidden'}>{theme === 'dark' ? 'Mode clair' : 'Mode sombre'}</span>
          </button>

          <button
            onClick={signOut}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all duration-150"
            title={!sidebarOpen ? 'Se déconnecter' : undefined}
          >
            <LogOut className="w-5 h-5 flex-shrink-0" />
            <span className={sidebarOpen ? 'block' : 'md:hidden'}>Se déconnecter</span>
          </button>

          {/* Bouton réduire — desktop uniquement */}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="hidden md:flex w-full items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all duration-150"
          >
            {sidebarOpen ? <ChevronLeft className="w-5 h-5 flex-shrink-0" /> : <ChevronRight className="w-5 h-5 flex-shrink-0" />}
            {sidebarOpen && <span>Réduire</span>}
          </button>
        </div>
      </aside>
    </>
  );
}
