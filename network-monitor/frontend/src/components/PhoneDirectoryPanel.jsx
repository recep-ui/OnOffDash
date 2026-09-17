import { useState, useEffect, useMemo, useRef } from 'react';
import {
  PhoneCall,
  Search,
  Plus,
  Edit2,
  Trash2,
  Upload,
  Building2,
  User,
  Briefcase,
  Copy,
  RotateCw
} from 'lucide-react';
import { useNotification } from './NotificationProvider';
import {
  fetchPhoneDirectory,
  createPhoneEntry,
  updatePhoneEntry,
  deletePhoneEntry,
  importPhoneDirectoryExcel
} from '../services/api';
import Button from './ui/Button';
import Modal from './ui/Modal';
import ConfirmDialog from './ui/ConfirmDialog';
import Card from './ui/Card';

export default function PhoneDirectoryPanel({ role }) {
  const { showToast } = useNotification();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [selectedBuilding, setSelectedBuilding] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [search, setSearch] = useState('');
  const fileInputRef = useRef(null);

  // Modals
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [form, setForm] = useState({
    building: '',
    department: '',
    extension: '',
    name: '',
    job_title: ''
  });

  // Delete Confirm
  const [deleteConfirm, setDeleteConfirm] = useState({
    isOpen: false,
    id: null,
    name: ''
  });

  const loadEntries = async () => {
    try {
      setLoading(true);
      const data = await fetchPhoneDirectory();
      setEntries(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
      showToast('error', '❌ Hata', 'Rehber verileri yüklenirken hata oluştu.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEntries();
  }, []);

  const buildings = useMemo(() => {
    const unique = [...new Set(entries.map(e => e.building))].filter(Boolean);
    return unique.sort();
  }, [entries]);

  useEffect(() => {
    if (buildings.length > 0 && !selectedBuilding) {
      setSelectedBuilding(buildings[0]);
    }
  }, [buildings, selectedBuilding]);

  const departments = useMemo(() => {
    if (!selectedBuilding) return [];
    return [...new Set(
      entries
        .filter(e => e.building === selectedBuilding)
        .map(e => e.department)
    )].filter(Boolean).sort();
  }, [entries, selectedBuilding]);

  const filteredEntries = useMemo(() => {
    return entries.filter(e => {
      if (selectedBuilding && e.building !== selectedBuilding) return false;
      if (selectedDepartment && e.department !== selectedDepartment) return false;
      if (search) {
        const query = search.toLowerCase();
        const matchesName = (e.name || '').toLowerCase().includes(query);
        const matchesExt = (e.extension || '').toLowerCase().includes(query);
        const matchesJob = (e.job_title || '').toLowerCase().includes(query);
        const matchesDept = (e.department || '').toLowerCase().includes(query);
        return matchesName || matchesExt || matchesJob || matchesDept;
      }
      return true;
    });
  }, [entries, selectedBuilding, selectedDepartment, search]);

  const openAddModal = () => {
    setEditingEntry(null);
    setForm({
      building: selectedBuilding || (buildings[0] || 'Genel'),
      department: selectedDepartment || '',
      extension: '',
      name: '',
      job_title: ''
    });
    setModalOpen(true);
  };

  const openEditModal = (entry) => {
    setEditingEntry(entry);
    setForm({
      building: entry.building || '',
      department: entry.department || '',
      extension: entry.extension || '',
      name: entry.name || '',
      job_title: entry.job_title || ''
    });
    setModalOpen(true);
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.extension.trim() || !form.name.trim()) {
      showToast('error', '⚠️ Eksik Alan', 'Dahili no ve İsim alanları zorunludur.');
      return;
    }

    try {
      if (editingEntry) {
        await updatePhoneEntry(editingEntry.id, form);
        showToast('success', '✅ Güncellendi', 'Rehber kaydı güncellendi.');
      } else {
        await createPhoneEntry(form);
        showToast('success', '✅ Eklendi', 'Yeni dahili numara rehbere eklendi.');
      }
      setModalOpen(false);
      loadEntries();
    } catch (err) {
      showToast('error', '❌ Hata', err.message || 'Kayıt kaydedilemedi.');
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirm.id) return;
    try {
      await deletePhoneEntry(deleteConfirm.id);
      showToast('success', '🗑️ Silindi', 'Kayıt rehberden kaldırıldı.');
      setDeleteConfirm({ isOpen: false, id: null, name: '' });
      loadEntries();
    } catch (err) {
      showToast('error', '❌ Hata', err.message || 'Kayıt silinemedi.');
    }
  };

  const handleExcelImport = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const base64Data = evt.target.result.split(',')[1];
        const res = await importPhoneDirectoryExcel(base64Data);
        showToast('success', '✅ İçe Aktarma Başarılı', `Rehber içe aktarıldı: ${res.count || 0} kayıt.`);
        loadEntries();
      } catch (err) {
        showToast('error', '❌ Hata', err.message || 'Excel dosyası işlenemedi.');
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const copyExt = (ext) => {
    navigator.clipboard.writeText(ext);
    showToast('info', '📋 Kopyalandı', `Dahili ${ext} panoya kopyalandı.`);
  };

  return (
    <div className="phone-directory-page">
      {/* Header */}
      <div className="page-header">
        <div className="page-title-group">
          <h1 className="page-title">İç Hat Telefon Rehberi</h1>
          <p className="page-subtitle">Bina, departman ve personel dahili telefon numaraları rehberi.</p>
        </div>
        <div className="page-actions">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleExcelImport}
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
          <Button variant="secondary" icon={RotateCw} onClick={loadEntries}>
            Yenile
          </Button>
          {role !== 'viewer' && (
            <Button variant="primary" icon={Plus} onClick={openAddModal}>
              Yeni Numara Ekle
            </Button>
          )}
        </div>
      </div>

      {/* Buildings Tabs */}
      <div className="nav-tabs" style={{ marginBottom: '16px' }}>
        {buildings.map(b => (
          <button
            key={b}
            className={`nav-tab-item ${selectedBuilding === b ? 'active' : ''}`}
            onClick={() => {
              setSelectedBuilding(b);
              setSelectedDepartment('');
            }}
          >
            <Building2 size={15} />
            {b}
          </button>
        ))}
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
                placeholder="İsim, dahili, unvan veya departman ara..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ width: '280px' }}
              />
            </div>

            <select
              className="form-select"
              style={{ width: '200px', height: '36px' }}
              value={selectedDepartment}
              onChange={e => setSelectedDepartment(e.target.value)}
            >
              <option value="">Tüm Departmanlar</option>
              {departments.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          <div className="table-toolbar-right" style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>
            Toplam: <strong>{filteredEntries.length}</strong> dahili
          </div>
        </div>

        {loading ? (
          <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
            Telefon rehberi yükleniyor...
          </div>
        ) : filteredEntries.length === 0 ? (
          <div className="empty-state-box">
            <PhoneCall size={28} />
            <div className="empty-state-title">Numara Bulunamadı</div>
            <div className="empty-state-desc">Arama kriterlerinizi değiştirin veya yeni bir numara ekleyin.</div>
          </div>
        ) : (
          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: '120px' }}>DAHİLİ NO</th>
                  <th>PERSONEL / İSİM</th>
                  <th>UNVAN / GÖREV</th>
                  <th>DEPARTMAN</th>
                  <th>BİNA / YER</th>
                  {role !== 'viewer' && <th style={{ textAlign: 'right' }}>İŞLEMLER</th>}
                </tr>
              </thead>
              <tbody>
                {filteredEntries.map(entry => (
                  <tr key={entry.id}>
                    <td>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '14px',
                          fontWeight: 700,
                          color: '#2563eb',
                          backgroundColor: '#eff6ff',
                          padding: '3px 8px',
                          borderRadius: 'var(--radius-sm)'
                        }}>
                          {entry.extension}
                        </span>
                        <button
                          onClick={() => copyExt(entry.extension)}
                          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex' }}
                          title="Kopyala"
                        >
                          <Copy size={13} />
                        </button>
                      </div>
                    </td>
                    <td>
                      <strong style={{ color: 'var(--text-primary)' }}>{entry.name}</strong>
                    </td>
                    <td style={{ color: 'var(--text-secondary)' }}>{entry.job_title || '—'}</td>
                    <td>{entry.department || '—'}</td>
                    <td>{entry.building || '—'}</td>
                    {role !== 'viewer' && (
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '4px' }}>
                          <button
                            className="btn-icon btn-ghost btn-xs"
                            onClick={() => openEditModal(entry)}
                            title="Düzenle"
                          >
                            <Edit2 size={13} />
                          </button>
                          {role === 'admin' && (
                            <button
                              className="btn-icon btn-outline-danger btn-xs"
                              onClick={() => setDeleteConfirm({ isOpen: true, id: entry.id, name: `${entry.name} (${entry.extension})` })}
                              title="Sil"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: Add/Edit Entry */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingEntry ? 'Dahili Numarayı Düzenle' : 'Yeni Dahili Numara'}
        icon={PhoneCall}
        maxWidth="500px"
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
              <label className="form-label required">Dahili Numara</label>
              <input
                type="text"
                name="extension"
                className="form-input"
                value={form.extension}
                onChange={handleFormChange}
                placeholder="Örn: 104"
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label required">Personel / İsim</label>
              <input
                type="text"
                name="name"
                className="form-input"
                value={form.name}
                onChange={handleFormChange}
                placeholder="Örn: Mehmet Öz"
                required
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div className="form-group">
              <label className="form-label">Unvan / Görev</label>
              <input
                type="text"
                name="job_title"
                className="form-input"
                value={form.job_title}
                onChange={handleFormChange}
                placeholder="Örn: IT Uzmanı"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Departman</label>
              <input
                type="text"
                name="department"
                className="form-input"
                value={form.department}
                onChange={handleFormChange}
                placeholder="Örn: Bilgi İşlem"
              />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Bina / Lokasyon</label>
            <input
              type="text"
              name="building"
              className="form-input"
              value={form.building}
              onChange={handleFormChange}
              placeholder="Örn: Merkez Bina, Fabrika"
            />
          </div>
        </form>
      </Modal>

      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={deleteConfirm.isOpen}
        onClose={() => setDeleteConfirm({ isOpen: false, id: null, name: '' })}
        onConfirm={handleConfirmDelete}
        title="Dahili Numarayı Sil"
        message={`"${deleteConfirm.name}" kaydını rehberden silmek istediğinize emin misiniz?`}
      />
    </div>
  );
}
