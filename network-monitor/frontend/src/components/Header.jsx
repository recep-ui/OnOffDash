import { useState, useEffect } from 'react';

export default function Header({ socketConnected, lastUpdate, user, onLogout }) {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (date) => {
    if (!date) return '';
    const d = new Date(date);
    return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <header className="header">
      <div className="header-left">
        <div className="header-logo">🖥️</div>
        <div>
          <h1 className="header-title">OnOffDash V2</h1>
          <div className="header-subtitle">Ağ İzleme ve Yönetim Paneli</div>
        </div>
      </div>

      <div className="header-right" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div className="last-update">
          Son Tarama: {lastUpdate ? formatTime(lastUpdate) : 'Bekleniyor...'}
        </div>
        
        <div className="connection-status">
          <div className={`connection-dot ${!socketConnected ? 'disconnected' : ''}`}></div>
          {socketConnected ? 'Canlı Bağlantı' : 'Bağlantı Koptu'}
        </div>
        
        {user && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            paddingLeft: '16px',
            borderLeft: '1px solid var(--border-color)'
          }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{user.username}</div>
              <div style={{
                fontSize: '10px',
                fontWeight: 700,
                color: user.role === 'admin' ? '#f87171' : user.role === 'technician' ? 'var(--status-warning)' : 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                marginTop: '1px'
              }}>
                {user.role}
              </div>
            </div>
            <button 
              className="btn btn-ghost" 
              onClick={onLogout} 
              style={{
                padding: '6px 12px',
                fontSize: '12px',
                fontWeight: 600,
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                transition: 'all 0.2s',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                margin: 0
              }}
              title="Oturumu Kapat"
            >
              🚪 Çıkış
            </button>
          </div>
        )}
        
        <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
          {formatTime(time)}
        </div>
      </div>
    </header>
  );
}
