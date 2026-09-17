import { useState, useEffect } from 'react';
import { Monitor } from 'lucide-react';
import Modal from './ui/Modal';
import Button from './ui/Button';

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
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Cihazı Düzenle' : 'Yeni Cihaz Ekle'}
      subtitle={isEditing ? `${device.hostname} (${device.ip_address})` : 'Ağa yeni izlenebilir cihaz tanımlayın.'}
      icon={Monitor}
      maxWidth="620px"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            İptal
          </Button>
          <Button variant="primary" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Kaydediliyor...' : 'Kaydet'}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit}>
        {error && (
          <div style={{
            padding: '10px 14px',
            backgroundColor: 'var(--status-offline-bg)',
            color: 'var(--status-offline)',
            border: '1px solid var(--status-offline-border)',
            borderRadius: 'var(--radius-md)',
            marginBottom: '16px',
            fontSize: '13px'
          }}>
            {error}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div className="form-group">
            <label className="form-label required" htmlFor="hostname">Bilgisayar Adı (Hostname)</label>
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
            <label className="form-label required" htmlFor="ip_address">IP Adresi</label>
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
              <span className="form-hint">Agent kurulu cihazlarda IP sabittir.</span>
            )}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
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
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div className="form-group">
            <label className="form-label" htmlFor="os_name">İşletim Sistemi</label>
            <input
              type="text"
              id="os_name"
              name="os_name"
              className="form-input"
              value={formData.os_name}
              onChange={handleChange}
              placeholder="Windows 11 Pro"
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
          <label className="form-label" htmlFor="notes">Notlar & Açıklama</label>
          <textarea
            id="notes"
            name="notes"
            className="form-textarea"
            value={formData.notes}
            onChange={handleChange}
            placeholder="Cihaz veya kullanıcı hakkında özel notlar..."
            rows="3"
          />
        </div>
      </form>
    </Modal>
  );
}
