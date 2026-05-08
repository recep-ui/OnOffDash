import { useState, useEffect } from 'react';

export default function Header({ socketConnected, lastUpdate }) {
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

      <div className="header-right">
        <div className="last-update">
          Son Tarama: {lastUpdate ? formatTime(lastUpdate) : 'Bekleniyor...'}
        </div>
        
        <div className="connection-status">
          <div className={`connection-dot ${!socketConnected ? 'disconnected' : ''}`}></div>
          {socketConnected ? 'Canlı Bağlantı' : 'Bağlantı Koptu'}
        </div>
        
        <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginLeft: '8px' }}>
          {formatTime(time)}
        </div>
      </div>
    </header>
  );
}
