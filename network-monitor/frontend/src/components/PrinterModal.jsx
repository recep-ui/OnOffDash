import { useState, useEffect } from 'react';
import { Printer, Plus, Trash2 } from 'lucide-react';
import Modal from './ui/Modal';
import Button from './ui/Button';

export default function PrinterModal({ isOpen, onClose, printer, onSave }) {
  const isEditing = !!printer;
  const [formData, setFormData] = useState({
    name: '',
    ip_address: '',
    model: '',
    location: '',
    department: '',
    description: '',
    print_type: '',
    serial_no: '',
    toner_model: '',
    toners: []
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen) {
      if (printer) {
        setFormData({
          name: printer.name || '',
          ip_address: printer.ip_address || '',
          model: printer.model || '',
          location: printer.location || '',
          department: printer.department || '',
          description: printer.description || '',
          print_type: printer.print_type || '',
          serial_no: printer.serial_no || '',
          toner_model: printer.toner_model || '',
          toners: printer.toners ? [...printer.toners].filter(t => t && t.color) : []
        });
      } else {
        setFormData({
          name: '',
          ip_address: '',
          model: '',
          location: '',
          department: '',
          description: '',
          print_type: '',
          serial_no: '',
          toner_model: '',
          toners: [
            { color: 'Black', level: 100, max_capacity: 100 },
            { color: 'Cyan', level: 100, max_capacity: 100 },
            { color: 'Magenta', level: 100, max_capacity: 100 },
            { color: 'Yellow', level: 100, max_capacity: 100 }
          ]
        });
      }
      setError(null);
    }
  }, [isOpen, printer]);

  if (!isOpen) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setError(null);
  };

  const handleTonerChange = (index, field, value) => {
    setFormData(prev => {
      const newToners = [...prev.toners];
      newToners[index] = { ...newToners[index], [field]: field === 'color' ? value : parseInt(value) || 0 };
      return { ...prev, toners: newToners };
    });
  };

  const addToner = () => {
    setFormData(prev => ({
      ...prev,
      toners: [...prev.toners, { color: '', level: 100, max_capacity: 100 }]
    }));
  };

  const removeToner = (index) => {
    setFormData(prev => ({
      ...prev,
      toners: prev.toners.filter((_, i) => i !== index)
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.ip_address) {
      setError('Yazıcı Adı ve IP Adresi zorunludur.');
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
      title={isEditing ? 'Yazıcıyı Düzenle' : 'Yeni Yazıcı Ekle'}
      subtitle={isEditing ? `${printer.name} (${printer.ip_address})` : 'Ağa yeni izlenebilir ağ yazıcısı ekleyin.'}
      icon={Printer}
      maxWidth="680px"
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
            <label className="form-label required" htmlFor="name">Yazıcı Adı</label>
            <input
              type="text"
              id="name"
              name="name"
              className="form-input"
              value={formData.name}
              onChange={handleChange}
              placeholder="Muhasebe Yazıcısı"
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
              placeholder="192.168.1.55"
              required
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div className="form-group">
            <label className="form-label" htmlFor="model">Model</label>
            <input
              type="text"
              id="model"
              name="model"
              className="form-input"
              value={formData.model}
              onChange={handleChange}
              placeholder="HP LaserJet Enterprise M404"
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="location">Konum / Oda</label>
            <input
              type="text"
              id="location"
              name="location"
              className="form-input"
              value={formData.location}
              onChange={handleChange}
              placeholder="2. Kat Muhasebe Ofisi"
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
          <div className="form-group">
            <label className="form-label" htmlFor="department">Bölüm / Departman</label>
            <input
              type="text"
              id="department"
              name="department"
              className="form-input"
              value={formData.department}
              onChange={handleChange}
              placeholder="Muhasebe"
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="print_type">Yazdırma Türü</label>
            <input
              type="text"
              id="print_type"
              name="print_type"
              className="form-input"
              value={formData.print_type}
              onChange={handleChange}
              placeholder="Renkli Lazer / Siyah Beyaz"
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="toner_model">Toner Modeli</label>
            <input
              type="text"
              id="toner_model"
              name="toner_model"
              className="form-input"
              value={formData.toner_model}
              onChange={handleChange}
              placeholder="CF280A"
            />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="description">Açıklama / Notlar</label>
          <input
            type="text"
            id="description"
            name="description"
            className="form-input"
            value={formData.description}
            onChange={handleChange}
            placeholder="Açıklama veya ek bilgiler..."
          />
        </div>

        {/* Toner Configuration */}
        <div style={{
          marginTop: '20px',
          padding: '16px',
          backgroundColor: 'var(--bg-subtle)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-light)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
              Toner Seviye Tanımları
            </span>
            <Button size="xs" variant="secondary" icon={Plus} onClick={addToner}>
              Renk Ekle
            </Button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {formData.toners.map((toner, idx) => (
              <div key={idx} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input
                  type="text"
                  className="form-input"
                  style={{ flex: 1, height: '34px' }}
                  placeholder="Renk (Black, Cyan, Magenta, Yellow...)"
                  value={toner.color}
                  onChange={(e) => handleTonerChange(idx, 'color', e.target.value)}
                  required
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <input
                    type="number"
                    className="form-input"
                    style={{ width: '70px', height: '34px' }}
                    placeholder="Seviye"
                    value={toner.level}
                    onChange={(e) => handleTonerChange(idx, 'level', e.target.value)}
                    min="0"
                    max={toner.max_capacity || 100}
                  />
                  <span style={{ color: 'var(--text-muted)' }}>/</span>
                  <input
                    type="number"
                    className="form-input"
                    style={{ width: '70px', height: '34px' }}
                    placeholder="Maks"
                    value={toner.max_capacity}
                    onChange={(e) => handleTonerChange(idx, 'max_capacity', e.target.value)}
                    min="1"
                  />
                </div>
                <button
                  type="button"
                  className="btn-icon btn-outline-danger btn-xs"
                  onClick={() => removeToner(idx)}
                  title="Sil"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </form>
    </Modal>
  );
}
