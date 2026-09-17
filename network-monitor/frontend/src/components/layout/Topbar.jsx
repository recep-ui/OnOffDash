import { useState, useEffect, useRef } from 'react';
import { Search, Bell, HelpCircle, ChevronDown, LogOut, User, Shield, CheckCircle2, AlertTriangle, X, Monitor } from 'lucide-react';

export default function Topbar({
  socketConnected,
  lastUpdate,
  user,
  onLogout,
  onOpenSearch,
  unreadCount = 3,
  onSelectTab
}) {
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [notifDropdownOpen, setNotifDropdownOpen] = useState(false);
  const [helpModalOpen, setHelpModalOpen] = useState(false);
  const dropdownRef = useRef(null);
  const notifRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setUserDropdownOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setNotifDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const formatTime = (date) => {
    if (!date) return '';
    const d = new Date(date);
    return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  };

  const dummyNotifications = [
    { id: 1, title: 'Çevrimdışı Cihaz Uyarısı', desc: 'boyanhane22 cihazı yanıt vermeyi kesti.', time: '5 dk önce', type: 'error' },
    { id: 2, title: 'IP Taraması Tamamlandı', desc: '10.0.70.0/24 subnetinde 18 yeni IP keşfedildi.', time: '25 dk önce', type: 'info' },
    { id: 3, title: 'Yazıcı Bakım Hatırlatıcısı', desc: 'HP LaserJet 400 toneri %8 seviyesinde.', time: '1 saat önce', type: 'warning' },
  ];

  return (
    <>
      <header className="app-topbar">
        {/* Left / Center: Global Search Bar */}
        <div className="topbar-search-box" onClick={onOpenSearch}>
          <div className="topbar-search-icon">
            <Search size={16} />
          </div>
          <input
            type="text"
            readOnly
            className="topbar-search-input"
            placeholder="Global arama (Cihaz, IP, Kullanıcı, Yazıcı...)"
          />
          <span className="topbar-search-kbd">⌘K</span>
        </div>

        {/* Right Section */}
        <div className="topbar-actions">
          {/* Connection Status Pill */}
          <div className={`connection-pill ${!socketConnected ? 'disconnected' : ''}`}>
            <span className="connection-pulse-dot"></span>
            <span>{socketConnected ? 'Canlı Bağlantı' : 'Bağlantı Koptu'}</span>
          </div>

          {/* Notifications */}
          <div style={{ position: 'relative' }} ref={notifRef}>
            <button
              className="topbar-icon-btn"
              onClick={() => setNotifDropdownOpen(prev => !prev)}
              title="Bildirimler"
            >
              <Bell size={18} />
              {unreadCount > 0 && <span className="topbar-icon-badge">{unreadCount}</span>}
            </button>

            {notifDropdownOpen && (
              <div className="dropdown-menu" style={{ width: '320px', padding: 0 }}>
                <div style={{
                  padding: '12px 16px',
                  borderBottom: '1px solid var(--border-light)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}>
                  <div style={{ fontWeight: 600, fontSize: '13.5px', color: 'var(--text-primary)' }}>
                    Bildirimler
                  </div>
                  <span className="badge info" style={{ fontSize: '11px' }}>{unreadCount} Yeni</span>
                </div>

                <div style={{ maxHeight: '280px', overflowY: 'auto' }}>
                  {dummyNotifications.map(n => (
                    <div
                      key={n.id}
                      style={{
                        padding: '10px 16px',
                        borderBottom: '1px solid var(--border-light)',
                        display: 'flex',
                        gap: '10px',
                        cursor: 'pointer'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-muted)'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      <div style={{ marginTop: '2px' }}>
                        {n.type === 'error' ? (
                          <AlertTriangle size={15} color="var(--status-offline)" />
                        ) : n.type === 'warning' ? (
                          <AlertTriangle size={15} color="var(--status-warning)" />
                        ) : (
                          <CheckCircle2 size={15} color="var(--status-info)" />
                        )}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-primary)' }}>
                          {n.title}
                        </div>
                        <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', marginTop: '2px', lineHeight: 1.3 }}>
                          {n.desc}
                        </div>
                        <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', marginTop: '4px' }}>
                          {n.time}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{
                  padding: '8px 16px',
                  background: 'var(--bg-subtle)',
                  textAlign: 'center',
                  borderTop: '1px solid var(--border-light)'
                }}>
                  <button
                    onClick={() => {
                      setNotifDropdownOpen(false);
                      if (onSelectTab) onSelectTab('monitoring');
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--primary)',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    Tüm Alarmları Görüntüle ➔
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Help Button */}
          <button
            className="topbar-icon-btn"
            onClick={() => setHelpModalOpen(true)}
            title="Yardım ve Bilgi"
          >
            <HelpCircle size={18} />
          </button>

          {/* User Profile */}
          <div style={{ position: 'relative' }} ref={dropdownRef}>
            <div
              className="user-profile-menu"
              onClick={() => setUserDropdownOpen(prev => !prev)}
            >
              <div className="user-avatar">
                {(user?.username || 'A')[0].toUpperCase()}
              </div>
              <div className="user-info">
                <span className="user-name">{user?.username || 'admin'}</span>
                <span className={`user-role-badge ${user?.role === 'admin' ? 'admin' : ''}`}>
                  {user?.role?.toUpperCase() || 'ADMIN'}
                </span>
              </div>
              <ChevronDown size={14} color="var(--text-muted)" />
            </div>

            {userDropdownOpen && (
              <div className="dropdown-menu">
                <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-light)' }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {user?.username}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    {user?.role === 'admin' ? 'Sistem Yöneticisi' : 'Operatör'}
                  </div>
                </div>

                <button
                  className="dropdown-item"
                  onClick={() => {
                    setUserDropdownOpen(false);
                    if (onSelectTab) onSelectTab('devices');
                  }}
                >
                  <Monitor size={15} />
                  <span>Cihaz Listesi</span>
                </button>

                <button
                  className="dropdown-item"
                  onClick={() => {
                    setUserDropdownOpen(false);
                    if (onSelectTab) onSelectTab('analytics');
                  }}
                >
                  <Shield size={15} />
                  <span>SLA & Raporlar</span>
                </button>

                <div className="dropdown-divider"></div>

                <button
                  className="dropdown-item danger"
                  onClick={() => {
                    setUserDropdownOpen(false);
                    onLogout();
                  }}
                >
                  <LogOut size={15} />
                  <span>Oturumu Kapat</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Help Modal */}
      {helpModalOpen && (
        <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setHelpModalOpen(false); }}>
          <div className="modal-dialog" style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h3 className="modal-title">
                <HelpCircle size={18} className="text-primary" />
                OnOffDash V2 Yardım & Kılavuz
              </h3>
              <button className="modal-close-btn" onClick={() => setHelpModalOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body" style={{ fontSize: '13.5px', lineHeight: '1.6', color: 'var(--text-secondary)' }}>
              <p style={{ marginBottom: '12px' }}>
                <strong>OnOffDash V2</strong> kurumsal IT altyapı izleme, cihaz kontrol, IPAM ve yazıcı yönetim sistemidir.
              </p>
              <ul style={{ paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <li><strong>Kısayol Arama:</strong> <code>⌘K</code> veya <code>Ctrl+K</code> ile anında cihaz ve yazıcı arayabilirsiniz.</li>
                <li><strong>Canlı Veriler:</strong> Cihaz ve yazıcı durumları Socket.IO üzerinden gerçek zamanlı güncellenir.</li>
                <li><strong>Agent:</strong> Bilgisayarlara kurulu agent servisleri CPU, RAM, Disk ve Yazılım envanteri aktarır.</li>
              </ul>
            </div>
            <div className="modal-footer">
              <button className="btn btn-primary btn-sm" onClick={() => setHelpModalOpen(false)}>
                Anladım
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
