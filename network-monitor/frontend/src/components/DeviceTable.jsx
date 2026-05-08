import { useState } from 'react';
import StatusBadge from './StatusBadge';

function getRelativeTime(dateStr) {
  if (!dateStr) return '—';
  const now = new Date();
  const date = new Date(dateStr);
  const diff = Math.floor((now - date) / 1000);

  if (diff < 10) return 'Az önce';
  if (diff < 60) return `${diff} sn önce`;
  if (diff < 3600) return `${Math.floor(diff / 60)} dk önce`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} saat önce`;
  return `${Math.floor(diff / 86400)} gün önce`;
}

function getPingClass(ms) {
  if (ms === null || ms === undefined) return '';
  if (ms <= 50) return 'good';
  if (ms <= 200) return 'medium';
  return 'bad';
}

function formatUptime(seconds) {
  if (!seconds) return '—';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  const parts = [];
  if (days > 0) parts.push(`${days}g`);
  if (hours > 0) parts.push(`${hours}sa`);
  if (minutes > 0 && days === 0) parts.push(`${minutes}dk`);
  
  if (parts.length === 0) return '< 1dk';
  return parts.join(' ');
}

function getUsageColor(percent) {
  if (percent === null || percent === undefined) return 'inherit';
  if (percent >= 85) return 'var(--status-offline)';
  if (percent >= 60) return 'var(--status-warning)';
  return 'var(--status-online)';
}

const COLUMNS = [
  { key: 'status', label: 'Durum', sortable: true },
  { key: 'hostname', label: 'Bilgisayar Adı', sortable: true },
  { key: 'ip_address', label: 'IP Adresi', sortable: true },
  { key: 'department', label: 'Departman', sortable: true },
  { key: 'os_name', label: 'İşletim Sistemi', sortable: false },
  { key: 'username', label: 'Kullanıcı', sortable: false },
  { key: 'cpu_usage', label: 'CPU', sortable: true },
  { key: 'ram_usage', label: 'RAM', sortable: true },
  { key: 'uptime_seconds', label: 'Uptime', sortable: true },
  { key: 'ping_ms', label: 'Ping', sortable: true },
  { key: 'last_seen', label: 'Son Görülme', sortable: true },
  { key: 'agent_installed', label: 'Agent', sortable: false },
  { key: 'actions', label: 'İşlemler', sortable: false },
];

export default function DeviceTable({ devices, onEdit, onDelete, search, statusFilter, departmentFilter, departments, onSearchChange, onStatusFilterChange, onDepartmentFilterChange, onAddClick, onRowClick }) {
  const [sortBy, setSortBy] = useState('hostname');
  const [sortOrder, setSortOrder] = useState('asc');

  function handleSort(key) {
    if (!COLUMNS.find(c => c.key === key)?.sortable) return;
    if (sortBy === key) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(key);
      setSortOrder('asc');
    }
  }

  // Client-side filtreleme
  const filtered = devices.filter(device => {
    // Durum filtresi
    if (statusFilter && statusFilter !== 'all' && device.status !== statusFilter) {
      return false;
    }
    // Departman filtresi
    if (departmentFilter && device.department !== departmentFilter) {
      return false;
    }
    // Arama filtresi (hostname, IP, kullanıcı)
    if (search) {
      const s = search.toLowerCase();
      const matchHostname = (device.hostname || '').toLowerCase().includes(s);
      const matchIp = (device.ip_address || '').toLowerCase().includes(s);
      const matchUser = (device.username || '').toLowerCase().includes(s);
      if (!matchHostname && !matchIp && !matchUser) {
        return false;
      }
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    let aVal = a[sortBy];
    let bVal = b[sortBy];
    if (aVal === null || aVal === undefined) aVal = '';
    if (bVal === null || bVal === undefined) bVal = '';

    if (sortBy === 'ping_ms' || sortBy === 'last_seen') {
      aVal = sortBy === 'ping_ms' ? (aVal || 9999) : new Date(aVal || 0).getTime();
      bVal = sortBy === 'ping_ms' ? (bVal || 9999) : new Date(bVal || 0).getTime();
    }

    if (typeof aVal === 'string') {
      return sortOrder === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    }
    return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
  });

  return (
    <>
      <div className="toolbar">
        <div className="toolbar-left">
          <div className="search-input">
            <span>🔍</span>
            <input
              type="text"
              placeholder="Cihaz ara (hostname, IP, kullanıcı)..."
              value={search}
              onChange={e => onSearchChange(e.target.value)}
              id="device-search"
            />
          </div>
          <select
            className="filter-select"
            value={statusFilter}
            onChange={e => onStatusFilterChange(e.target.value)}
            id="status-filter"
          >
            <option value="all">Tüm Durumlar</option>
            <option value="online">Online</option>
            <option value="offline">Offline</option>
            <option value="warning">Uyarı</option>
          </select>
          <select
            className="filter-select"
            value={departmentFilter}
            onChange={e => onDepartmentFilterChange(e.target.value)}
            id="department-filter"
          >
            <option value="">Tüm Departmanlar</option>
            {departments.map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
        <button className="btn btn-primary" onClick={onAddClick} id="add-device-btn">
          <span>➕</span> Cihaz Ekle
        </button>
      </div>

      <div className="table-container">
        {sorted.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🖥️</div>
            <div className="empty-title">Henüz cihaz eklenmemiş</div>
            <div className="empty-text">Cihaz ekleyerek ağ izlemeye başlayın</div>
          </div>
        ) : (
          <table className="device-table">
            <thead>
              <tr>
                {COLUMNS.map(col => (
                  <th
                    key={col.key}
                    onClick={() => handleSort(col.key)}
                    className={sortBy === col.key ? 'sorted' : ''}
                  >
                    {col.label}
                    {col.sortable && sortBy === col.key && (
                      <span className="sort-arrow">{sortOrder === 'asc' ? '▲' : '▼'}</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map(device => (
                <tr key={device.id} className={`status-${device.status}`}>
                  <td><StatusBadge status={device.status} /></td>
                  <td>
                    <strong 
                      style={{ cursor: 'pointer', color: 'var(--accent-blue)' }}
                      onClick={() => onRowClick && onRowClick(device)}
                      title="Detayları görüntüle"
                    >
                      {device.hostname}
                    </strong>
                  </td>
                  <td style={{ fontFamily: 'monospace' }}>{device.ip_address}</td>
                  <td>{device.department || '—'}</td>
                  <td>{device.os_name || '—'}</td>
                  <td>{device.username || '—'}</td>
                  <td>
                    {device.cpu_usage !== null && device.cpu_usage !== undefined ? (
                      <span style={{ color: getUsageColor(device.cpu_usage), fontWeight: 'bold' }}>
                        {device.cpu_usage}%
                      </span>
                    ) : '—'}
                  </td>
                  <td>
                    {device.ram_usage !== null && device.ram_usage !== undefined ? (
                      <span style={{ color: getUsageColor(device.ram_usage), fontWeight: 'bold' }}>
                        {device.ram_usage}%
                      </span>
                    ) : '—'}
                  </td>
                  <td>{formatUptime(device.uptime_seconds)}</td>
                  <td>
                    {device.ping_ms !== null && device.ping_ms !== undefined ? (
                      <span className={`ping-value ${getPingClass(device.ping_ms)}`}>
                        {device.ping_ms} ms
                      </span>
                    ) : '—'}
                  </td>
                  <td>
                    <span className="relative-time">{getRelativeTime(device.last_seen)}</span>
                  </td>
                  <td>
                    <span className={`agent-badge ${device.agent_installed ? 'installed' : 'not-installed'}`}>
                      {device.agent_installed ? '✅ Agent' : '—'}
                    </span>
                  </td>
                  <td>
                    <div className="action-buttons">
                      <button
                        className="action-btn"
                        onClick={() => onEdit(device)}
                        title="Düzenle"
                      >
                        ✏️
                      </button>
                      <button
                        className="action-btn delete"
                        onClick={() => onDelete(device)}
                        title="Sil"
                      >
                        🗑️
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
