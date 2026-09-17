import { useState, useEffect, useRef } from 'react';
import { Search, Monitor, Printer, Phone, Wrench, X, ArrowRight } from 'lucide-react';
import StatusBadge from '../StatusBadge';

export default function GlobalSearchModal({
  isOpen,
  onClose,
  devices = [],
  printers = [],
  onSelectDevice,
  onSelectPrinter,
  onNavigateTab
}) {
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        if (isOpen) onClose();
        else {
          // Open handled from outside
        }
      }
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const q = query.trim().toLowerCase();

  const filteredDevices = q
    ? devices.filter(d =>
        (d.hostname || '').toLowerCase().includes(q) ||
        (d.ip_address || '').toLowerCase().includes(q) ||
        (d.username || '').toLowerCase().includes(q) ||
        (d.department || '').toLowerCase().includes(q)
      ).slice(0, 5)
    : [];

  const filteredPrinters = q
    ? printers.filter(p =>
        (p.name || '').toLowerCase().includes(q) ||
        (p.ip_address || '').toLowerCase().includes(q) ||
        (p.location || '').toLowerCase().includes(q)
      ).slice(0, 4)
    : [];

  const totalResults = filteredDevices.length + filteredPrinters.length;

  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-dialog" style={{ maxWidth: '640px', padding: 0, overflow: 'hidden' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '16px 20px',
          borderBottom: '1px solid var(--border)'
        }}>
          <Search size={20} color="var(--text-muted)" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Cihaz, IP, Kullanıcı, Yazıcı veya Departman ara..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{
              border: 'none',
              outline: 'none',
              fontSize: '15px',
              fontFamily: 'var(--font-family)',
              color: 'var(--text-primary)',
              width: '100%',
              background: 'transparent'
            }}
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
            >
              <X size={16} />
            </button>
          )}
        </div>

        <div style={{ maxHeight: '380px', overflowY: 'auto', padding: '12px' }}>
          {!query && (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: '13px', marginBottom: '8px' }}>Hızlı Arama İpuçları</div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span className="badge neutral">Bilgisayar adı</span>
                <span className="badge neutral">10.0.70.x</span>
                <span className="badge neutral">Departman</span>
                <span className="badge neutral">Yazıcı modeli</span>
              </div>
            </div>
          )}

          {query && totalResults === 0 && (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <strong>"{query}"</strong> ile eşleşen sonuç bulunamadı.
            </div>
          )}

          {filteredDevices.length > 0 && (
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', padding: '4px 10px' }}>
                Ağ Cihazları ({filteredDevices.length})
              </div>
              {filteredDevices.map(device => (
                <div
                  key={device.id}
                  onClick={() => {
                    if (onSelectDevice) onSelectDevice(device);
                    onClose();
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 12px',
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                    transition: 'background var(--transition-fast)'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-muted)'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: 'var(--radius-md)',
                      backgroundColor: 'var(--primary-light)',
                      color: 'var(--primary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <Monitor size={16} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '13.5px', color: 'var(--text-primary)' }}>
                        {device.hostname}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        {device.ip_address} • {device.department || 'Genel'} {device.username ? `(${device.username})` : ''}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <StatusBadge status={device.status} />
                    <ArrowRight size={14} color="var(--text-muted)" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {filteredPrinters.length > 0 && (
            <div>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', padding: '4px 10px' }}>
                Yazıcılar ({filteredPrinters.length})
              </div>
              {filteredPrinters.map(printer => (
                <div
                  key={printer.id}
                  onClick={() => {
                    if (onSelectPrinter) onSelectPrinter(printer);
                    onClose();
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 12px',
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                    transition: 'background var(--transition-fast)'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-muted)'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: 'var(--radius-md)',
                      backgroundColor: '#eff6ff',
                      color: '#2563eb',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <Printer size={16} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '13.5px', color: 'var(--text-primary)' }}>
                        {printer.name}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        {printer.ip_address} • {printer.location || 'Lokasyon Belirtilmemiş'}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <StatusBadge status={printer.is_online ? 'online' : 'offline'} />
                    <ArrowRight size={14} color="var(--text-muted)" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{
          padding: '10px 16px',
          background: 'var(--bg-subtle)',
          borderTop: '1px solid var(--border-light)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '11.5px',
          color: 'var(--text-muted)'
        }}>
          <div>Seçmek için tıklayın • Kapatmak için <strong>ESC</strong></div>
          <div>Global Arama</div>
        </div>
      </div>
    </div>
  );
}
