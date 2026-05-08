export default function StatusBadge({ status }) {
  const label = {
    online: 'Online',
    offline: 'Offline',
    warning: 'Uyarı',
  }[status] || status;

  return (
    <span className={`status-badge ${status}`}>
      <span className={`status-dot ${status}`}></span>
      {label}
    </span>
  );
}
