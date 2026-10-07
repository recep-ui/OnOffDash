import { useEffect, useState } from 'react';
import { Printer, Activity, Wrench, AlertTriangle, CheckCircle2, FileText, Edit2, RefreshCw } from 'lucide-react';
import StatusBadge from './StatusBadge';
import Modal from './ui/Modal';
import Button from './ui/Button';
import { fetchWithAuth } from '../services/api';

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

function getTonerDisplayMeta(colorStr) {
  const c = (colorStr || '').toString().trim().toLowerCase();
  if (c.includes('black') || c.includes('siyah') || c.includes('schwarz') || c.includes('noir') || c === 'k' || c === 'bk' || /(?:tk|crg|tn|cf)[-_0-9]+k\b/i.test(c) || c.endsWith('k')) {
    return { label: 'K', baseColor: '#334155', name: 'Siyah' };
  }
  if (c.includes('cyan') || c.includes('mavi') || c.includes('gök') || c.includes('cam') || c === 'c' || c === 'cyn' || /(?:tk|crg|tn|cf)[-_0-9]+c\b/i.test(c) || c.endsWith('c')) {
    return { label: 'C', baseColor: '#06b6d4', name: 'Mavi (Cyan)' };
  }
  if (c.includes('magenta') || c.includes('macenta') || c.includes('kırmızı') || c.includes('kirmizi') || c.includes('pembe') || c === 'm' || c === 'mag' || /(?:tk|crg|tn|cf)[-_0-9]+m\b/i.test(c) || c.endsWith('m')) {
    return { label: 'M', baseColor: '#ec4899', name: 'Kırmızı (Magenta)' };
  }
  if (c.includes('yellow') || c.includes('sarı') || c.includes('sari') || c.includes('gelb') || c.includes('jaune') || c === 'y' || c === 'yel' || /(?:tk|crg|tn|cf)[-_0-9]+y\b/i.test(c) || c.endsWith('y')) {
    return { label: 'Y', baseColor: '#eab308', name: 'Sarı (Yellow)' };
  }
  return { label: colorStr ? colorStr.substring(0, 2).toUpperCase() : 'T', baseColor: '#2563eb', name: colorStr || 'Toner' };
}

export default function PrinterDetailModal({ printer, onClose, onEdit, role, onRefresh }) {
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [scanStatus, setScanStatus] = useState(null);

  useEffect(() => {
    if (!printer?.id) return;
    setLoading(true);
    fetchWithAuth(`/api/printers/${printer.id}`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to load printer details');
        return res.json();
      })
      .then(data => {
        setDetails(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Error fetching printer details:', err);
        setLoading(false);
      });
  }, [printer?.id]);

  useEffect(() => {
    if (printer) {
      setDetails(prev => ({ ...(prev || {}), ...printer }));
    }
  }, [printer]);

  const handleScan = async () => {
    if (!printer?.id || refreshing) return;
    setRefreshing(true);
    setScanStatus(null);
    try {
      const res = await fetchWithAuth(`/api/printers/${printer.id}/scan`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Tarama başlatılamadı');
      if (data.printer) {
        setDetails(data.printer);
        setScanStatus({ type: 'success', text: 'Toner seviyeleri ve durum güncellendi.' });
        if (typeof onRefresh === 'function') {
          onRefresh();
        }
      }
    } catch (err) {
      console.error('Scan error:', err);
      setScanStatus({ type: 'error', text: err.message || 'Tarama başarısız.' });
    } finally {
      setRefreshing(false);
    }
  };

  if (!printer) return null;

  const p = details || printer;

  return (
    <Modal
      isOpen={!!printer}
      onClose={onClose}
      title={p.name || 'Yazıcı Detayları'}
      subtitle={`IP: ${p.ip_address} • Model: ${p.model || 'Bilinmiyor'}`}
      icon={Printer}
      maxWidth="720px"
      footer={
        <>
          {role !== 'viewer' && (
            <Button
              variant="secondary"
              icon={RefreshCw}
              disabled={refreshing}
              onClick={handleScan}
              style={{ marginRight: onEdit ? '8px' : 'auto' }}
            >
              {refreshing ? 'Taranıyor...' : 'Toner / Durum Tara'}
            </Button>
          )}
          {onEdit && role !== 'viewer' && (
            <Button
              variant="secondary"
              icon={Edit2}
              onClick={() => { onEdit(p); onClose(); }}
              style={{ marginRight: 'auto' }}
            >
              Düzenle
            </Button>
          )}
          <Button variant="primary" onClick={onClose}>
            Kapat
          </Button>
        </>
      }
    >
      {scanStatus && (
        <div style={{
          padding: '8px 12px',
          marginBottom: '12px',
          borderRadius: 'var(--radius-sm)',
          fontSize: '12.5px',
          fontWeight: 500,
          backgroundColor: scanStatus.type === 'success' ? 'var(--status-online-bg)' : 'var(--status-offline-bg)',
          color: scanStatus.type === 'success' ? 'var(--status-online-text)' : 'var(--status-offline-text)',
          border: `1px solid ${scanStatus.type === 'success' ? 'var(--status-online-border)' : 'var(--status-offline-border)'}`
        }}>
          {scanStatus.text}
        </div>
      )}
      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
          Veriler yükleniyor...
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Status Alert Banner */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px 16px',
            backgroundColor: p.is_online ? 'var(--status-online-bg)' : 'var(--status-offline-bg)',
            border: `1px solid ${p.is_online ? 'var(--status-online-border)' : 'var(--status-offline-border)'}`,
            borderRadius: 'var(--radius-md)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <StatusBadge status={p.is_online ? 'online' : 'offline'} />
              <span style={{ fontWeight: 600, fontSize: '13.5px', color: p.is_online ? 'var(--status-online-text)' : 'var(--status-offline-text)' }}>
                {p.is_online ? `Çevrimiçi (${p.printer_status || 'Hazır'})` : 'Çevrimdışı'}
              </span>
            </div>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Son Güncelleme: {getRelativeTime(p.last_updated)}
            </span>
          </div>

          {/* Grid: Specs & SNMP Status */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            {/* Inventory Card */}
            <div className="card" style={{ padding: '16px' }}>
              <div style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Wrench size={15} color="#2563eb" /> Envanter & Donanım
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Yazıcı Konumu:</span>
                  <strong>{p.location || '—'}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Bölüm:</span>
                  <strong>{p.department || '—'}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Yazdırma Türü:</span>
                  <strong>{p.print_type || '—'}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Seri Numarası:</span>
                  <strong style={{ fontFamily: 'var(--font-mono)' }}>{p.serial_no || '—'}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Toner Modeli:</span>
                  <strong>{p.toner_model || '—'}</strong>
                </div>
              </div>
            </div>

            {/* SNMP Live Stats */}
            <div className="card" style={{ padding: '16px' }}>
              <div style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Activity size={15} color="#10b981" /> SNMP & Canlı Durum
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Model:</span>
                  <strong>{p.model || '—'}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Kağıt Durumu:</span>
                  <span>
                    {p.has_paper_jam ? (
                      <span className="badge" style={{ backgroundColor: 'var(--status-offline-bg)', color: 'var(--status-offline)', border: '1px solid var(--status-offline-border)', fontSize: '11px' }}>
                        ⚠️ Sıkışma Var
                      </span>
                    ) : (
                      <span className="badge online" style={{ fontSize: '11px' }}>Hazır</span>
                    )}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Hata Mesajı:</span>
                  <span style={{ color: p.error_message ? 'var(--status-offline)' : 'inherit', fontWeight: p.error_message ? 600 : 'normal' }}>
                    {p.error_message || 'Yok'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Toplam Sayfa Sayacı:</span>
                  <strong style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', color: '#2563eb' }}>
                    {p.total_page_count ? Number(p.total_page_count).toLocaleString('tr-TR') : '0'}
                  </strong>
                </div>
              </div>
            </div>
          </div>

          {/* Toner Levels Section */}
          <div className="card" style={{ padding: '16px' }}>
            <div style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '14px' }}>
              🎨 Toner Kartuş Seviyeleri
            </div>

            {!p.toners || p.toners.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px', padding: '12px' }}>
                Bu cihaz için henüz toner seviye bilgisi okunmadı.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {p.toners.filter(t => t && t.color).map((toner, idx) => {
                  const maxCap = toner.max_capacity || toner.maxCapacity || 100;
                  const percentage = Math.min(100, Math.max(0, (toner.level / maxCap) * 100));
                  const meta = getTonerDisplayMeta(toner.color);
                  let barColor = meta.baseColor;
                  if (percentage < 10) barColor = 'var(--status-offline)';
                  else if (percentage < 25) barColor = 'var(--status-warning)';

                  return (
                    <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                        <strong style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: barColor }} />
                          {toner.color} <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>({meta.name})</span>
                        </strong>
                        <span style={{ color: 'var(--text-secondary)' }}>
                          {toner.level} / {maxCap} (%{Math.round(percentage)})
                        </span>
                      </div>
                      <div style={{ height: '7px', width: '100%', backgroundColor: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{
                          width: `${percentage}%`,
                          height: '100%',
                          backgroundColor: barColor,
                          borderRadius: '4px',
                          transition: 'width 0.4s ease'
                        }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
