import { useState, useMemo, useRef } from 'react';
import {
  Printer,
  Search,
  Plus,
  Radio,
  Upload,
  Download,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  FileSpreadsheet,
  Edit2,
  Trash2,
  MoreVertical,
  Activity
} from 'lucide-react';
import StatusBadge from './StatusBadge';
import Button from './ui/Button';
import { useNotification } from './NotificationProvider';
import PrinterDetailModal from './PrinterDetailModal';
import { fetchWithAuth, downloadFileWithAuth } from '../services/api';

function TonerBars({ toners = [] }) {
  if (!toners || toners.length === 0) {
    return <span style={{ color: 'var(--text-muted)', fontSize: '11.5px' }}>Toner bilgisi yok</span>;
  }

  const validToners = toners.filter(t => t && t.color);
  if (validToners.length === 0) {
    return <span style={{ color: 'var(--text-muted)', fontSize: '11.5px' }}>Toner bilgisi yok</span>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '130px' }}>
      {validToners.map((toner, idx) => {
        const percentage = Math.min(100, Math.max(0, (toner.level / (toner.max_capacity || 100)) * 100));
        let barColor = '#2563eb';
        const cLower = toner.color.toLowerCase();
        if (percentage < 10) barColor = 'var(--status-offline)';
        else if (percentage < 25) barColor = 'var(--status-warning)';
        else if (cLower.includes('black') || cLower.includes('siyah') || cLower === 'k') barColor = '#334155';
        else if (cLower.includes('cyan') || cLower.includes('mavi') || cLower === 'c') barColor = '#06b6d4';
        else if (cLower.includes('magenta') || cLower.includes('kırmızı') || cLower === 'm') barColor = '#ec4899';
        else if (cLower.includes('yellow') || cLower.includes('sarı') || cLower === 'y') barColor = '#eab308';

        return (
          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px' }}>
            <span style={{ width: '12px', fontWeight: 700, color: 'var(--text-muted)' }}>
              {toner.color.substring(0, 1).toUpperCase()}
            </span>
            <div style={{
              flex: 1,
              height: '6px',
              backgroundColor: '#f1f5f9',
              borderRadius: '3px',
              overflow: 'hidden'
            }}>
              <div style={{
                height: '100%',
                width: `${percentage}%`,
                backgroundColor: barColor,
                borderRadius: '3px'
              }} />
            </div>
            <span style={{ width: '28px', textAlign: 'right', fontSize: '10.5px', fontWeight: 600, color: percentage < 10 ? 'var(--status-offline)' : 'var(--text-secondary)' }}>
              %{Math.round(percentage)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function PrinterTable({
  printers = [],
  onEdit,
  onDelete,
  search,
  statusFilter,
  onSearchChange,
  onStatusFilterChange,
  onAddClick,
  onRefresh,
  role
}) {
  const { showToast } = useNotification();
  const [sortBy, setSortBy] = useState('description');
  const [sortOrder, setSortOrder] = useState('asc');
  const [selectedPrinter, setSelectedPrinter] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [departmentFilter, setDepartmentFilter] = useState('');
  const fileInputRef = useRef(null);

  const departments = useMemo(() => {
    const depts = [...new Set(printers.map(p => p.department).filter(Boolean))];
    return depts.sort((a, b) => a.localeCompare(b, 'tr'));
  }, [printers]);

  const handleManualScan = async () => {
    try {
      setScanning(true);
      const res = await fetchWithAuth('/api/printers/scan', { method: 'POST' });
      if (!res.ok) throw new Error('Tarama başlatılamadı.');
      showToast('success', '📡 Tarama Başlatıldı', 'Yazıcı taraması arka planda başladı. Sonuçlar birazdan güncellenecektir.');
    } catch (err) {
      showToast('error', '❌ Hata', err.message || 'Bir hata oluştu.');
    } finally {
      setScanning(false);
    }
  };

  const handleExportExcel = async () => {
    try {
      await downloadFileWithAuth('/api/printers/export', 'Yazici_Listesi_Export.xlsx');
      showToast('success', '✅ İndirme Başarılı', 'Yazıcı listesi Excel dosyası indirildi.');
    } catch (err) {
      showToast('error', '❌ Hata', err.message || 'Excel dışa aktarma başarısız.');
    }
  };

  const handleImportExcel = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const base64Data = evt.target.result.split(',')[1];
        const res = await fetchWithAuth('/api/printers/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileData: base64Data })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'İçe aktarım başarısız oldu');
        showToast('success', '✅ Başarılı', `Excel verileri içe aktarıldı. Toplam ${data.count} yazıcı.`);
        if (onRefresh) onRefresh();
      } catch (err) {
        console.error(err);
        showToast('error', '❌ Hata', err.message || 'Excel dosyası yüklenemedi.');
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Metrics summary
  const totalCount = printers.length;
  const onlineCount = printers.filter(p => p.is_online).length;
  const offlineCount = printers.filter(p => !p.is_online).length;
  const jamCount = printers.filter(p => p.has_paper_jam || p.paper_jam).length;

  // Filter
  const filtered = printers.filter(printer => {
    if (statusFilter && statusFilter !== 'all') {
      if (statusFilter === 'online' && !printer.is_online) return false;
      if (statusFilter === 'offline' && printer.is_online) return false;
      if (statusFilter === 'jam' && !printer.has_paper_jam && !printer.paper_jam) return false;
    }
    if (departmentFilter && (printer.department || '') !== departmentFilter) {
      return false;
    }
    if (search) {
      const s = search.toLowerCase();
      const matchName = (printer.name || '').toLowerCase().includes(s);
      const matchIp = (printer.ip_address || '').toLowerCase().includes(s);
      const matchModel = (printer.model || '').toLowerCase().includes(s);
      const matchLocation = (printer.location || '').toLowerCase().includes(s);
      const matchDept = (printer.department || '').toLowerCase().includes(s);
      const matchDesc = (printer.description || '').toLowerCase().includes(s);
      if (!matchName && !matchIp && !matchModel && !matchLocation && !matchDept && !matchDesc) {
        return false;
      }
    }
    return true;
  });

  // Sort
  const sorted = [...filtered].sort((a, b) => {
    let aVal = a[sortBy];
    let bVal = b[sortBy];
    if (aVal === null || aVal === undefined) aVal = '';
    if (bVal === null || bVal === undefined) bVal = '';

    if (typeof aVal === 'string') {
      return sortOrder === 'asc' ? aVal.localeCompare(bVal, 'tr') : bVal.localeCompare(aVal, 'tr');
    }
    return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
  });

  return (
    <div className="printers-page" style={{ marginBottom: '32px' }}>
      {/* Page Header */}
      <div className="page-header">
        <div className="page-title-group">
          <h1 className="page-title">Yazıcı Yönetimi</h1>
          <p className="page-subtitle">Ağ yazıcılarını, toner durumlarını ve kağıt alarmlarını takip edin.</p>
        </div>
        <div className="page-actions">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImportExcel}
            accept=".xlsx, .xls"
            style={{ display: 'none' }}
          />
          {role !== 'viewer' && (
            <Button
              variant="secondary"
              icon={Radio}
              onClick={handleManualScan}
              disabled={scanning}
            >
              {scanning ? 'Taranıyor...' : 'Ağ Taraması Yap'}
            </Button>
          )}
          {role !== 'viewer' && (
            <Button
              variant="secondary"
              icon={Upload}
              onClick={() => fileInputRef.current?.click()}
            >
              Excel İçe Aktar
            </Button>
          )}
          <Button variant="secondary" icon={Download} onClick={handleExportExcel}>
            Excel Dışa Aktar
          </Button>
          {role !== 'viewer' && (
            <Button variant="primary" icon={Plus} onClick={onAddClick}>
              Yeni Yazıcı
            </Button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '20px' }}>
        <div className="card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '38px', height: '38px', borderRadius: 'var(--radius-md)', backgroundColor: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Printer size={18} />
          </div>
          <div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.1 }}>{totalCount}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Toplam Yazıcı</div>
          </div>
        </div>

        <div className="card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '38px', height: '38px', borderRadius: 'var(--radius-md)', backgroundColor: '#ecfdf5', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CheckCircle2 size={18} />
          </div>
          <div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.1 }}>{onlineCount}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Çevrimiçi</div>
          </div>
        </div>

        <div className="card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '38px', height: '38px', borderRadius: 'var(--radius-md)', backgroundColor: '#fef2f2', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <XCircle size={18} />
          </div>
          <div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.1 }}>{offlineCount}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Çevrimdışı</div>
          </div>
        </div>

        <div className="card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '38px', height: '38px', borderRadius: 'var(--radius-md)', backgroundColor: '#fffbeb', color: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <AlertTriangle size={18} />
          </div>
          <div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.1 }}>{jamCount}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Kağıt Sıkışması</div>
          </div>
        </div>
      </div>

      {/* Table Section */}
      <div className="table-wrapper">
        <div className="table-toolbar">
          <div className="table-toolbar-left">
            <div className="search-field">
              <span className="search-field-icon"><Search size={15} /></span>
              <input
                type="text"
                className="search-field-input"
                placeholder="Yazıcı adı, IP, Model, Konum ara..."
                value={search}
                onChange={e => onSearchChange(e.target.value)}
              />
            </div>

            <select
              className="form-select"
              style={{ width: '160px', height: '36px' }}
              value={statusFilter}
              onChange={e => onStatusFilterChange(e.target.value)}
            >
              <option value="all">Tüm Durumlar</option>
              <option value="online">Çevrimiçi</option>
              <option value="offline">Çevrimdışı</option>
              <option value="jam">Kağıt Sıkışması</option>
            </select>

            <select
              className="form-select"
              style={{ width: '180px', height: '36px' }}
              value={departmentFilter}
              onChange={e => setDepartmentFilter(e.target.value)}
            >
              <option value="">Tüm Departmanlar</option>
              {departments.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          <div className="table-toolbar-right" style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>
            Toplam: <strong>{sorted.length}</strong> yazıcı
          </div>
        </div>

        {sorted.length === 0 ? (
          <div className="empty-state-box">
            <div className="empty-state-icon"><Printer size={28} /></div>
            <div className="empty-state-title">Yazıcı Bulunamadı</div>
            <div className="empty-state-desc">Arama filtrelerini değiştirin veya yeni bir yazıcı tanımlayın.</div>
          </div>
        ) : (
          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>DURUM</th>
                  <th>AÇIKLAMA / AD</th>
                  <th>IP ADRESİ</th>
                  <th>LOKASYON</th>
                  <th>BÖLÜM</th>
                  <th>TONER SEVİYELERİ</th>
                  <th>TOPLAM SAYFA</th>
                  <th>KAĞIT DURUMU</th>
                  <th style={{ textAlign: 'right' }}>İŞLEMLER</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(printer => (
                  <tr
                    key={printer.id}
                    className="row-clickable"
                    onClick={() => setSelectedPrinter(printer)}
                  >
                    <td>
                      <StatusBadge status={printer.is_online ? 'online' : 'offline'} />
                    </td>
                    <td>
                      <div>
                        <strong style={{ color: 'var(--primary)' }}>
                          {printer.description || printer.name || 'İsimsiz Yazıcı'}
                        </strong>
                        {printer.model && (
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            {printer.model}
                          </div>
                        )}
                      </div>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
                      {printer.ip_address}
                    </td>
                    <td>{printer.location || '—'}</td>
                    <td>{printer.department || '—'}</td>
                    <td><TonerBars toners={printer.toners} /></td>
                    <td style={{ fontWeight: 600, fontSize: '12.5px' }}>
                      {printer.total_page_count ? Number(printer.total_page_count).toLocaleString('tr-TR') : '—'}
                    </td>
                    <td>
                      {printer.has_paper_jam || printer.paper_jam ? (
                        <span className="badge" style={{ backgroundColor: 'var(--status-offline-bg)', color: 'var(--status-offline)', border: '1px solid var(--status-offline-border)', fontSize: '11px' }}>
                          ⚠️ Sıkışma Var
                        </span>
                      ) : (
                        <span className="badge" style={{ backgroundColor: 'var(--status-online-bg)', color: 'var(--status-online)', border: '1px solid var(--status-online-border)', fontSize: '11px' }}>
                          Hazır
                        </span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'inline-flex', gap: '4px' }}>
                        {role !== 'viewer' && (
                          <button
                            className="btn-icon btn-ghost btn-xs"
                            onClick={() => onEdit && onEdit(printer)}
                            title="Düzenle"
                          >
                            <Edit2 size={13} />
                          </button>
                        )}
                        {role === 'admin' && (
                          <button
                            className="btn-icon btn-outline-danger btn-xs"
                            onClick={() => onDelete && onDelete(printer)}
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

      {/* Printer Detail Modal */}
      {selectedPrinter && (
        <PrinterDetailModal
          printer={selectedPrinter}
          onClose={() => setSelectedPrinter(null)}
          onRefresh={onRefresh}
          role={role}
        />
      )}
    </div>
  );
}
