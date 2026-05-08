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

function TonerBars({ toners }) {
  if (!toners || toners.length === 0) return <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Toner bilgisi yok</span>;

  // Filter out null values in case json_agg includes a null entry
  const validToners = toners.filter(t => t && t.color);
  if (validToners.length === 0) return <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Toner bilgisi yok</span>;

  return (
    <div className="toner-group">
      {validToners.map((toner, idx) => {
        const percentage = Math.min(100, Math.max(0, (toner.level / (toner.max_capacity || 100)) * 100));
        let barColor = 'var(--accent-blue)';
        if (percentage < 10) barColor = 'var(--status-offline)';
        else if (percentage < 25) barColor = 'var(--status-warning)';
        else if (toner.color.toLowerCase().includes('black')) barColor = '#475569';
        else if (toner.color.toLowerCase().includes('cyan')) barColor = '#06b6d4';
        else if (toner.color.toLowerCase().includes('magenta')) barColor = '#ec4899';
        else if (toner.color.toLowerCase().includes('yellow')) barColor = '#eab308';

        return (
          <div key={idx} className="toner-bar-container" title={`${toner.color}: ${toner.level} / ${toner.max_capacity || 100}`}>
            <span className="toner-label">{toner.color.substring(0, 1).toUpperCase()}</span>
            <div className="toner-bar">
              <div 
                className={`toner-bar-fill ${percentage < 10 ? 'toner-critical' : ''}`}
                style={{ width: `${percentage}%`, backgroundColor: barColor }}
              ></div>
            </div>
            <span style={{ fontSize: '10px', width: '24px', textAlign: 'right' }}>{Math.round(percentage)}%</span>
          </div>
        );
      })}
    </div>
  );
}

const COLUMNS = [
  { key: 'status', label: 'Durum', sortable: true },
  { key: 'name', label: 'Yazıcı Adı', sortable: true },
  { key: 'ip_address', label: 'IP Adresi', sortable: true },
  { key: 'model', label: 'Model', sortable: true },
  { key: 'toners', label: 'Toner Seviyeleri', sortable: false },
  { key: 'jam', label: 'Kağıt Sıkışması', sortable: true },
  { key: 'total_page_count', label: 'Toplam Sayfa', sortable: true },
  { key: 'last_updated', label: 'Son Güncelleme', sortable: true },
  { key: 'actions', label: 'İşlemler', sortable: false },
];

export default function PrinterTable({ printers, onEdit, onDelete, search, statusFilter, onSearchChange, onStatusFilterChange, onAddClick }) {
  const [sortBy, setSortBy] = useState('name');
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
  const filtered = printers.filter(printer => {
    // Durum filtresi
    if (statusFilter && statusFilter !== 'all') {
      if (statusFilter === 'online' && !printer.is_online) return false;
      if (statusFilter === 'offline' && printer.is_online) return false;
      if (statusFilter === 'jam' && !printer.has_paper_jam) return false;
    }
    // Arama filtresi (ad, IP, model)
    if (search) {
      const s = search.toLowerCase();
      const matchName = (printer.name || '').toLowerCase().includes(s);
      const matchIp = (printer.ip_address || '').toLowerCase().includes(s);
      const matchModel = (printer.model || '').toLowerCase().includes(s);
      if (!matchName && !matchIp && !matchModel) {
        return false;
      }
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    let aVal = a[sortBy];
    let bVal = b[sortBy];
    
    if (sortBy === 'status') {
      aVal = a.is_online ? 1 : 0;
      bVal = b.is_online ? 1 : 0;
    } else if (sortBy === 'jam') {
      aVal = a.has_paper_jam ? 1 : 0;
      bVal = b.has_paper_jam ? 1 : 0;
    } else if (sortBy === 'last_updated') {
      aVal = new Date(a.last_updated || 0).getTime();
      bVal = new Date(b.last_updated || 0).getTime();
    } else if (sortBy === 'total_page_count') {
      aVal = parseInt(a.total_page_count) || 0;
      bVal = parseInt(b.total_page_count) || 0;
    }

    if (aVal === null || aVal === undefined) aVal = '';
    if (bVal === null || bVal === undefined) bVal = '';

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
              placeholder="Yazıcı ara (ad, IP, model)..."
              value={search}
              onChange={e => onSearchChange(e.target.value)}
              id="printer-search"
            />
          </div>
          <select
            className="filter-select"
            value={statusFilter}
            onChange={e => onStatusFilterChange(e.target.value)}
            id="printer-status-filter"
          >
            <option value="all">Tüm Durumlar</option>
            <option value="online">Online</option>
            <option value="offline">Offline</option>
            <option value="jam">Kağıt Sıkışması (Jam)</option>
          </select>
        </div>
        <button className="btn btn-primary" onClick={onAddClick} id="add-printer-btn">
          <span>➕</span> Yazıcı Ekle
        </button>
      </div>

      <div className="table-container">
        {sorted.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🖨️</div>
            <div className="empty-title">Henüz yazıcı eklenmemiş</div>
            <div className="empty-text">Ağa bağlı yazıcılarınızı ekleyerek takip etmeye başlayın</div>
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
              {sorted.map(printer => (
                <tr key={printer.id} className={printer.is_online ? 'status-online' : 'status-offline'}>
                  <td>
                    <StatusBadge status={printer.is_online ? 'online' : 'offline'} />
                    <div style={{ fontSize: '11px', marginTop: '4px', color: 'var(--text-muted)' }}>
                      {printer.printer_status}
                    </div>
                  </td>
                  <td><strong>{printer.name}</strong></td>
                  <td style={{ fontFamily: 'monospace' }}>{printer.ip_address}</td>
                  <td>{printer.model || '—'}</td>
                  <td>
                    <TonerBars toners={printer.toners} />
                  </td>
                  <td>
                    <span className={`jam-indicator ${printer.has_paper_jam ? 'has-jam' : 'no-jam'}`}>
                      {printer.has_paper_jam ? '⚠️ Sıkışma Var' : '✅ Sorunsuz'}
                    </span>
                  </td>
                  <td style={{ fontFamily: 'monospace', fontSize: '13px' }}>
                    {printer.total_page_count?.toLocaleString('tr-TR') || '0'}
                  </td>
                  <td>
                    <span className="relative-time">{getRelativeTime(printer.last_updated)}</span>
                  </td>
                  <td>
                    <div className="action-buttons">
                      <button
                        className="action-btn"
                        onClick={() => onEdit(printer)}
                        title="Düzenle"
                      >
                        ✏️
                      </button>
                      <button
                        className="action-btn delete"
                        onClick={() => onDelete(printer)}
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
