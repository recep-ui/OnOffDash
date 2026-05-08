export default function SummaryCards({ stats }) {
  const deviceStats = stats?.devices || {};
  const printerStats = stats?.printers || {};

  const cards = [
    { key: 'total', label: 'Toplam Cihaz', value: deviceStats.total || 0, icon: '🖥️', type: 'total' },
    { key: 'online', label: 'Çevrimiçi', value: deviceStats.online || 0, icon: '✅', type: 'online' },
    { key: 'offline', label: 'Çevrimdışı', value: deviceStats.offline || 0, icon: '❌', type: 'offline' },
    { key: 'warning', label: 'Uyarı', value: deviceStats.warning || 0, icon: '⚠️', type: 'warning' },
    { key: 'printer', label: 'Yazıcılar', value: printerStats.total || 0, icon: '🖨️', type: 'printer' },
  ];

  return (
    <div className="summary-cards">
      {cards.map(card => (
        <div key={card.key} className={`summary-card ${card.type}`}>
          <div className="card-header">
            <span className="card-label">{card.label}</span>
            <div className={`card-icon ${card.type}`}>{card.icon}</div>
          </div>
          <div className={`card-value ${card.type}`}>{card.value}</div>
        </div>
      ))}
    </div>
  );
}
