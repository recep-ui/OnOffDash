export default function StatusBadge({ status, label, className = '' }) {
  const normStatus = (status || '').toLowerCase();
  
  let variant = 'neutral';
  let defaultLabel = status || 'Bilinmiyor';

  if (normStatus === 'online' || normStatus === 'active' || normStatus === 'tamamlandı' || normStatus === 'completed') {
    variant = 'online';
    defaultLabel = normStatus === 'online' ? 'Online' : normStatus === 'active' ? 'Aktif' : 'Tamamlandı';
  } else if (normStatus === 'offline' || normStatus === 'critical' || normStatus === 'kritik' || normStatus === 'cancelled' || normStatus === 'iptal') {
    variant = 'offline';
    defaultLabel = normStatus === 'offline' ? 'Offline' : normStatus === 'critical' || normStatus === 'kritik' ? 'Kritik' : 'İptal';
  } else if (normStatus === 'warning' || normStatus === 'uyarı' || normStatus === 'pending' || normStatus === 'beklemede' || normStatus === 'devam ediyor') {
    variant = 'warning';
    defaultLabel = normStatus === 'warning' ? 'Uyarı' : normStatus === 'pending' ? 'Bekliyor' : 'Devam Ediyor';
  } else if (normStatus === 'info' || normStatus === 'blue') {
    variant = 'info';
    defaultLabel = label || 'Bilgi';
  }

  return (
    <span className={`status-badge ${variant} ${className}`}>
      <span className="status-badge-dot"></span>
      {label || defaultLabel}
    </span>
  );
}
