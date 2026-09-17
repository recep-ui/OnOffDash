import { useState } from 'react';
import {
  LayoutDashboard,
  Monitor,
  Globe,
  Activity,
  Printer,
  Calendar,
  Wrench,
  BarChart3,
  Sliders,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  PhoneCall
} from 'lucide-react';

export default function Sidebar({
  activeTab,
  onSelectTab,
  collapsed,
  onToggleCollapse,
  stats
}) {
  const [networkMenuOpen, setNetworkMenuOpen] = useState(true);
  const [actionsMenuOpen, setActionsMenuOpen] = useState(true);
  const [reportsMenuOpen, setReportsMenuOpen] = useState(false);
  const [toolsMenuOpen, setToolsMenuOpen] = useState(false);

  const mainNavItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'devices', label: 'Cihazlar', icon: Monitor },
    {
      id: 'network',
      label: 'Ağ Yönetimi',
      icon: Globe,
      hasSubmenu: true,
      isOpen: networkMenuOpen,
      onToggle: () => setNetworkMenuOpen(prev => !prev),
      subItems: [
        { id: 'ipam', label: 'IPAM / Ağ Haritası' }
      ]
    },
    { id: 'monitoring', label: 'İzleme & Alarmlar', icon: Activity },
    {
      id: 'printers',
      label: 'Yazıcılar',
      icon: Printer,
      badge: stats?.printers?.jam > 0 ? stats.printers.jam : null
    },
    { id: 'maintenance', label: 'Bakım Tablosu', icon: Calendar },
    {
      id: 'actions-group',
      label: 'Yapılan İşler',
      icon: Wrench,
      hasSubmenu: true,
      isOpen: actionsMenuOpen,
      onToggle: () => setActionsMenuOpen(prev => !prev),
      subItems: [
        { id: 'actions', label: 'Yapılan İşler' },
        { id: 'materials', label: 'Gelen Giden Malzeme' }
      ]
    },
    { id: 'phone-directory', label: 'İç Hat Rehberi', icon: PhoneCall },
    {
      id: 'reports',
      label: 'Raporlar',
      icon: BarChart3,
      hasSubmenu: true,
      isOpen: reportsMenuOpen,
      onToggle: () => setReportsMenuOpen(prev => !prev),
      subItems: [
        { id: 'analytics', label: 'Performans & SLA' }
      ]
    },
    {
      id: 'tools',
      label: 'Araçlar',
      icon: Sliders,
      hasSubmenu: true,
      isOpen: toolsMenuOpen,
      onToggle: () => setToolsMenuOpen(prev => !prev),
      subItems: [
        { id: 'pdf-tools', label: 'PDF Araçları' },
        { id: 'file-tools', label: 'Dosya Araçları' }
      ]
    },
  ];


  return (
    <aside className={`app-sidebar ${collapsed ? 'collapsed' : ''}`}>
      {/* Brand Header */}
      <div className="sidebar-header">
        <div className="sidebar-logo-icon">
          <Activity size={20} strokeWidth={2.5} />
        </div>
        {!collapsed && (
          <div className="sidebar-brand-text">
            <span className="sidebar-brand-title">OnOffDash V2</span>
            <span className="sidebar-brand-subtitle">Enterprise IT Operations Monitor</span>
          </div>
        )}
      </div>

      {/* Nav Section */}
      <div className="sidebar-nav">
        {!collapsed && <div className="sidebar-section-title">ANA MENÜ</div>}

        {mainNavItems.map(item => {
          const Icon = item.icon;
          const isActive = activeTab === item.id || (item.subItems && item.subItems.some(s => s.id === activeTab));

          return (
            <div key={item.id}>
              <button
                className={`sidebar-nav-item ${isActive ? 'active' : ''}`}
                onClick={() => {
                  if (item.hasSubmenu && !collapsed) {
                    item.onToggle();
                  } else {
                    onSelectTab(item.id);
                  }
                }}
                title={collapsed ? item.label : undefined}
              >
                <div className="sidebar-nav-left">
                  <span className="nav-icon">
                    <Icon size={18} strokeWidth={isActive ? 2.2 : 1.75} />
                  </span>
                  {!collapsed && <span className="nav-label">{item.label}</span>}
                </div>

                {!collapsed && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {item.badge && <span className="nav-badge">{item.badge}</span>}
                    {item.hasSubmenu && (
                      <span style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
                        {item.isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </span>
                    )}
                  </div>
                )}
              </button>

              {/* Submenu */}
              {!collapsed && item.hasSubmenu && item.isOpen && item.subItems && (
                <div style={{ paddingLeft: '32px', display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '2px' }}>
                  {item.subItems.map(sub => (
                    <button
                      key={sub.id}
                      className={`sidebar-nav-item ${activeTab === sub.id ? 'active' : ''}`}
                      onClick={() => onSelectTab(sub.id)}
                      style={{ padding: '7px 12px', fontSize: '12.5px' }}
                    >
                      <span className="nav-label">{sub.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}


      </div>

      {/* Collapse Toggle */}
      <button
        className="sidebar-collapse-btn"
        onClick={onToggleCollapse}
        title={collapsed ? "Menüyü Genişlet" : "Menüyü Daralt"}
      >
        {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        {!collapsed && <span>Menüyü Daralt</span>}
      </button>
    </aside>
  );
}
