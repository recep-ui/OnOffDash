import { useEffect, useState } from 'react';
import { Printer, Activity, Wrench, AlertTriangle, CheckCircle2, FileText, Edit2 } from 'lucide-react';
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

export default function PrinterDetailModal({ printer, onClose, onEdit, role }) {
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);

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
                  const percentage = Math.min(100, Math.max(0, (toner.level / (toner.max_capacity || 100)) * 100));
                  let barColor = '#2563eb';
                  const cLower = toner.color.toLowerCase();
                  if (percentage < 10) barColor = 'var(--status-offline)';
                  else if (percentage < 25) barColor = 'var(--status-warning)';
                  else if (cLower.includes('black') || cLower.includes('siyah')) barColor = '#334155';
                  else if (cLower.includes('cyan') || cLower.includes('mavi')) barColor = '#06b6d4';
                  else if (cLower.includes('magenta') || cLower.includes('kırmızı')) barColor = '#ec4899';
                  else if (cLower.includes('yellow') || cLower.includes('sarı')) barColor = '#eab308';

                  return (
                    <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                        <strong style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: barColor }} />
                          {toner.color}
                        </strong>
                        <span style={{ color: 'var(--text-secondary)' }}>
                          {toner.level} / {toner.max_capacity || 100} (%{Math.round(percentage)})
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
