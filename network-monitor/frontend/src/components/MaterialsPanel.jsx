import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Package,
  Search,
  Plus,
  Edit2,
  Trash2,
  Calendar,
  User,
  MapPin,
  Clock,
  RotateCw,
  Eye,
  ShieldCheck,
  Truck,
  Upload,
  Download,
  Wrench
} from 'lucide-react';
import { useNotification } from './NotificationProvider';
import { fetchWithAuth, importActionsExcel } from '../services/api';
import Button from './ui/Button';
import Modal from './ui/Modal';
import ConfirmDialog from './ui/ConfirmDialog';
import Card from './ui/Card';

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('tr-TR');
}

export default function MaterialsPanel({ role, onSwitchTab }) {
  const { showToast } = useNotification();
  const [materials, setMaterials] = useState([]);
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [cameFromFilter, setCameFromFilter] = useState('');
  const [partTypeFilter, setPartTypeFilter] = useState('');
  const [brandFilter, setBrandFilter] = useState('');
  const [detailMaterial, setDetailMaterial] = useState(null);
  const fileInputRef = useRef(null);

  // Modal States
  const [modalOpen, setModalOpen] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState(null);
  const [form, setForm] = useState({
    device_id: '',
    arrival_date: '',
    action_date: '',
    serial_no: '',
    came_from: '',
    brand: '',
    model: '',
    part_type: '',
    quantity: '1',
    action_taken: '',
    username: '',
    location: '',
    warranty_status: ''
  });

  // Delete Confirm
  const [deleteConfirm, setDeleteConfirm] = useState({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: null
  });

  const fetchMaterials = () => {
    setLoading(true);
    const query = search ? `?type=material&search=${encodeURIComponent(search)}` : '?type=material';
    fetchWithAuth(`/api/actions${query}`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to load materials');
        return res.json();
      })
      .then(data => {
        setMaterials(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(err => {
        console.error("Error loading materials:", err);
        setMaterials([]);
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
    fetchMaterials();
    fetchDevices();
  }, [search]);

  const cameFromOptions = useMemo(() => {
    const cf = [...new Set(materials.map(m => m.came_from).filter(Boolean))];
    return cf.sort();
  }, [materials]);

  const partTypes = useMemo(() => {
    const pt = [...new Set(materials.map(m => m.part_type).filter(Boolean))];
    return pt.sort();
  }, [materials]);

  const brands = useMemo(() => {
    const b = [...new Set(materials.map(m => m.brand).filter(Boolean))];
    return b.sort();
  }, [materials]);

  const filteredMaterials = materials.filter(m => {
    if (cameFromFilter && m.came_from !== cameFromFilter) return false;
    if (partTypeFilter && m.part_type !== partTypeFilter) return false;
    if (brandFilter && m.brand !== brandFilter) return false;
    return true;
  });

  const handleExportExcel = () => {
    const token = localStorage.getItem('token');
    window.open(`/api/actions/export?type=material&token=${token}`, '_blank');
  };

  const handleImportExcel = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const base64Data = evt.target.result.split(',')[1];
        const res = await importActionsExcel(base64Data, 'material');
        showToast('success', '✅ İçe Aktarma Başarılı', `Malzemeler başarıyla aktarıldı: ${res.count || 0} kayıt.`);
        fetchMaterials();
      } catch (err) {
        showToast('error', '❌ Hata', err.message || 'Excel dosyası yüklenemedi.');
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const openAddModal = () => {
    setEditingMaterial(null);
    const today = new Date().toISOString().split('T')[0];
    setForm({
      device_id: '',
      arrival_date: today,
      action_date: '',
      serial_no: '',
      came_from: '',
      brand: '',
      model: '',
      part_type: '',
      quantity: '1',
      action_taken: '',
      username: '',
      location: '',
      warranty_status: ''
    });
    setModalOpen(true);
  };

  const openEditModal = (mat) => {
    setEditingMaterial(mat);
    const arrDate = mat.arrival_date ? new Date(mat.arrival_date).toISOString().split('T')[0] : '';
    const actDate = mat.action_date ? new Date(mat.action_date).toISOString().split('T')[0] : '';
    setForm({
      device_id: mat.device_id || '',
      arrival_date: arrDate,
      action_date: actDate,
      serial_no: mat.serial_no || '',
      came_from: mat.came_from || '',
      brand: mat.brand || '',
      model: mat.model || '',
      part_type: mat.part_type || '',
      quantity: mat.quantity ? String(mat.quantity) : '1',
      action_taken: mat.action_taken || '',
      username: mat.username || '',
      location: mat.location || '',
      warranty_status: mat.warranty_status || ''
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
      if (editingMaterial) {
        await fetchWithAuth(`/api/actions/${editingMaterial.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form)
        });
        showToast('success', '✅ Güncellendi', 'Malzeme kaydı güncellendi.');
      } else {
        await fetchWithAuth('/api/actions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form)
        });
        showToast('success', '✅ Eklendi', 'Yeni malzeme hareketi kaydedildi.');
      }
      setModalOpen(false);
      fetchMaterials();
    } catch (err) {
      showToast('error', '❌ Hata', 'Malzeme kaydedilemedi.');
    }
  };

  const handleDelete = (mat) => {
    setDeleteConfirm({
      isOpen: true,
      title: 'Malzeme Kaydını Sil',
      message: `"${mat.brand} ${mat.model || mat.part_type}" malzeme kaydını silmek istediğinize emin misiniz?`,
      onConfirm: async () => {
        try {
          await fetchWithAuth(`/api/actions/${mat.id}`, { method: 'DELETE' });
          showToast('success', '🗑️ Silindi', 'Malzeme kaydı silindi.');
          fetchMaterials();
        } catch (err) {
          showToast('error', '❌ Hata', err.message);
        }
      }
    });
  };

  return (
    <div className="materials-page">
      {/* Sub-tabs for switching between Yapılan İşler and Gelen Giden Malzeme */}
      <div className="nav-tabs" style={{ marginBottom: '20px' }}>
        <button
          className="nav-tab-item"
          onClick={() => onSwitchTab && onSwitchTab('actions')}
        >
          <Wrench size={16} />
          <span>Yapılan İşler</span>
        </button>
        <button
          className="nav-tab-item active"
          onClick={() => {}}
        >
          <Package size={16} />
          <span>Gelen Giden Malzeme Listesi</span>
        </button>
      </div>

      {/* Header */}
      <div className="page-header">
        <div className="page-title-group">
          <h1 className="page-title">Gelen Giden Malzeme & Stok</h1>
          <p className="page-subtitle">Gelen ve giden donanım, yedek parça ve sarf malzeme envanteri.</p>
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
          <Button variant="secondary" icon={RotateCw} onClick={fetchMaterials}>
            Yenile
          </Button>
          {role !== 'viewer' && (
            <Button variant="primary" icon={Plus} onClick={openAddModal}>
              Yeni Malzeme Hareketi
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
                placeholder="Malzeme, marka, seri no ara..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ width: '220px' }}
              />
            </div>

            <select
              className="form-select"
              style={{ width: '160px', height: '36px' }}
              value={cameFromFilter}
              onChange={e => setCameFromFilter(e.target.value)}
            >
              <option value="">Geliş Yeri (Tümü)</option>
              {cameFromOptions.map(cf => (
                <option key={cf} value={cf}>{cf}</option>
              ))}
            </select>

            <select
              className="form-select"
              style={{ width: '160px', height: '36px' }}
              value={partTypeFilter}
              onChange={e => setPartTypeFilter(e.target.value)}
            >
              <option value="">Parça Türü (Tümü)</option>
              {partTypes.map(pt => (
                <option key={pt} value={pt}>{pt}</option>
              ))}
            </select>

            <select
              className="form-select"
              style={{ width: '150px', height: '36px' }}
              value={brandFilter}
              onChange={e => setBrandFilter(e.target.value)}
            >
              <option value="">Marka (Tümü)</option>
              {brands.map(b => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>

          <div className="table-toolbar-right" style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>
            Toplam: <strong>{filteredMaterials.length}</strong> malzeme
          </div>
        </div>

        {loading ? (
          <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
            Malzeme kayıtları yükleniyor...
          </div>
        ) : filteredMaterials.length === 0 ? (
          <div className="empty-state-box">
            <Package size={28} />
            <div className="empty-state-title">Malzeme Bulunamadı</div>
            <div className="empty-state-desc">Arama filtrelerinizi değiştirin veya yeni bir hareket tanımlayın.</div>
          </div>
        ) : (
          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>GELİŞ TARİHİ</th>
                  <th>GELDİĞİ YER</th>
                  <th>TÜR & MARKA</th>
                  <th>MODEL / SERİ NO</th>
                  <th>ADET</th>
                  <th>GARANTİ</th>
                  <th>KULLANICI / LOKASYON</th>
                  <th style={{ textAlign: 'right' }}>İŞLEMLER</th>
                </tr>
              </thead>
              <tbody>
                {filteredMaterials.map(mat => (
                  <tr
                    key={mat.id}
                    className="row-clickable"
                    onClick={() => setDetailMaterial(mat)}
                  >
                    <td style={{ fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {formatDate(mat.arrival_date)}
                    </td>
                    <td><strong>{mat.came_from || '—'}</strong></td>
                    <td>
                      <div>
                        <strong>{mat.part_type || 'Malzeme'}</strong>
                        {mat.brand && <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{mat.brand}</div>}
                      </div>
                    </td>
                    <td>
                      <div>
                        <span>{mat.model || '—'}</span>
                        {mat.serial_no && (
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--primary)' }}>
                            S/N: {mat.serial_no}
                          </div>
                        )}
                      </div>
                    </td>
                    <td style={{ fontWeight: 600 }}>{mat.quantity || '1'} Adet</td>
                    <td>
                      {mat.warranty_status ? (
                        <span className="badge info" style={{ fontSize: '11px' }}>
                          {mat.warranty_status}
                        </span>
                      ) : '—'}
                    </td>
                    <td>
                      <div>
                        <span>{mat.username || '—'}</span>
                        {mat.location && <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{mat.location}</div>}
                      </div>
                    </td>
                    <td style={{ textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'inline-flex', gap: '4px' }}>
                        <button
                          className="btn-icon btn-ghost btn-xs"
                          onClick={() => setDetailMaterial(mat)}
                          title="Detay Görüntüle"
                        >
                          <Eye size={13} />
                        </button>
                        {role !== 'viewer' && (
                          <button
                            className="btn-icon btn-ghost btn-xs"
                            onClick={() => openEditModal(mat)}
                            title="Düzenle"
                          >
                            <Edit2 size={13} />
                          </button>
                        )}
                        {role === 'admin' && (
                          <button
                            className="btn-icon btn-outline-danger btn-xs"
                            onClick={() => handleDelete(mat)}
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

      {/* Modal: Add / Edit Material */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingMaterial ? 'Malzeme Kaydını Düzenle' : 'Yeni Malzeme Hareketi'}
        icon={Package}
        maxWidth="640px"
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
              <label className="form-label required">Geliş Tarihi</label>
              <input
                type="date"
                name="arrival_date"
                className="form-input"
                value={form.arrival_date}
                onChange={handleFormChange}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Geldiği Yer / Tedarikçi</label>
              <input
                type="text"
                name="came_from"
                className="form-input"
                value={form.came_from}
                onChange={handleFormChange}
                placeholder="Örn: Vatan Bilgisayar, Merkez Depo"
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
            <div className="form-group">
              <label className="form-label required">Parça / Ürün Türü</label>
              <input
                type="text"
                name="part_type"
                className="form-input"
                value={form.part_type}
                onChange={handleFormChange}
                placeholder="DDR4 RAM, SSD, Monitör..."
                required
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
                placeholder="Kingston, Dell..."
              />
            </div>

            <div className="form-group">
              <label className="form-label">Model</label>
              <input
                type="text"
                name="model"
                className="form-input"
                value={form.model}
                onChange={handleFormChange}
                placeholder="Fury 16GB 3200MHz"
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
            <div className="form-group">
              <label className="form-label">Seri No</label>
              <input
                type="text"
                name="serial_no"
                className="form-input"
                value={form.serial_no}
                onChange={handleFormChange}
                placeholder="S/N"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Adet</label>
              <input
                type="number"
                name="quantity"
                className="form-input"
                value={form.quantity}
                onChange={handleFormChange}
                min="1"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Garanti Durumu</label>
              <input
                type="text"
                name="warranty_status"
                className="form-input"
                value={form.warranty_status}
                onChange={handleFormChange}
                placeholder="2 Yıl Garanti, Bitti..."
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div className="form-group">
              <label className="form-label">Verilen / Kullanan Kişi</label>
              <input
                type="text"
                name="username"
                className="form-input"
                value={form.username}
                onChange={handleFormChange}
                placeholder="Kullanıcı adı"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Lokasyon</label>
              <input
                type="text"
                name="location"
                className="form-input"
                value={form.location}
                onChange={handleFormChange}
                placeholder="Kullanıldığı yer"
              />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Açıklama / İşlem Detayı</label>
            <textarea
              name="action_taken"
              className="form-textarea"
              value={form.action_taken}
              onChange={handleFormChange}
              placeholder="Malzeme hakkında ek açıklamalar veya kullanım notları..."
              rows="3"
            />
          </div>
        </form>
      </Modal>

      {/* Modal: Material Detail */}
      {detailMaterial && (
        <Modal
          isOpen={!!detailMaterial}
          onClose={() => setDetailMaterial(null)}
          title="Malzeme Detayı"
          subtitle={`${detailMaterial.brand || ''} ${detailMaterial.model || detailMaterial.part_type}`}
          icon={Package}
          maxWidth="540px"
          footer={
            <Button variant="primary" onClick={() => setDetailMaterial(null)}>
              Kapat
            </Button>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="card" style={{ padding: '12px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>GELİŞ TARİHİ</span>
                <div style={{ fontWeight: 600, fontSize: '13.5px' }}>{formatDate(detailMaterial.arrival_date)}</div>
              </div>
              <div className="card" style={{ padding: '12px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>GELDİĞİ YER</span>
                <div style={{ fontWeight: 600, fontSize: '13.5px' }}>{detailMaterial.came_from || '—'}</div>
              </div>
            </div>

            <div className="card" style={{ padding: '14px' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>
                ÜRÜN ÖZELLİKLERİ
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '13px' }}>
                <div>Tür: <strong>{detailMaterial.part_type || '—'}</strong></div>
                <div>Marka: <strong>{detailMaterial.brand || '—'}</strong></div>
                <div>Model: <strong>{detailMaterial.model || '—'}</strong></div>
                <div>Adet: <strong>{detailMaterial.quantity || '1'}</strong></div>
                <div>Seri No: <strong style={{ fontFamily: 'var(--font-mono)' }}>{detailMaterial.serial_no || '—'}</strong></div>
                <div>Garanti: <strong>{detailMaterial.warranty_status || '—'}</strong></div>
              </div>
            </div>

            {detailMaterial.action_taken && (
              <div className="card" style={{ padding: '14px' }}>
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
                  AÇIKLAMA / İŞLEM:
                </div>
                <div style={{ fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.5 }}>
                  {detailMaterial.action_taken}
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
