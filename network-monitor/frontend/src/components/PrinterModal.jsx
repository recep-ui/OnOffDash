import { useState, useEffect } from 'react';

export default function PrinterModal({ isOpen, onClose, printer, onSave }) {
  const isEditing = !!printer;
  const [formData, setFormData] = useState({
    name: '',
    ip_address: '',
    model: '',
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
          toners: printer.toners ? [...printer.toners].filter(t => t && t.color) : []
        });
      } else {
        setFormData({
          name: '',
          ip_address: '',
          model: '',
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
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <div className="modal-header">
          <h2 className="modal-title">{isEditing ? 'Yazıcıyı Düzenle' : 'Yeni Yazıcı Ekle'}</h2>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && (
              <div style={{ padding: '10px 14px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', borderLeft: '3px solid #ef4444', borderRadius: '4px', marginBottom: '16px', fontSize: '14px' }}>
                {error}
              </div>
            )}

            <div className="form-group">
              <label className="form-label" htmlFor="name">Yazıcı Adı *</label>
              <input
                type="text"
                id="name"
                name="name"
                className="form-input"
                value={formData.name}
                onChange={handleChange}
                placeholder="Örn: Muhasebe Yazıcısı"
                required
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label" htmlFor="ip_address">IP Adresi *</label>
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

              <div className="form-group">
                <label className="form-label" htmlFor="model">Model</label>
                <input
                  type="text"
                  id="model"
                  name="model"
                  className="form-input"
                  value={formData.model}
                  onChange={handleChange}
                  placeholder="HP LaserJet M404"
                />
              </div>
            </div>

            <div style={{ marginTop: '20px', marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label className="form-label" style={{ marginBottom: 0 }}>Toner Seviyeleri</label>
              <button type="button" className="btn btn-sm btn-ghost" onClick={addToner}>
                + Renk Ekle
              </button>
            </div>

            {formData.toners.map((toner, idx) => (
              <div key={idx} style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
                <input
                  type="text"
                  className="form-input"
                  style={{ flex: 1 }}
                  placeholder="Renk (Black, Cyan...)"
                  value={toner.color}
                  onChange={(e) => handleTonerChange(idx, 'color', e.target.value)}
                  required
                />
                <input
                  type="number"
                  className="form-input"
                  style={{ width: '80px' }}
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
                  style={{ width: '80px' }}
                  placeholder="Max"
                  value={toner.max_capacity}
                  onChange={(e) => handleTonerChange(idx, 'max_capacity', e.target.value)}
                  min="1"
                />
                <button type="button" className="action-btn delete" onClick={() => removeToner(idx)} title="Kaldır">
                  &times;
                </button>
              </div>
            ))}
            {formData.toners.length === 0 && (
              <div style={{ fontSize: '13px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                Henüz toner eklenmemiş.
              </div>
            )}

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
