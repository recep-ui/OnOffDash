import { useState, useRef } from 'react';
import {
  Search,
  Plus,
  FileSpreadsheet,
  Download,
  Upload,
  Monitor,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Edit2,
  Trash2,
  Activity,
  Cpu,
  HardDrive
} from 'lucide-react';
import StatusBadge from './StatusBadge';
import Button from './ui/Button';

function getRelativeTime(dateStr) {
  if (!dateStr) return '—';
  const now = new Date();
  const date = new Date(dateStr);
  const diff = Math.floor((now - date) / 1000);

  if (diff < 10) return 'Az önce';
  if (diff < 60) return `${diff} sn önce`;
  if (diff < 3600) return `${Math.floor(diff / 60)} dk önce`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} sa önce`;
  return `${Math.floor(diff / 86400)} gün önce`;
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

function formatCpuDescription(cpuDesc) {
  if (!cpuDesc) return '—';
  return cpuDesc
    .replace(/Intel\(R\)\s+Core\(TM\)\s+/gi, '')
    .replace(/\s+CPU\s+@\s+\d+(\.\d+)?\s*GHz/gi, '')
    .replace(/Intel\(R\)\s+/gi, '')
    .replace(/\s+@\s*\d+(\.\d+)?\s*Ghz/gi, '')
    .replace(/\s+@\s*\d+(\.\d+)?\s*GHz/gi, '')
    .trim();
}

function getUsageColor(percent) {
  if (percent === null || percent === undefined) return 'inherit';
  if (percent >= 85) return 'var(--status-offline)';
  if (percent >= 60) return 'var(--status-warning)';
  return 'var(--status-online)';
}

export default function DeviceTable({
  devices = [],
  onEdit,
  onDelete,
  search,
  statusFilter,
  departmentFilter,
  departments = [],
  onSearchChange,
  onStatusFilterChange,
  onDepartmentFilterChange,
  onAddClick,
  onRowClick,
  onImportExcel,
  onExportExcel,
  role
}) {
  const [sortBy, setSortBy] = useState('hostname');
  const [sortOrder, setSortOrder] = useState('asc');
  const fileInputRef = useRef(null);

  const handleImportClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file && onImportExcel) {
      onImportExcel(file);
    }
    e.target.value = '';
  };

  // Metrics summary
  const totalCount = devices.length;
  const onlineCount = devices.filter(d => d.status === 'online').length;
  const offlineCount = devices.filter(d => d.status === 'offline').length;
  const warningCount = devices.filter(d => d.status === 'warning').length;

  // Filter
  const filtered = devices.filter(device => {
    if (statusFilter && statusFilter !== 'all' && device.status !== statusFilter) return false;
    if (departmentFilter && device.department !== departmentFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      const matchHostname = (device.hostname || '').toLowerCase().includes(s);
      const matchIp = (device.ip_address || '').toLowerCase().includes(s);
      const matchUser = (device.username || '').toLowerCase().includes(s);
      if (!matchHostname && !matchIp && !matchUser) return false;
    }
    return true;
  });

  // Sort
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
      return sortOrder === 'asc' ? aVal.localeCompare(bVal, 'tr') : bVal.localeCompare(aVal, 'tr');
    }
    return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
  });

  return (
    <div className="devices-page">
      {/* Top Page Header */}
      <div className="page-header">
        <div className="page-title-group">
          <h1 className="page-title">Cihazlar</h1>
          <p className="page-subtitle">Ağ üzerindeki bilgisayarları ve sunucuları görüntüleyin ve yönetin.</p>
        </div>
        <div className="page-actions">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".xlsx, .xls"
            style={{ display: 'none' }}
          />
          {role !== 'viewer' && (
            <Button variant="secondary" icon={Upload} onClick={handleImportClick}>
              Excel İçe Aktar
            </Button>
          )}
          <Button variant="secondary" icon={Download} onClick={onExportExcel}>
            Excel Dışa Aktar
          </Button>
          {role !== 'viewer' && (
            <Button variant="primary" icon={Plus} onClick={onAddClick}>
              Yeni Cihaz
            </Button>
          )}
        </div>
      </div>

      {/* Top Metric Mini Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '20px' }}>
        <div className="card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '38px', height: '38px', borderRadius: 'var(--radius-md)', backgroundColor: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Monitor size={18} />
          </div>
          <div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.1 }}>{totalCount}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Toplam Cihaz</div>
          </div>
        </div>

        <div className="card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '38px', height: '38px', borderRadius: 'var(--radius-md)', backgroundColor: '#ecfdf5', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CheckCircle2 size={18} />
          </div>
          <div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.1 }}>{onlineCount}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Online</div>
          </div>
        </div>

        <div className="card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '38px', height: '38px', borderRadius: 'var(--radius-md)', backgroundColor: '#fef2f2', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <XCircle size={18} />
          </div>
          <div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.1 }}>{offlineCount}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Offline</div>
          </div>
        </div>

        <div className="card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '38px', height: '38px', borderRadius: 'var(--radius-md)', backgroundColor: '#fffbeb', color: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <AlertTriangle size={18} />
          </div>
          <div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.1 }}>{warningCount}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Uyarı</div>
          </div>
        </div>
      </div>

      {/* Filter Bar & DataTable */}
      <div className="table-wrapper">
        <div className="table-toolbar">
          <div className="table-toolbar-left">
            <div className="search-field">
              <span className="search-field-icon"><Search size={15} /></span>
              <input
                type="text"
                className="search-field-input"
                placeholder="Hostname, IP, Kullanıcı ara..."
                value={search}
                onChange={e => onSearchChange(e.target.value)}
              />
            </div>

            <select
              className="form-select"
              style={{ width: '150px', height: '36px' }}
              value={statusFilter}
              onChange={e => onStatusFilterChange(e.target.value)}
            >
              <option value="all">Tüm Durumlar</option>
              <option value="online">Online</option>
              <option value="offline">Offline</option>
              <option value="warning">Uyarı</option>
            </select>

            <select
              className="form-select"
              style={{ width: '180px', height: '36px' }}
              value={departmentFilter}
              onChange={e => onDepartmentFilterChange(e.target.value)}
            >
              <option value="">Tüm Departmanlar</option>
              {departments.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          <div className="table-toolbar-right" style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>
            Gösterilen: <strong>{sorted.length}</strong> / {devices.length}
          </div>
        </div>

        {sorted.length === 0 ? (
          <div className="empty-state-box">
            <div className="empty-state-icon"><Monitor size={28} /></div>
            <div className="empty-state-title">Eşleşen Cihaz Bulunamadı</div>
            <div className="empty-state-desc">Arama kriterlerinizi değiştirin veya yeni cihaz ekleyin.</div>
          </div>
        ) : (
          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>DURUM</th>
                  <th>CİHAZ ADI</th>
                  <th>IP ADRESİ</th>
                  <th>DEPARTMAN</th>
                  <th>İŞLETİM SİSTEMİ</th>
                  <th>KULLANICI</th>
                  <th>CPU</th>
                  <th>RAM</th>
                  <th>UPTIME</th>
                  <th>PING</th>
                  <th>SON GÖRÜLME</th>
                  <th>AGENT</th>
                  <th style={{ textAlign: 'right' }}>İŞLEMLER</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(device => (
                  <tr
                    key={device.id}
                    className="row-clickable"
                    onClick={() => onRowClick && onRowClick(device)}
                  >
                    <td><StatusBadge status={device.status} /></td>
                    <td>
                      <strong style={{ color: 'var(--primary)' }}>
                        {device.hostname}
                      </strong>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
                      {device.ip_address}
                    </td>
                    <td>{device.department || '—'}</td>
                    <td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      {device.os_name || '—'}
                    </td>
                    <td>{device.username || '—'}</td>
                    <td>
                      {device.cpu_usage !== null && device.cpu_usage !== undefined ? (
                        <span style={{ color: getUsageColor(device.cpu_usage), fontWeight: 600 }}>
                          %{device.cpu_usage}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: '11.5px' }} title={device.cpu_description}>
                          {formatCpuDescription(device.cpu_description)}
                        </span>
                      )}
                    </td>
                    <td>
                      {device.ram_usage !== null && device.ram_usage !== undefined ? (
                        <span style={{ color: getUsageColor(device.ram_usage), fontWeight: 600 }}>
                          %{device.ram_usage}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: '11.5px' }}>
                          {device.ram_mb ? (device.ram_mb >= 1024 ? `${Math.round(device.ram_mb / 1024)} GB` : `${device.ram_mb} MB`) : '—'}
                        </span>
                      )}
                    </td>
                    <td style={{ fontSize: '12px' }}>{formatUptime(device.uptime_seconds)}</td>
                    <td>
                      {device.ping_ms !== null && device.ping_ms !== undefined ? (
                        <span style={{
                          fontWeight: 600,
                          fontSize: '12px',
                          color: device.ping_ms <= 50 ? 'var(--status-online)' : device.ping_ms <= 150 ? 'var(--status-warning)' : 'var(--status-offline)'
                        }}>
                          {device.ping_ms} ms
                        </span>
                      ) : '—'}
                    </td>
                    <td style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                      {getRelativeTime(device.last_seen)}
                    </td>
                    <td>
                      <span className={`status-badge ${device.agent_installed ? 'online' : 'neutral'}`} style={{ fontSize: '11px', padding: '2px 7px' }}>
                        {device.agent_installed ? 'Agent Aktif' : 'Yok'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: 'inline-flex', gap: '4px' }}>
                        {role !== 'viewer' && (
                          <button
                            className="btn-icon btn-ghost btn-xs"
                            onClick={() => onEdit(device)}
                            title="Düzenle"
                          >
                            <Edit2 size={13} />
                          </button>
                        )}
                        {role === 'admin' && (
                          <button
                            className="btn-icon btn-outline-danger btn-xs"
                            onClick={() => onDelete(device)}
                            title="Sil"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
