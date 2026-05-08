import { useState, useEffect } from 'react';

export default function DeviceModal({ isOpen, onClose, device, onSave }) {
  const isEditing = !!device;
  const [formData, setFormData] = useState({
    hostname: '',
    ip_address: '',
    mac_address: '',
    department: '',
    os_name: '',
    username: '',
    notes: ''
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen) {
      if (device) {
        setFormData({
          hostname: device.hostname || '',
          ip_address: device.ip_address || '',
          mac_address: device.mac_address || '',
          department: device.department || '',
          os_name: device.os_name || '',
          username: device.username || '',
          notes: device.notes || ''
        });
      } else {
        setFormData({
          hostname: '',
          ip_address: '',
          mac_address: '',
          department: '',
          os_name: '',
          username: '',
          notes: ''
        });
      }
      setError(null);
    }
  }, [isOpen, device]);

  if (!isOpen) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setError(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.hostname || !formData.ip_address) {
      setError('Hostname ve IP Adresi zorunludur.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await onSave(formData);
      onClose();
    } catch (err) {
      setError(err.message || 'Bir hata oluştu');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <div className="modal-header">
          <h2 className="modal-title">{isEditing ? 'Cihazı Düzenle' : 'Yeni Cihaz Ekle'}</h2>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && (
              <div style={{ padding: '10px 14px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', borderLeft: '3px solid #ef4444', borderRadius: '4px', marginBottom: '16px', fontSize: '14px' }}>
                {error}
              </div>
            )}

            <div className="form-row">
              <div className="form-group">
                <label className="form-label" htmlFor="hostname">Bilgisayar Adı (Hostname) *</label>
                <input
                  type="text"
                  id="hostname"
                  name="hostname"
                  className="form-input"
                  value={formData.hostname}
                  onChange={handleChange}
                  placeholder="PC-MUHASEBE-01"
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="ip_address">IP Adresi *</label>
                <input
                  type="text"
                  id="ip_address"
                  name="ip_address"
                  className="form-input"
                  value={formData.ip_address}
                  onChange={handleChange}
                  placeholder="192.168.1.100"
                  required
                  disabled={isEditing && device.agent_installed}
                />
                {isEditing && device.agent_installed && (
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                    Agent kurulu cihazlarda IP değiştirilemez.
                  </div>
                )}
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label" htmlFor="mac_address">MAC Adresi</label>
                <input
                  type="text"
                  id="mac_address"
                  name="mac_address"
                  className="form-input"
                  value={formData.mac_address}
                  onChange={handleChange}
                  placeholder="AA:BB:CC:DD:EE:FF"
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="department">Departman</label>
                <input
                  type="text"
                  id="department"
                  name="department"
                  className="form-input"
                  value={formData.department}
                  onChange={handleChange}
                  placeholder="Muhasebe, İK, Üretim..."
                  list="department-list"
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label" htmlFor="os_name">İşletim Sistemi</label>
                <input
                  type="text"
                  id="os_name"
                  name="os_name"
                  className="form-input"
                  value={formData.os_name}
                  onChange={handleChange}
                  placeholder="Windows 10 Pro"
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="username">Kullanıcı Adı</label>
                <input
                  type="text"
                  id="username"
                  name="username"
                  className="form-input"
                  value={formData.username}
                  onChange={handleChange}
                  placeholder="ahmet.yilmaz"
                />
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" htmlFor="notes">Notlar</label>
              <textarea
                id="notes"
                name="notes"
                className="form-input"
                value={formData.notes}
                onChange={handleChange}
                placeholder="Cihaz hakkında ek bilgiler..."
                rows="3"
                style={{ resize: 'vertical' }}
              />
            </div>

          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
              İptal
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Kaydediliyor...' : 'Kaydet'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
