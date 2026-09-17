import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Wrench,
  Search,
  Plus,
  Edit2,
  Trash2,
  Calendar,
  User,
  MapPin,
  Package,
  Clock,
  RotateCw,
  Eye,
  CheckCircle2,
  Upload,
  Download
} from 'lucide-react';
import { useNotification } from './NotificationProvider';
import { fetchWithAuth, importActionsExcel, downloadFileWithAuth } from '../services/api';
import Button from './ui/Button';
import Modal from './ui/Modal';
import ConfirmDialog from './ui/ConfirmDialog';
import Card from './ui/Card';

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('tr-TR');
}

export default function ActionsPanel({ role, onSwitchTab }) {
  const { showToast } = useNotification();
  const [actions, setActions] = useState([]);
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [partTypeFilter, setPartTypeFilter] = useState('');
  const [brandFilter, setBrandFilter] = useState('');
  const [detailAction, setDetailAction] = useState(null);
  const fileInputRef = useRef(null);

  // Modal States
  const [modalOpen, setModalOpen] = useState(false);
  const [editingAction, setEditingAction] = useState(null);
  const [form, setForm] = useState({
    device_id: '',
    action_date: '',
    serial_no: '',
    brand: '',
    model: '',
    part_type: '',
    action_taken: '',
    username: '',
    location: ''
  });

  // Delete confirm
  const [deleteConfirm, setDeleteConfirm] = useState({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: null
  });

  const fetchActions = () => {
    setLoading(true);
    const query = search ? `?type=action&search=${encodeURIComponent(search)}` : '?type=action';
    fetchWithAuth(`/api/actions${query}`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to load actions');
        return res.json();
      })
      .then(data => {
        setActions(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(err => {
        console.error("Error loading actions:", err);
        setActions([]);
        setLoading(false);
      });
  };

  const fetchDevices = () => {
    fetchWithAuth('/api/devices')
      .then(res => {
        if (!res.ok) throw new Error('Failed to load devices');
        return res.json();
      })
      .then(data => {
        setDevices(Array.isArray(data) ? data : []);
      })
      .catch(err => {
        console.error("Error loading devices list:", err);
        setDevices([]);
      });
  };

  useEffect(() => {
    fetchActions();
    fetchDevices();
  }, [search]);

  const partTypes = useMemo(() => {
    const types = [...new Set(actions.map(a => a.part_type).filter(Boolean))];
    return types.sort();
  }, [actions]);

  const brands = useMemo(() => {
    const b = [...new Set(actions.map(a => a.brand).filter(Boolean))];
    return b.sort();
  }, [actions]);

  const filteredActions = actions.filter(a => {
    if (partTypeFilter && a.part_type !== partTypeFilter) return false;
    if (brandFilter && a.brand !== brandFilter) return false;
    return true;
  });

  const handleExportExcel = async () => {
    try {
      await downloadFileWithAuth('/api/actions/export?type=action', 'Yapilan_Isler_Export.xlsx');
      showToast('success', '✅ İndirme Başarılı', 'Yapılan işlemler Excel dosyası indirildi.');
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
        const res = await importActionsExcel(base64Data, 'action');
        showToast('success', '✅ İçe Aktarma Başarılı', `İşlemler başarıyla aktarıldı: ${res.count || 0} kayıt.`);
        fetchActions();
      } catch (err) {
        showToast('error', '❌ Hata', err.message || 'Excel dosyası yüklenemedi.');
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const openAddModal = () => {
    setEditingAction(null);
    const today = new Date().toISOString().split('T')[0];
    setForm({
      device_id: '',
      action_date: today,
      serial_no: '',
      brand: '',
      model: '',
      part_type: '',
      action_taken: '',
      username: '',
      location: ''
    });
    setModalOpen(true);
  };

  const openEditModal = (act) => {
    setEditingAction(act);
    const dStr = act.action_date ? new Date(act.action_date).toISOString().split('T')[0] : '';
    setForm({
      device_id: act.device_id || '',
      action_date: dStr,
      serial_no: act.serial_no || '',
      brand: act.brand || '',
      model: act.model || '',
      part_type: act.part_type || '',
      action_taken: act.action_taken || '',
      username: act.username || '',
      location: act.location || ''
    });
    setModalOpen(true);
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      if (editingAction) {
        await fetchWithAuth(`/api/actions/${editingAction.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form)
        });
        showToast('success', '✅ Güncellendi', 'İşlem kaydı güncellendi.');
      } else {
        await fetchWithAuth('/api/actions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form)
        });
        showToast('success', '✅ Eklendi', 'Yeni işlem kaydı eklendi.');
      }
      setModalOpen(false);
      fetchActions();
    } catch (err) {
      showToast('error', '❌ Hata', 'İşlem kaydedilemedi.');
    }
  };

  const handleDelete = (act) => {
    setDeleteConfirm({
      isOpen: true,
      title: 'İşlem Kaydını Sil',
      message: `"${act.action_taken}" başlıklı servis kaydını silmek istediğinize emin misiniz?`,
      onConfirm: async () => {
        try {
          await fetchWithAuth(`/api/actions/${act.id}`, { method: 'DELETE' });
          showToast('success', '🗑️ Silindi', 'Kayıt başarıyla silindi.');
          fetchActions();
        } catch (err) {
          showToast('error', '❌ Hata', err.message);
        }
      }
    });
  };

  return (
    <div className="actions-page">
      {/* Sub-tabs for switching between Yapılan İşler and Gelen Giden Malzeme */}
      <div className="nav-tabs" style={{ marginBottom: '20px' }}>
        <button
          className="nav-tab-item active"
          onClick={() => {}}
        >
          <Wrench size={16} />
          <span>Yapılan İşler</span>
        </button>
        <button
          className="nav-tab-item"
          onClick={() => onSwitchTab && onSwitchTab('materials')}
        >
          <Package size={16} />
          <span>Gelen Giden Malzeme Listesi</span>
        </button>
      </div>

      {/* Header */}
      <div className="page-header">
        <div className="page-title-group">
          <h1 className="page-title">Yapılan İşler & Operasyonlar</h1>
          <p className="page-subtitle">Teknik servis müdahaleleri, parça değişimleri ve bakım logları.</p>
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
              icon={Upload}
              onClick={() => fileInputRef.current?.click()}
            >
              Excel İçe Aktar
            </Button>
          )}
          <Button variant="secondary" icon={Download} onClick={handleExportExcel}>
            Excel Dışa Aktar
          </Button>
          <Button variant="secondary" icon={RotateCw} onClick={fetchActions}>
            Yenile
          </Button>
          {role !== 'viewer' && (
            <Button variant="primary" icon={Plus} onClick={openAddModal}>
              Yeni İşlem Ekle
            </Button>
          )}
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
                placeholder="Açıklama, kullanıcı, seri no ara..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ width: '240px' }}
              />
            </div>

            <select
              className="form-select"
              style={{ width: '160px', height: '36px' }}
              value={partTypeFilter}
              onChange={e => setPartTypeFilter(e.target.value)}
            >
              <option value="">Tüm Parça Türleri</option>
              {partTypes.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>

            <select
              className="form-select"
              style={{ width: '160px', height: '36px' }}
              value={brandFilter}
              onChange={e => setBrandFilter(e.target.value)}
            >
              <option value="">Tüm Markalar</option>
              {brands.map(b => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>

          <div className="table-toolbar-right" style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>
            Toplam: <strong>{filteredActions.length}</strong> kayıt
          </div>
        </div>

        {loading ? (
          <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
            İşlem kayıtları yükleniyor...
          </div>
        ) : filteredActions.length === 0 ? (
          <div className="empty-state-box">
            <Wrench size={28} />
            <div className="empty-state-title">Kayıt Bulunamadı</div>
            <div className="empty-state-desc">Arama filtrelerinizi değiştirin veya yeni bir kayıt ekleyin.</div>
          </div>
        ) : (
          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>TARİH</th>
                  <th>KULLANICI / SAHİP</th>
                  <th>LOKASYON</th>
                  <th>PARÇA TÜRÜ</th>
                  <th>MARKA / MODEL</th>
                  <th>YAPILAN İŞLEM</th>
                  <th style={{ textAlign: 'right' }}>İŞLEMLER</th>
                </tr>
              </thead>
              <tbody>
                {filteredActions.map(act => (
                  <tr
                    key={act.id}
                    className="row-clickable"
                    onClick={() => setDetailAction(act)}
                  >
                    <td style={{ fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {formatDate(act.action_date)}
                    </td>
                    <td><strong>{act.username || '—'}</strong></td>
                    <td>{act.location || '—'}</td>
                    <td>
                      {act.part_type ? (
                        <span className="badge info" style={{ fontSize: '11px' }}>
                          {act.part_type}
                        </span>
                      ) : '—'}
                    </td>
                    <td style={{ fontSize: '12.5px' }}>
                      {act.brand} {act.model ? `• ${act.model}` : ''}
                    </td>
                    <td>
                      <div style={{
                        maxWidth: '360px',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        color: 'var(--text-primary)'
                      }}>
                        {act.action_taken}
                      </div>
                    </td>
                    <td style={{ textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'inline-flex', gap: '4px' }}>
                        <button
                          className="btn-icon btn-ghost btn-xs"
                          onClick={() => setDetailAction(act)}
                          title="Detay Görüntüle"
                        >
                          <Eye size={13} />
                        </button>
                        {role !== 'viewer' && (
                          <button
                            className="btn-icon btn-ghost btn-xs"
                            onClick={() => openEditModal(act)}
                            title="Düzenle"
                          >
                            <Edit2 size={13} />
                          </button>
                        )}
                        {role === 'admin' && (
                          <button
                            className="btn-icon btn-outline-danger btn-xs"
                            onClick={() => handleDelete(act)}
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

      {/* Modal: Add / Edit Action */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingAction ? 'İşlem Kaydını Düzenle' : 'Yeni İşlem Kaydı'}
        icon={Wrench}
        maxWidth="620px"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              İptal
            </Button>
            <Button variant="primary" onClick={handleSave}>
              Kaydet
            </Button>
          </>
        }
      >
        <form onSubmit={handleSave}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div className="form-group">
              <label className="form-label required">İşlem Tarihi</label>
              <input
                type="date"
                name="action_date"
                className="form-input"
                value={form.action_date}
                onChange={handleFormChange}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Kullanıcı Adı</label>
              <input
                type="text"
                name="username"
                className="form-input"
                value={form.username}
                onChange={handleFormChange}
                placeholder="Örn: Ahmet Yılmaz"
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div className="form-group">
              <label className="form-label">İlgili Cihaz</label>
              <select
                name="device_id"
                className="form-select"
                value={form.device_id}
                onChange={handleFormChange}
              >
                <option value="">Cihaz Seçin (Opsiyonel)</option>
                {devices.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.hostname} ({d.ip_address})
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Lokasyon / Oda</label>
              <input
                type="text"
                name="location"
                className="form-input"
                value={form.location}
                onChange={handleFormChange}
                placeholder="Örn: 2. Kat Muhasebe"
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
            <div className="form-group">
              <label className="form-label">Parça Türü</label>
              <input
                type="text"
                name="part_type"
                className="form-input"
                value={form.part_type}
                onChange={handleFormChange}
                placeholder="RAM, SSD, Ekran Kartı..."
              />
            </div>

            <div className="form-group">
              <label className="form-label">Marka</label>
              <input
                type="text"
                name="brand"
                className="form-input"
                value={form.brand}
                onChange={handleFormChange}
                placeholder="Kingston, Samsung..."
              />
            </div>

            <div className="form-group">
              <label className="form-label">Model / Seri No</label>
              <input
                type="text"
                name="model"
                className="form-input"
                value={form.model}
                onChange={handleFormChange}
                placeholder="Model veya S/N"
              />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label required">Yapılan İşlem / Servis Açıklaması</label>
            <textarea
              name="action_taken"
              className="form-textarea"
              value={form.action_taken}
              onChange={handleFormChange}
              placeholder="Yapılan onarım, parça montajı veya işlem detayları..."
              rows="3"
              required
            />
          </div>
        </form>
      </Modal>

      {/* Modal: View Action Details */}
      {detailAction && (
        <Modal
          isOpen={!!detailAction}
          onClose={() => setDetailAction(null)}
          title="İşlem Detayları"
          subtitle={formatDate(detailAction.action_date)}
          icon={Wrench}
          maxWidth="540px"
          footer={
            <Button variant="primary" onClick={() => setDetailAction(null)}>
              Kapat
            </Button>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', backgroundColor: 'var(--bg-subtle)', borderRadius: 'var(--radius-md)' }}>
              <div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>KULLANICI:</span>
                <div style={{ fontWeight: 600, fontSize: '13.5px' }}>{detailAction.username || '—'}</div>
              </div>
              <div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>LOKASYON:</span>
                <div style={{ fontWeight: 600, fontSize: '13.5px' }}>{detailAction.location || '—'}</div>
              </div>
            </div>

            <div className="card" style={{ padding: '14px' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
                YAPILAN İŞLEM:
              </div>
              <div style={{ fontSize: '13.5px', color: 'var(--text-primary)', lineHeight: 1.5 }}>
                {detailAction.action_taken}
              </div>
            </div>

            {(detailAction.part_type || detailAction.brand || detailAction.model || detailAction.serial_no) && (
              <div className="card" style={{ padding: '14px' }}>
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>
                  KULLANILAN DONANIM / PARÇA:
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '13px' }}>
                  <div>Tür: <strong>{detailAction.part_type || '—'}</strong></div>
                  <div>Marka: <strong>{detailAction.brand || '—'}</strong></div>
                  <div>Model: <strong>{detailAction.model || '—'}</strong></div>
                  <div>Seri No: <strong style={{ fontFamily: 'var(--font-mono)' }}>{detailAction.serial_no || '—'}</strong></div>
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={deleteConfirm.isOpen}
        onClose={() => setDeleteConfirm(prev => ({ ...prev, isOpen: false }))}
        onConfirm={() => {
          if (deleteConfirm.onConfirm) deleteConfirm.onConfirm();
          setDeleteConfirm(prev => ({ ...prev, isOpen: false }));
        }}
        title={deleteConfirm.title}
        message={deleteConfirm.message}
      />
    </div>
  );
}
