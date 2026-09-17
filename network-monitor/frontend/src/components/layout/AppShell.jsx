import { useState } from 'react';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import GlobalSearchModal from '../ui/GlobalSearchModal';

export default function AppShell({
  children,
  activeTab,
  onSelectTab,
  socketConnected,
  lastUpdate,
  user,
  onLogout,
  stats,
  devices = [],
  printers = [],
  onSelectDevice,
  onSelectPrinter
}) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [searchModalOpen, setSearchModalOpen] = useState(false);

  return (
    <div className="app-shell">
      {/* Sidebar */}
      <Sidebar
        activeTab={activeTab}
        onSelectTab={onSelectTab}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(prev => !prev)}
        stats={stats}
      />

      {/* Main Content Area */}
      <div className="app-main">
        <Topbar
          socketConnected={socketConnected}
          lastUpdate={lastUpdate}
          user={user}
          onLogout={onLogout}
          onOpenSearch={() => setSearchModalOpen(true)}
          unreadCount={3}
          onSelectTab={onSelectTab}
        />

        <main className="app-content">
          {children}
        </main>
      </div>

      {/* Global Command Palette */}
      <GlobalSearchModal
        isOpen={searchModalOpen}
        onClose={() => setSearchModalOpen(false)}
        devices={devices}
        printers={printers}
        onSelectDevice={onSelectDevice}
        onSelectPrinter={onSelectPrinter}
        onNavigateTab={onSelectTab}
      />
    </div>
  );
}
