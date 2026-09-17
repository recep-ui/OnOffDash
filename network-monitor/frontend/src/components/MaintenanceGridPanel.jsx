import { useState, useEffect, useRef } from 'react';
import {
  Calendar,
  Search,
  Plus,
  Edit2,
  Trash2,
  CheckCircle2,
  XCircle,
  RotateCw,
  User,
  Monitor,
  Upload,
  Download
} from 'lucide-react';
import { useNotification } from './NotificationProvider';
import { fetchWithAuth, importMaintenanceExcel, downloadFileWithAuth } from '../services/api';
import Button from './ui/Button';
import Modal from './ui/Modal';
import ConfirmDialog from './ui/ConfirmDialog';
import Card from './ui/Card';

const MONTHS = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'
];

export default function MaintenanceGridPanel({ role }) {
  const { showToast } = useNotification();
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [departments, setDepartments] = useState([]);
  const fileInputRef = useRef(null);

  // Modal States
  const [modalOpen, setModalOpen] = useState(false);
  const [editingDevice, setEditingDevice] = useState(null);
  const [form, setForm] = useState({ hostname: '', ip_address: '', department: '' });

  // Delete Confirm
  const [deleteConfirm, setDeleteConfirm] = useState({ isOpen: false, device: null });

  const fetchMaintenanceData = async () => {
    try {
      setLoading(true);
      const res = await fetchWithAuth('/api/maintenance/grid');
      if (!res.ok) throw new Error('Bakım verileri yüklenemedi.');
      const data = await res.json();
      setDevices(Array.isArray(data) ? data : []);

      const depts = [...new Set(data.map(d => d.department).filter(Boolean))];
      setDepartments(depts.sort((a, b) => a.localeCompare(b, 'tr')));
    } catch (err) {
      console.error(err);
      showToast('error', '❌ Hata', 'Bakım tablosu verileri yüklenemedi.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMaintenanceData();
  }, []);

  const handleToggleMonth = async (deviceId, monthName, currentStatus) => {
    if (role === 'viewer') return;
    try {
      const newStatus = !currentStatus;
      const res = await fetchWithAuth(`/api/maintenance/${deviceId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month_name: monthName, is_completed: newStatus })
      });
      if (!res.ok) throw new Error();

      setDevices(prev => prev.map(d => {
        if (d.id === deviceId) {
          return {
            ...d,
            months: {
              ...(d.months || {}),
              [monthName]: newStatus
            },
            maintenance: {
              ...(d.maintenance || {}),
              [monthName]: newStatus
            }
          };
        }
        return d;
      }));
    } catch (err) {
      showToast('error', '❌ Hata', 'Bakım durumu güncellenemedi.');
    }
  };

  const handleExportExcel = async () => {
    try {
      await downloadFileWithAuth('/api/maintenance/export', 'Bakim_Tablosu_Export.xlsx');
      showToast('success', '✅ İndirme Başarılı', 'Bakım tablosu Excel dosyası indirildi.');
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
        const res = await importMaintenanceExcel(base64Data);
        showToast('success', '✅ İçe Aktarma Başarılı', `Bakım tablosu güncellendi: ${res.count || 0} kayıt.`);
        fetchMaintenanceData();
      } catch (err) {
        showToast('error', '❌ Hata', err.message || 'Excel dosyası yüklenemedi.');
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const openAddModal = () => {
    setEditingDevice(null);
    setForm({ hostname: '', ip_address: '', department: '' });
    setModalOpen(true);
  };

  const openEditModal = (dev) => {
    setEditingDevice(dev);
    setForm({
      hostname: dev.hostname || '',
      ip_address: dev.ip_address || '',
      department: dev.department || ''
    });
    setModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      if (editingDevice) {
        const res = await fetchWithAuth(`/api/devices/${editingDevice.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form)
        });
        if (!res.ok) throw new Error(await res.text());
        showToast('success', '✅ Güncellendi', 'Kullanıcı ve cihaz başarıyla güncellendi.');
      } else {
        const res = await fetchWithAuth('/api/devices', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form)
        });
        if (res.status === 409) {
          showToast('error', '⚠️ Çakışma', 'Bu IP adresine sahip bir kayıt zaten mevcut.');
          return;
        }
        if (!res.ok) throw new Error(await res.text());
        showToast('success', '✅ Eklendi', 'Yeni kayıt bakım listesine eklendi.');
      }
      setModalOpen(false);
      fetchMaintenanceData();
    } catch (err) {
      showToast('error', '❌ Hata', 'Kaydedilemedi.');
    }
  };

  const handleConfirmDelete = async () => {
    const dev = deleteConfirm.device;
    if (!dev) return;
    try {
      const res = await fetchWithAuth(`/api/devices/${dev.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      showToast('success', '🗑️ Silindi', 'Kayıt başarıyla silindi.');
      setDeleteConfirm({ isOpen: false, device: null });
      fetchMaintenanceData();
    } catch (err) {
      showToast('error', '❌ Hata', 'Silinemedi.');
    }
  };

  const filteredDevices = devices.filter(d => {
    if (departmentFilter && (d.department || '') !== departmentFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      const matchHost = (d.hostname || '').toLowerCase().includes(s);
      const matchIp = (d.ip_address || '').toLowerCase().includes(s);
      const matchDept = (d.department || '').toLowerCase().includes(s);
      if (!matchHost && !matchIp && !matchDept) return false;
    }
    return true;
  });

  return (
    <div className="maintenance-page">
      {/* Header */}
      <div className="page-header">
        <div className="page-title-group">
          <h1 className="page-title">Bakım Tablosu</h1>
          <p className="page-subtitle">2026 yılı aylık periyodik bakım kontrol matrisi ve tamamlanma durumları.</p>
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
          <Button variant="secondary" icon={RotateCw} onClick={fetchMaintenanceData}>
            Yenile
          </Button>
          {role !== 'viewer' && (
            <Button variant="primary" icon={Plus} onClick={openAddModal}>
              Yeni Cihaz / Kullanıcı Ekle
            </Button>
          )}
        </div>
      </div>

      {/* Grid Table Card */}
      <div className="table-wrapper">
        <div className="table-toolbar">
          <div className="table-toolbar-left">
            <div className="search-field">
              <span className="search-field-icon"><Search size={15} /></span>
              <input
                type="text"
                className="search-field-input"
                placeholder="Cihaz veya departman ara..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>

            <select
              className="form-select"
              style={{ width: '180px', height: '36px' }}
              value={departmentFilter}
              onChange={e => setDepartmentFilter(e.target.value)}
            >
              <option value="">Tüm Departmanlar</option>
              {departments.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          <div className="table-toolbar-right" style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>
            Toplam: <strong>{filteredDevices.length}</strong> cihaz / kullanıcı
          </div>
        </div>

        {loading ? (
          <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
            Bakım tablosu yükleniyor...
          </div>
        ) : filteredDevices.length === 0 ? (
          <div className="empty-state-box">
            <Calendar size={28} />
            <div className="empty-state-title">Bakım Kaydı Bulunamadı</div>
            <div className="empty-state-desc">Arama filtrelerinizi değiştirin.</div>
          </div>
        ) : (
          <div className="data-table-container">
            <table className="data-table" style={{ fontSize: '12.5px' }}>
              <thead>
                <tr>
                  <th style={{ width: '180px' }}>KULLANICI / HOSTNAME</th>
                  <th style={{ width: '120px' }}>IP ADRESİ</th>
                  <th style={{ width: '140px' }}>DEPARTMAN</th>
                  {MONTHS.map(m => (
                    <th key={m} style={{ textAlign: 'center', minWidth: '46px', padding: '10px 4px' }}>
                      {m.substring(0, 3)}
                    </th>
                  ))}
                  {role !== 'viewer' && <th style={{ textAlign: 'right', width: '80px' }}>İŞLEM</th>}
                </tr>
              </thead>
              <tbody>
                {filteredDevices.map(dev => (
                  <tr key={dev.id}>
                    <td>
                      <strong style={{ color: 'var(--primary)' }}>
                        {dev.hostname || 'Bilinmiyor'}
                      </strong>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
                      {dev.ip_address}
                    </td>
                    <td>{dev.department || '—'}</td>

                    {/* Month Checkboxes / Badges */}
                    {MONTHS.map(month => {
                      const isDone = !!(dev.months?.[month] || dev.maintenance?.[month]);
                      return (
                        <td key={month} style={{ textAlign: 'center', padding: '6px 2px' }}>
                          <button
                            type="button"
                            onClick={() => handleToggleMonth(dev.id, month, isDone)}
                            disabled={role === 'viewer'}
                            style={{
                              width: '26px',
                              height: '26px',
                              borderRadius: 'var(--radius-xs)',
                              border: isDone ? '1px solid var(--status-online-border)' : '1px solid var(--border)',
                              backgroundColor: isDone ? 'var(--status-online-bg)' : '#f8fafc',
                              color: isDone ? 'var(--status-online)' : 'var(--text-light)',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: role === 'viewer' ? 'default' : 'pointer',
                              fontWeight: 700,
                              fontSize: '11px',
                              transition: 'all var(--transition-fast)'
                            }}
                            title={`${month}: ${isDone ? 'Tamamlandı (Değiştirmek için tıkla)' : 'Yapılmadı (Tamamlamak için tıkla)'}`}
                          >
                            {isDone ? '✓' : '—'}
                          </button>
                        </td>
                      );
                    })}

                    {role !== 'viewer' && (
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '4px' }}>
                          <button
                            className="btn-icon btn-ghost btn-xs"
                            onClick={() => openEditModal(dev)}
                            title="Düzenle"
                          >
                            <Edit2 size={13} />
                          </button>
                          {role === 'admin' && (
                            <button
                              className="btn-icon btn-outline-danger btn-xs"
                              onClick={() => setDeleteConfirm({ isOpen: true, device: dev })}
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

      {/* Modal: Add/Edit User Device */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingDevice ? 'Kullanıcıyı / Cihazı Düzenle' : 'Yeni Bakım Kaydı Ekle'}
        icon={User}
        maxWidth="480px"
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
          <div className="form-group">
            <label className="form-label required">Kullanıcı / Bilgisayar Adı</label>
            <input
              type="text"
              name="hostname"
              className="form-input"
              value={form.hostname}
              onChange={e => setForm({ ...form, hostname: e.target.value })}
              placeholder="Örn: Ahmet Yılmaz veya PC-01"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label required">IP Adresi</label>
            <input
              type="text"
              name="ip_address"
              className="form-input"
              value={form.ip_address}
              onChange={e => setForm({ ...form, ip_address: e.target.value })}
              placeholder="10.0.70.15"
              required
            />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Departman</label>
            <input
              type="text"
              name="department"
              className="form-input"
              value={form.department}
              onChange={e => setForm({ ...form, department: e.target.value })}
              placeholder="Örn: Muhasebe"
            />
          </div>
        </form>
      </Modal>

      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={deleteConfirm.isOpen}
        onClose={() => setDeleteConfirm({ isOpen: false, device: null })}
        onConfirm={handleConfirmDelete}
        title="Bakım Kaydını Sil"
        message={`"${deleteConfirm.device?.hostname}" cihazını ve tüm periyodik bakım kayıtlarını silmek istediğinize emin misiniz?`}
      />
    </div>
  );
}
