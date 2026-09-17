import { useState, useEffect, useRef } from 'react';
import {
  Package,
  Plus,
  Search,
  Edit2,
  Trash2,
  RotateCcw,
  AlertTriangle,
  Calendar,
  User,
  Upload,
  Download
} from 'lucide-react';
import { useNotification } from './NotificationProvider';
import { fetchWithAuth, importTonerStockExcel, importTonerReplacementsExcel } from '../services/api';
import Button from './ui/Button';
import Modal from './ui/Modal';
import ConfirmDialog from './ui/ConfirmDialog';
import Card from './ui/Card';

function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('tr-TR') + ' ' + d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

export default function TonerStockPanel({ role }) {
  const { showToast } = useNotification();
  const [stock, setStock] = useState([]);
  const [replacements, setReplacements] = useState([]);
  const [loadingStock, setLoadingStock] = useState(true);
  const [loadingReplacements, setLoadingReplacements] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const stockFileInputRef = useRef(null);
  const repFileInputRef = useRef(null);

  // Modal States
  const [stockModalOpen, setStockModalOpen] = useState(false);
  const [editingStock, setEditingStock] = useState(null);
  const [stockForm, setStockForm] = useState({ toner_model: '', quantity: 0 });

  const [repModalOpen, setRepModalOpen] = useState(false);
  const [editingRep, setEditingRep] = useState(null);
  const [repForm, setRepForm] = useState({ replacement_date: '', username: '', toner_model: '' });

  // Delete Confirm Modal
  const [deleteConfirm, setDeleteConfirm] = useState({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: null
  });

  const fetchStock = () => {
    setLoadingStock(true);
    fetchWithAuth('/api/printers/toners/stock')
      .then(res => {
        if (!res.ok) throw new Error('Failed to load stock');
        return res.json();
      })
      .then(data => {
        setStock(Array.isArray(data) ? data : []);
        setLoadingStock(false);
      })
      .catch(err => {
        console.error("Error loading toner stock:", err);
        setStock([]);
        setLoadingStock(false);
      });
  };

  const fetchReplacements = () => {
    setLoadingReplacements(true);
    fetchWithAuth('/api/printers/toners/replacements')
      .then(res => {
        if (!res.ok) throw new Error('Failed to load replacements');
        return res.json();
      })
      .then(data => {
        setReplacements(Array.isArray(data) ? data : []);
        setLoadingReplacements(false);
      })
      .catch(err => {
        console.error("Error loading toner replacements:", err);
        setReplacements([]);
        setLoadingReplacements(false);
      });
  };

  useEffect(() => {
    fetchStock();
    fetchReplacements();
  }, []);

  const filteredStock = stock.filter(item =>
    (item.toner_model || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalStockQuantity = stock.reduce((sum, item) => sum + (parseInt(item.quantity) || 0), 0);
  const lowStockCount = stock.filter(item => (parseInt(item.quantity) || 0) <= 2).length;

  // Stock Actions
  const handleExportStock = () => {
    const token = localStorage.getItem('token');
    window.open(`/api/printers/toners/stock/export?token=${token}`, '_blank');
  };

  const handleImportStock = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const base64Data = evt.target.result.split(',')[1];
        const res = await importTonerStockExcel(base64Data);
        showToast('success', '✅ İçe Aktarma Başarılı', `Toner stokları aktarıldı: ${res.count || 0} model.`);
        fetchStock();
      } catch (err) {
        showToast('error', '❌ Hata', err.message || 'Excel dosyası yüklenemedi.');
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleExportReplacements = () => {
    const token = localStorage.getItem('token');
    window.open(`/api/printers/toners/replacements/export?token=${token}`, '_blank');
  };

  const handleImportReplacements = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const base64Data = evt.target.result.split(',')[1];
        const res = await importTonerReplacementsExcel(base64Data);
        showToast('success', '✅ İçe Aktarma Başarılı', `Değişim kayıtları aktarıldı: ${res.count || 0} kayıt.`);
        fetchReplacements();
      } catch (err) {
        showToast('error', '❌ Hata', err.message || 'Excel dosyası yüklenemedi.');
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const openAddStockModal = () => {
    setEditingStock(null);
    setStockForm({ toner_model: '', quantity: 0 });
    setStockModalOpen(true);
  };

  const openEditStockModal = (item) => {
    setEditingStock(item);
    setStockForm({ toner_model: item.toner_model, quantity: item.quantity });
    setStockModalOpen(true);
  };

  const handleSaveStock = async (e) => {
    e.preventDefault();
    if (!stockForm.toner_model.trim()) return;

    try {
      if (editingStock) {
        await fetchWithAuth(`/api/printers/toners/stock/${editingStock.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(stockForm)
        });
        showToast('success', '✅ Güncellendi', 'Toner stoğu başarıyla güncellendi.');
      } else {
        await fetchWithAuth('/api/printers/toners/stock', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(stockForm)
        });
        showToast('success', '✅ Eklendi', 'Yeni toner stoğu kaydedildi.');
      }
      setStockModalOpen(false);
      fetchStock();
    } catch (err) {
      showToast('error', '❌ Hata', err.message || 'İşlem başarısız.');
    }
  };

  const handleDeleteStock = (item) => {
    setDeleteConfirm({
      isOpen: true,
      title: 'Toner Stoğunu Sil',
      message: `"${item.toner_model}" model toner stok kaydını silmek istediğinize emin misiniz?`,
      onConfirm: async () => {
        try {
          await fetchWithAuth(`/api/printers/toners/stock/${item.id}`, { method: 'DELETE' });
          showToast('success', '🗑️ Silindi', 'Toner stoğu silindi.');
          fetchStock();
        } catch (err) {
          showToast('error', '❌ Hata', err.message);
        }
      }
    });
  };

  // Replacement Actions
  const openAddRepModal = () => {
    setEditingRep(null);
    const now = new Date();
    const localIso = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    setRepForm({ replacement_date: localIso, username: '', toner_model: '' });
    setRepModalOpen(true);
  };

  const openEditRepModal = (item) => {
    setEditingRep(item);
    const d = item.replacement_date ? new Date(item.replacement_date) : new Date();
    const localIso = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    setRepForm({
      replacement_date: localIso,
      username: item.username || '',
      toner_model: item.toner_model || ''
    });
    setRepModalOpen(true);
  };

  const handleSaveRep = async (e) => {
    e.preventDefault();
    try {
      if (editingRep) {
        await fetchWithAuth(`/api/printers/toners/replacements/${editingRep.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(repForm)
        });
        showToast('success', '✅ Güncellendi', 'Değişim kaydı güncellendi.');
      } else {
        await fetchWithAuth('/api/printers/toners/replacements', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(repForm)
        });
        showToast('success', '✅ Eklendi', 'Toner değişim kaydı oluşturuldu.');
      }
      setRepModalOpen(false);
      fetchReplacements();
    } catch (err) {
      showToast('error', '❌ Hata', err.message || 'İşlem başarısız.');
    }
  };

  const handleDeleteRep = (item) => {
    setDeleteConfirm({
      isOpen: true,
      title: 'Değişim Kaydını Sil',
      message: `"${item.toner_model}" değişim geçmişini silmek istediğinize emin misiniz?`,
      onConfirm: async () => {
        try {
          await fetchWithAuth(`/api/printers/toners/replacements/${item.id}`, { method: 'DELETE' });
          showToast('success', '🗑️ Silindi', 'Değişim kaydı silindi.');
          fetchReplacements();
        } catch (err) {
          showToast('error', '❌ Hata', err.message);
        }
      }
    });
  };

  return (
    <div style={{ marginTop: '28px' }}>
      {/* Hidden File Inputs for Excel Import */}
      <input
        type="file"
        ref={stockFileInputRef}
        onChange={handleImportStock}
        accept=".xlsx, .xls"
        style={{ display: 'none' }}
      />
      <input
        type="file"
        ref={repFileInputRef}
        onChange={handleImportReplacements}
        accept=".xlsx, .xls"
        style={{ display: 'none' }}
      />

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1.1fr) minmax(0, 1fr)',
        gap: '24px'
      }}>
        {/* Left: Toner Stock Inventory */}
        <Card
          title={
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Package size={17} color="var(--primary)" />
              Toner Stok Envanteri
            </span>
          }
          subtitle={`Toplam ${totalStockQuantity} adet stok • ${lowStockCount} model kritik`}
          actions={
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {role !== 'viewer' && (
                <Button
                  size="xs"
                  variant="secondary"
                  icon={Upload}
                  onClick={() => stockFileInputRef.current?.click()}
                  title="Excel İçe Aktar"
                >
                  İçe Aktar
                </Button>
              )}
              <Button
                size="xs"
                variant="secondary"
                icon={Download}
                onClick={handleExportStock}
                title="Excel Dışa Aktar"
              >
                Dışa Aktar
              </Button>
              {role !== 'viewer' && (
                <Button size="xs" variant="primary" icon={Plus} onClick={openAddStockModal}>
                  Toner Ekle
                </Button>
              )}
            </div>
          }
        >
          <div style={{ marginBottom: '14px' }}>
            <div className="search-field">
              <span className="search-field-icon"><Search size={14} /></span>
              <input
                type="text"
                className="search-field-input"
                placeholder="Toner modeli ara..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                style={{ width: '100%' }}
              />
            </div>
          </div>

          {loadingStock ? (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
              Stok yükleniyor...
            </div>
          ) : filteredStock.length === 0 ? (
            <div className="empty-state-box">
              <Package size={28} />
              <div className="empty-state-title">Toner Stoğu Yok</div>
              <div className="empty-state-desc">Henüz bir toner modeli tanımlanmamış.</div>
            </div>
          ) : (
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>TONER MODELİ</th>
                    <th>ADET</th>
                    <th>DURUM</th>
                    {role !== 'viewer' && <th style={{ textAlign: 'right' }}>İŞLEM</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredStock.map(item => {
                    const isLow = (parseInt(item.quantity) || 0) <= 2;
                    return (
                      <tr key={item.id}>
                        <td><strong>{item.toner_model}</strong></td>
                        <td style={{ fontSize: '14px', fontWeight: 700, color: isLow ? 'var(--status-offline)' : 'var(--text-primary)' }}>
                          {item.quantity} Adet
                        </td>
                        <td>
                          {isLow ? (
                            <span className="badge" style={{ backgroundColor: 'var(--status-offline-bg)', color: 'var(--status-offline)', border: '1px solid var(--status-offline-border)', fontSize: '11px' }}>
                              Kritik Stok
                            </span>
                          ) : (
                            <span className="badge online" style={{ fontSize: '11px' }}>Yeterli</span>
                          )}
                        </td>
                        {role !== 'viewer' && (
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'inline-flex', gap: '4px' }}>
                              <button
                                className="btn-icon btn-ghost btn-xs"
                                onClick={() => openEditStockModal(item)}
                                title="Düzenle"
                              >
                                <Edit2 size={13} />
                              </button>
                              {role === 'admin' && (
                                <button
                                  className="btn-icon btn-outline-danger btn-xs"
                                  onClick={() => handleDeleteStock(item)}
                                  title="Sil"
                                >
                                  <Trash2 size={13} />
                                </button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Right: Toner Replacements History */}
        <Card
          title={
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <RotateCcw size={17} color="var(--primary)" />
              Son Toner Değişim Kayıtları
            </span>
          }
          subtitle="Yazıcılarda gerçekleştirilen toner yenileme geçmişi"
          actions={
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {role !== 'viewer' && (
                <Button
                  size="xs"
                  variant="secondary"
                  icon={Upload}
                  onClick={() => repFileInputRef.current?.click()}
                  title="Excel İçe Aktar"
                >
                  İçe Aktar
                </Button>
              )}
              <Button
                size="xs"
                variant="secondary"
                icon={Download}
                onClick={handleExportReplacements}
                title="Excel Dışa Aktar"
              >
                Dışa Aktar
              </Button>
              {role !== 'viewer' && (
                <Button size="xs" variant="primary" icon={Plus} onClick={openAddRepModal}>
                  Değişim Ekle
                </Button>
              )}
            </div>
          }
        >
          {loadingReplacements ? (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
              Geçmiş yükleniyor...
            </div>
          ) : replacements.length === 0 ? (
            <div className="empty-state-box">
              <RotateCcw size={28} />
              <div className="empty-state-title">Değişim Kaydı Yok</div>
              <div className="empty-state-desc">Henüz bir değişim kaydı oluşturulmadı.</div>
            </div>
          ) : (
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>TARİH</th>
                    <th>MODEL</th>
                    <th>DEĞİŞTİREN</th>
                    {role !== 'viewer' && <th style={{ textAlign: 'right' }}>İŞLEM</th>}
                  </tr>
                </thead>
                <tbody>
                  {replacements.slice(0, 10).map(rep => (
                    <tr key={rep.id}>
                      <td style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                        {formatDateTime(rep.replacement_date)}
                      </td>
                      <td><strong>{rep.toner_model}</strong></td>
                      <td>{rep.username || 'Yetkili'}</td>
                      {role !== 'viewer' && (
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: '4px' }}>
                            <button
                              className="btn-icon btn-ghost btn-xs"
                              onClick={() => openEditRepModal(rep)}
                              title="Düzenle"
                            >
                              <Edit2 size={13} />
                            </button>
                            {role === 'admin' && (
                              <button
                                className="btn-icon btn-outline-danger btn-xs"
                                onClick={() => handleDeleteRep(rep)}
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
        </Card>
      </div>

      {/* Modal: Add/Edit Stock */}
      <Modal
        isOpen={stockModalOpen}
        onClose={() => setStockModalOpen(false)}
        title={editingStock ? 'Toner Stoğunu Düzenle' : 'Yeni Toner Stoğu Ekle'}
        icon={Package}
        maxWidth="440px"
        footer={
          <>
            <Button variant="secondary" onClick={() => setStockModalOpen(false)}>
              İptal
            </Button>
            <Button variant="primary" onClick={handleSaveStock}>
              Kaydet
            </Button>
          </>
        }
      >
        <form onSubmit={handleSaveStock}>
          <div className="form-group">
            <label className="form-label required">Toner Modeli</label>
            <input
              type="text"
              className="form-input"
              value={stockForm.toner_model}
              onChange={e => setStockForm({ ...stockForm, toner_model: e.target.value })}
              placeholder="Örn: CF280A (Siyah)"
              required
            />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label required">Stok Adedi</label>
            <input
              type="number"
              className="form-input"
              value={stockForm.quantity}
              onChange={e => setStockForm({ ...stockForm, quantity: parseInt(e.target.value) || 0 })}
              min="0"
              required
            />
          </div>
        </form>
      </Modal>

      {/* Modal: Add/Edit Replacement */}
      <Modal
        isOpen={repModalOpen}
        onClose={() => setRepModalOpen(false)}
        title={editingRep ? 'Değişim Kaydını Düzenle' : 'Yeni Değişim Kaydı'}
        icon={RotateCcw}
        maxWidth="460px"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRepModalOpen(false)}>
              İptal
            </Button>
            <Button variant="primary" onClick={handleSaveRep}>
              Kaydet
            </Button>
          </>
        }
      >
        <form onSubmit={handleSaveRep}>
          <div className="form-group">
            <label className="form-label required">Değişim Tarihi ve Saati</label>
            <input
              type="datetime-local"
              className="form-input"
              value={repForm.replacement_date}
              onChange={e => setRepForm({ ...repForm, replacement_date: e.target.value })}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label required">Toner Modeli</label>
            <input
              type="text"
              className="form-input"
              value={repForm.toner_model}
              onChange={e => setRepForm({ ...repForm, toner_model: e.target.value })}
              placeholder="Örn: HP 80A (CF280A)"
              required
            />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label required">Değiştiren Personel / Kullanıcı</label>
            <input
              type="text"
              className="form-input"
              value={repForm.username}
              onChange={e => setRepForm({ ...repForm, username: e.target.value })}
              placeholder="Örn: Ahmet Yılmaz"
              required
            />
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
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
