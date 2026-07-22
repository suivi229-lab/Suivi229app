import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

type Page = 'dashboard' | 'crm' | 'stock' | 'billing' | 'installation' | 'team' | 'ai';

interface AppContextType {
  currentPage: Page;
  setCurrentPage: (page: Page) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  refreshKey: number;
  triggerRefresh: () => void;
}

const AppContext = createContext<AppContextType>({
  currentPage: 'dashboard',
  setCurrentPage: () => {},
  sidebarOpen: true,
  setSidebarOpen: () => {},
  refreshKey: 0,
  triggerRefresh: () => {},
});

export function AppProvider({ children }: { children: ReactNode }) {
  const [currentPage, setCurrentPage] = useState<Page>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 768);
  const [refreshKey, setRefreshKey] = useState(0);

  const triggerRefresh = useCallback(() => {
    setRefreshKey(k => k + 1);
  }, []);

  return (
    <AppContext.Provider value={{ currentPage, setCurrentPage, sidebarOpen, setSidebarOpen, refreshKey, triggerRefresh }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  return useContext(AppContext);
}
