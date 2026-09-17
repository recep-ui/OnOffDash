import { useState, useEffect } from 'react';
import {
  Monitor,
  Activity,
  Package,
  Wrench,
  Calendar,
  Clock,
  HardDrive,
  Cpu,
  Search,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Edit2,
  Save,
  X
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart
} from 'recharts';
import * as api from '../services/api';
import StatusBadge from './StatusBadge';
import Button from './ui/Button';

const TIME_RANGES = [
  { label: '1 Saat', hours: 1 },
  { label: '6 Saat', hours: 6 },
  { label: '24 Saat', hours: 24 },
  { label: '7 Gün', hours: 168 },
];

const TABS = [
  { key: 'metrics', label: 'Performans & Grafikler', icon: Activity },
  { key: 'software', label: 'Yazılım Envanteri', icon: Package },
  { key: 'inventory', label: 'Donanım & Parçalar', icon: Wrench },
  { key: 'maintenance', label: 'Bakım Takvimi', icon: Calendar },
  { key: 'actions', label: 'İşlem Geçmişi', icon: Clock },
];

function formatTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

function formatDateTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('tr-TR') + ' ' + d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

function formatUptime(seconds) {
  if (!seconds) return '—';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}g ${h}sa ${m}dk`;
  if (h > 0) return `${h}sa ${m}dk`;
  return `${m}dk`;
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      backgroundColor: 'white',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-md)',
      padding: '8px 12px',
      boxShadow: 'var(--shadow-md)',
      fontSize: '12px'
    }}>
      <div style={{ color: 'var(--text-muted)', marginBottom: '4px', fontWeight: 600 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color, display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span>{p.name}:</span>
          <strong>{typeof p.value === 'number' ? p.value.toFixed(1) : p.value}%</strong>
        </div>
      ))}
    </div>
  );
};

export default function DeviceDetailModal({ device, onClose, onUpdate, role }) {
  const [activeTab, setActiveTab] = useState('metrics');
  const [timeRange, setTimeRange] = useState(24);
  const [heartbeats, setHeartbeats] = useState([]);
  const [software, setSoftware] = useState([]);
  const [softwareSearch, setSoftwareSearch] = useState('');
  const [softwareSource, setSoftwareSource] = useState('all');
  const [loading, setLoading] = useState(true);
  const [softwareLoading, setSoftwareLoading] = useState(false);
  const [maintenance, setMaintenance] = useState([]);
  const [maintLoading, setMaintLoading] = useState(false);
  const [actions, setActions] = useState([]);
  const [actionsLoading, setActionsLoading] = useState(false);

  // Inventory edit states
  const [isEditingInventory, setIsEditingInventory] = useState(false);
  const [inventoryData, setInventoryData] = useState({});
  const [inventorySaving, setInventorySaving] = useState(false);

  const handleEditToggle = () => {
    if (!isEditingInventory) {
      setInventoryData({
        pc_type: device.pc_type || '',
        device_manufacturer: device.device_manufacturer || '',
        device_model: device.device_model || '',
        serial_number: device.serial_number || '',
        os_name: device.os_name || '',
        cpu_description: device.cpu_description || '',
        cpu_cores: device.cpu_cores || '',
        ram_mb: device.ram_mb || '',
        storage_mb: device.storage_mb || '',
        monitor_model: device.monitor_model || '',
        monitor_serial: device.monitor_serial || '',
        keyboard_model: device.keyboard_model || '',
        keyboard_serial: device.keyboard_serial || '',
        mouse_model: device.mouse_model || '',
        mouse_serial: device.mouse_serial || '',
        phone_model: device.phone_model || '',
        phone_serial: device.phone_serial || ''
      });
    }
    setIsEditingInventory(!isEditingInventory);
  };

  const handleSaveInventory = async () => {
    try {
      setInventorySaving(true);
      const response = await api.fetchWithAuth(`/api/devices/${device.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(inventoryData)
      });
      if (!response.ok) {
        throw new Error('Envanter kaydedilemedi.');
      }
      const updatedDevice = await response.json();
      if (onUpdate) {
        onUpdate(updatedDevice);
      }
      setIsEditingInventory(false);
    } catch (err) {
      alert(err.message);
    } finally {
      setInventorySaving(false);
    }
  };

  // Heartbeat load
  useEffect(() => {
    if (!device?.id) return;
    setLoading(true);

    api.fetchWithAuth(`/api/devices/${device.id}/heartbeats?hours=${timeRange}&limit=500`)
      .then(res => {
        if (!res.ok) throw new Error();
        return res.json();
      })
      .then(data => {
        const sorted = (data || []).sort((a, b) => new Date(a.last_seen) - new Date(b.last_seen));
        const chartData = sorted.map(h => ({
          time: formatTime(h.last_seen),
          fullTime: formatDateTime(h.last_seen),
          cpu: parseFloat(h.cpu_usage) || 0,
          ram: parseFloat(h.ram_usage) || 0,
          disk: parseFloat(h.disk_usage) || 0,
        }));
        setHeartbeats(chartData);
        setLoading(false);
      })
      .catch(() => {
        setHeartbeats([]);
        setLoading(false);
      });
  }, [device?.id, timeRange]);

  // Software load
  useEffect(() => {
    if (!device?.id || activeTab !== 'software') return;
    setSoftwareLoading(true);

    const params = new URLSearchParams();
    if (softwareSearch) params.set('search', softwareSearch);
    if (softwareSource !== 'all') params.set('source', softwareSource);

    api.fetchWithAuth(`/api/software/${device.id}?${params}`)
      .then(res => {
        if (!res.ok) throw new Error();
        return res.json();
      })
      .then(data => {
        setSoftware(Array.isArray(data) ? data : []);
        setSoftwareLoading(false);
      })
      .catch(() => {
        setSoftware([]);
        setSoftwareLoading(false);
      });
  }, [device?.id, activeTab, softwareSearch, softwareSource]);

  // Maintenance load
  useEffect(() => {
    if (!device?.id || activeTab !== 'maintenance') return;
    setMaintLoading(true);
    api.fetchWithAuth(`/api/maintenance/${device.id}`)
      .then(res => {
        if (!res.ok) throw new Error();
        return res.json();
      })
      .then(data => {
        setMaintenance(Array.isArray(data) ? data : []);
        setMaintLoading(false);
      })
      .catch(() => {
        setMaintenance([]);
        setMaintLoading(false);
      });
  }, [device?.id, activeTab]);

  // Actions load
  useEffect(() => {
    if (!device?.id || activeTab !== 'actions') return;
    setActionsLoading(true);
    api.fetchWithAuth(`/api/actions/${device.id}`)
      .then(res => {
        if (!res.ok) throw new Error();
        return res.json();
      })
      .then(data => {
        setActions(Array.isArray(data) ? data : []);
        setActionsLoading(false);
      })
      .catch(() => {
        setActions([]);
        setActionsLoading(false);
      });
  }, [device?.id, activeTab]);

  if (!device) return null;

  const lastHeartbeat = heartbeats.length > 0 ? heartbeats[heartbeats.length - 1] : null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-dialog"
        style={{ maxWidth: '980px', width: '95vw', height: '88vh', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{
              width: '42px',
              height: '42px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: '#eff6ff',
              color: '#2563eb',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Monitor size={22} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h2 className="modal-title" style={{ fontSize: '18px' }}>
                  {device.hostname || device.ip_address}
                </h2>
                <StatusBadge status={device.status} />
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                {device.ip_address} • {device.department || 'Departman Yok'} • {device.username ? `Kullanıcı: ${device.username}` : ''}
              </div>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Device Highlights Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
          gap: '12px',
          padding: '14px 24px',
          backgroundColor: 'var(--bg-subtle)',
          borderBottom: '1px solid var(--border-light)'
        }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>PING SÜRESİ</span>
            <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px' }}>
              {device.ping_ms ? `${device.ping_ms} ms` : '—'}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>ÇALIŞMA SÜRESİ</span>
            <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginTop: '2px' }}>
              {formatUptime(device.uptime_seconds || device.uptime)}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>CPU KULLANIMI</span>
            <span style={{ fontSize: '14px', fontWeight: 700, color: '#2563eb', marginTop: '2px' }}>
              {lastHeartbeat ? `%${lastHeartbeat.cpu.toFixed(1)}` : (device.cpu_usage ? `%${device.cpu_usage}` : '—')}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>RAM KULLANIMI</span>
            <span style={{ fontSize: '14px', fontWeight: 700, color: '#10b981', marginTop: '2px' }}>
              {lastHeartbeat ? `%${lastHeartbeat.ram.toFixed(1)}` : (device.ram_usage ? `%${device.ram_usage}` : '—')}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>DİSK KULLANIMI</span>
            <span style={{ fontSize: '14px', fontWeight: 700, color: '#f59e0b', marginTop: '2px' }}>
              {lastHeartbeat ? `%${lastHeartbeat.disk.toFixed(1)}` : '—'}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>AGENT DURUMU</span>
            <span style={{ marginTop: '2px' }}>
              <span className={`badge ${device.agent_installed ? 'online' : 'neutral'}`} style={{ fontSize: '11px' }}>
                {device.agent_installed ? '✓ Yüklü & Aktif' : 'Kurulu Değil'}
              </span>
            </span>
          </div>
        </div>

        {/* Tab Navigation */}
        <div style={{ padding: '0 24px', borderBottom: '1px solid var(--border)' }}>
          <div className="nav-tabs" style={{ marginBottom: 0 }}>
            {TABS.map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  className={`nav-tab-item ${isActive ? 'active' : ''}`}
                  onClick={() => setActiveTab(tab.key)}
                >
                  <Icon size={16} />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Modal Body / Tab Viewport */}
        <div className="modal-body" style={{ flex: 1, padding: '20px 24px', overflowY: 'auto' }}>
          {/* TAB 1: METRICS */}
          {activeTab === 'metrics' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                  Gerçek zamanlı kaynak kullanım trendleri
                </div>
                <div className="pill-tabs">
                  {TIME_RANGES.map(tr => (
                    <button
                      key={tr.hours}
                      className={`pill-tab-item ${timeRange === tr.hours ? 'active' : ''}`}
                      onClick={() => setTimeRange(tr.hours)}
                    >
                      {tr.label}
                    </button>
                  ))}
                </div>
              </div>

              {loading ? (
                <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  Grafik verileri yükleniyor...
                </div>
              ) : heartbeats.length === 0 ? (
                <div className="empty-state-box">
                  <Activity size={32} />
                  <div className="empty-state-title">Performans Verisi Bulunamadı</div>
                  <div className="empty-state-desc">
                    {device.agent_installed
                      ? 'Bu zaman aralığında kaydedilmiş heartbeat verisi bulunmuyor.'
                      : 'Cihaza Agent kurulduğunda CPU, RAM ve Disk grafikleri burada gösterilir.'}
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {/* CPU Chart */}
                  <div className="card" style={{ padding: '16px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Cpu size={16} color="#2563eb" /> CPU Kullanım Geçmişi (%)
                    </div>
                    <div style={{ height: '140px', width: '100%' }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={heartbeats} margin={{ top: 5, right: 10, left: -25, bottom: 0 }}>
                          <defs>
                            <linearGradient id="cpuGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3} />
                              <stop offset="95%" stopColor="#2563eb" stopOpacity={0.0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                          <XAxis dataKey="time" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                          <YAxis domain={[0, 100]} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                          <Tooltip content={<CustomTooltip />} />
                          <Area type="monotone" dataKey="cpu" stroke="#2563eb" fill="url(#cpuGrad)" strokeWidth={2} name="CPU" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* RAM Chart */}
                  <div className="card" style={{ padding: '16px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Activity size={16} color="#10b981" /> RAM Bellek Kullanımı (%)
                    </div>
                    <div style={{ height: '140px', width: '100%' }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={heartbeats} margin={{ top: 5, right: 10, left: -25, bottom: 0 }}>
                          <defs>
                            <linearGradient id="ramGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                              <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                          <XAxis dataKey="time" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                          <YAxis domain={[0, 100]} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                          <Tooltip content={<CustomTooltip />} />
                          <Area type="monotone" dataKey="ram" stroke="#10b981" fill="url(#ramGrad)" strokeWidth={2} name="RAM" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Disk Chart */}
                  <div className="card" style={{ padding: '16px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <HardDrive size={16} color="#f59e0b" /> Disk Alanı Doluluk Oranı (%)
                    </div>
                    <div style={{ height: '140px', width: '100%' }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={heartbeats} margin={{ top: 5, right: 10, left: -25, bottom: 0 }}>
                          <defs>
                            <linearGradient id="diskGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                              <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                          <XAxis dataKey="time" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                          <YAxis domain={[0, 100]} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                          <Tooltip content={<CustomTooltip />} />
                          <Area type="monotone" dataKey="disk" stroke="#f59e0b" fill="url(#diskGrad)" strokeWidth={2} name="Disk" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: SOFTWARE INVENTORY */}
          {activeTab === 'software' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
                  <div className="search-field">
                    <span className="search-field-icon"><Search size={15} /></span>
                    <input
                      type="text"
                      className="search-field-input"
                      placeholder="Yazılım adı, yayıncı ara..."
                      value={softwareSearch}
                      onChange={e => setSoftwareSearch(e.target.value)}
                      style={{ width: '260px' }}
                    />
                  </div>

                  <select
                    className="form-select"
                    style={{ width: '160px', height: '36px' }}
                    value={softwareSource}
                    onChange={e => setSoftwareSource(e.target.value)}
                  >
                    <option value="all">Tüm Kaynaklar</option>
                    <option value="registry">Yüklü Programlar</option>
                    <option value="store">Store Uygulamaları</option>
                    <option value="service">Windows Servisleri</option>
                  </select>
                </div>

                <span style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>
                  Toplam <strong>{software.length}</strong> yazılım
                </span>
              </div>

              {softwareLoading ? (
                <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  Yazılım listesi yükleniyor...
                </div>
              ) : software.length === 0 ? (
                <div className="empty-state-box">
                  <Package size={32} />
                  <div className="empty-state-title">Yazılım Kaydı Bulunamadı</div>
                  <div className="empty-state-desc">
                    {device.agent_installed
                      ? 'Agent henüz yazılım listesini aktarmamış olabilir.'
                      : 'Yazılım envanteri için hedef cihaza agent kurulmalıdır.'}
                  </div>
                </div>
              ) : (
                <div className="table-wrapper">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>PROGRAM ADI</th>
                        <th>VERSİYON</th>
                        <th>YAYINCI</th>
                        <th>KAYNAK TİPİ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {software.map((sw, i) => (
                        <tr key={i}>
                          <td><strong>{sw.name}</strong></td>
                          <td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{sw.version || '—'}</td>
                          <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{sw.publisher || '—'}</td>
                          <td>
                            <span className="badge neutral" style={{ fontSize: '11px' }}>
                              {sw.source === 'registry' ? 'Program' : sw.source === 'store' ? 'Store App' : 'Servis'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: INVENTORY */}
          {activeTab === 'inventory' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                  Donanım, sistem parçaları ve çevre birimleri
                </div>
                {role !== 'viewer' && (
                  <div>
                    {!isEditingInventory ? (
                      <Button variant="primary" size="sm" icon={Edit2} onClick={handleEditToggle}>
                        Envanteri Düzenle
                      </Button>
                    ) : (
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <Button variant="secondary" size="sm" onClick={handleEditToggle} disabled={inventorySaving}>
                          İptal
                        </Button>
                        <Button variant="primary" size="sm" icon={Save} onClick={handleSaveInventory} disabled={inventorySaving}>
                          {inventorySaving ? 'Kaydediliyor...' : 'Kaydet'}
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Group 1: System */}
              <div className="card" style={{ padding: '18px' }}>
                <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Monitor size={17} color="#2563eb" /> Sistem ve Aygıt Bilgileri
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
                  <div>
                    <label className="form-label">PC Tipi / Form Faktör</label>
                    {!isEditingInventory ? (
                      <div style={{ fontSize: '13.5px', fontWeight: 500 }}>{device.pc_type || '—'}</div>
                    ) : (
                      <input
                        type="text"
                        className="form-input"
                        value={inventoryData.pc_type}
                        onChange={e => setInventoryData({ ...inventoryData, pc_type: e.target.value })}
                      />
                    )}
                  </div>

                  <div>
                    <label className="form-label">Aygıt Üreticisi</label>
                    {!isEditingInventory ? (
                      <div style={{ fontSize: '13.5px', fontWeight: 500 }}>{device.device_manufacturer || '—'}</div>
                    ) : (
                      <input
                        type="text"
                        className="form-input"
                        value={inventoryData.device_manufacturer}
                        onChange={e => setInventoryData({ ...inventoryData, device_manufacturer: e.target.value })}
                      />
                    )}
                  </div>

                  <div>
                    <label className="form-label">Model</label>
                    {!isEditingInventory ? (
                      <div style={{ fontSize: '13.5px', fontWeight: 500 }}>{device.device_model || '—'}</div>
                    ) : (
                      <input
                        type="text"
                        className="form-input"
                        value={inventoryData.device_model}
                        onChange={e => setInventoryData({ ...inventoryData, device_model: e.target.value })}
                      />
                    )}
                  </div>

                  <div>
                    <label className="form-label">Seri Numarası</label>
                    {!isEditingInventory ? (
                      <div style={{ fontSize: '13px', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--primary)' }}>
                        {device.serial_number || '—'}
                      </div>
                    ) : (
                      <input
                        type="text"
                        className="form-input"
                        value={inventoryData.serial_number}
                        onChange={e => setInventoryData({ ...inventoryData, serial_number: e.target.value })}
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* Group 2: Hardware Specs */}
              <div className="card" style={{ padding: '18px' }}>
                <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Cpu size={17} color="#10b981" /> Donanım Bileşenleri
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
                  <div style={{ gridColumn: 'span 2' }}>
                    <label className="form-label">İşlemci (CPU)</label>
                    {!isEditingInventory ? (
                      <div style={{ fontSize: '13.5px', fontWeight: 500 }}>{device.cpu_description || '—'}</div>
                    ) : (
                      <input
                        type="text"
                        className="form-input"
                        value={inventoryData.cpu_description}
                        onChange={e => setInventoryData({ ...inventoryData, cpu_description: e.target.value })}
                      />
                    )}
                  </div>

                  <div>
                    <label className="form-label">RAM Bellek (MB)</label>
                    {!isEditingInventory ? (
                      <div style={{ fontSize: '13.5px', fontWeight: 600, color: '#2563eb' }}>
                        {device.ram_mb ? (device.ram_mb >= 1024 ? `${Math.round(device.ram_mb / 1024)} GB` : `${device.ram_mb} MB`) : '—'}
                      </div>
                    ) : (
                      <input
                        type="number"
                        className="form-input"
                        value={inventoryData.ram_mb}
                        onChange={e => setInventoryData({ ...inventoryData, ram_mb: e.target.value })}
                      />
                    )}
                  </div>

                  <div>
                    <label className="form-label">Depolama (MB)</label>
                    {!isEditingInventory ? (
                      <div style={{ fontSize: '13.5px', fontWeight: 600, color: '#2563eb' }}>
                        {device.storage_mb ? (device.storage_mb >= 1024 * 1024 ? `${(device.storage_mb / (1024 * 1024)).toFixed(1)} TB` : `${Math.round(device.storage_mb / 1024)} GB`) : '—'}
                      </div>
                    ) : (
                      <input
                        type="number"
                        className="form-input"
                        value={inventoryData.storage_mb}
                        onChange={e => setInventoryData({ ...inventoryData, storage_mb: e.target.value })}
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* Group 3: Peripherals */}
              <div className="card" style={{ padding: '18px' }}>
                <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Wrench size={17} color="#8b5cf6" /> Çevre Birimleri (Monitör, Klavye, vb.)
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
                  <div>
                    <label className="form-label">Monitör Model / Seri</label>
                    {!isEditingInventory ? (
                      <div style={{ fontSize: '13px' }}>{device.monitor_model || '—'} {device.monitor_serial ? `(${device.monitor_serial})` : ''}</div>
                    ) : (
                      <input
                        type="text"
                        className="form-input"
                        value={inventoryData.monitor_model}
                        onChange={e => setInventoryData({ ...inventoryData, monitor_model: e.target.value })}
                        placeholder="Model / Seri No"
                      />
                    )}
                  </div>

                  <div>
                    <label className="form-label">Klavye & Mouse</label>
                    {!isEditingInventory ? (
                      <div style={{ fontSize: '13px' }}>{device.keyboard_model || '—'} / {device.mouse_model || '—'}</div>
                    ) : (
                      <input
                        type="text"
                        className="form-input"
                        value={inventoryData.keyboard_model}
                        onChange={e => setInventoryData({ ...inventoryData, keyboard_model: e.target.value })}
                        placeholder="Klavye Modeli"
                      />
                    )}
                  </div>

                  <div>
                    <label className="form-label">Dahili Telefon</label>
                    {!isEditingInventory ? (
                      <div style={{ fontSize: '13px' }}>{device.phone_model || '—'}</div>
                    ) : (
                      <input
                        type="text"
                        className="form-input"
                        value={inventoryData.phone_model}
                        onChange={e => setInventoryData({ ...inventoryData, phone_model: e.target.value })}
                        placeholder="Telefon Model / Dahili"
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: MAINTENANCE */}
          {activeTab === 'maintenance' && (
            <div>
              <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
                2026 Periyodik Aylık Bakım Durum Çizelgesi
              </div>
              {maintLoading ? (
                <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  Bakım bilgileri yükleniyor...
                </div>
              ) : (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
                  gap: '12px'
                }}>
                  {['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'].map(month => {
                    const record = maintenance.find(m => m.month_name === month);
                    const isCompleted = record ? record.is_completed : false;
                    return (
                      <div
                        key={month}
                        className="card"
                        style={{
                          padding: '14px',
                          textAlign: 'center',
                          backgroundColor: isCompleted ? 'var(--status-online-bg)' : 'white',
                          borderColor: isCompleted ? 'var(--status-online-border)' : 'var(--border)'
                        }}
                      >
                        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                          {month}
                        </div>
                        <div style={{ marginTop: '8px' }}>
                          {isCompleted ? (
                            <span className="badge online" style={{ fontSize: '11px' }}>✓ Tamamlandı</span>
                          ) : (
                            <span className="badge neutral" style={{ fontSize: '11px' }}>Bekliyor</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 5: ACTIONS */}
          {activeTab === 'actions' && (
            <div>
              <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
                Bu cihaza yönelik yapılan işlem, arıza ve bakım kayıtları
              </div>
              {actionsLoading ? (
                <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  İşlem geçmişi yükleniyor...
                </div>
              ) : actions.length === 0 ? (
                <div className="empty-state-box">
                  <Clock size={32} />
                  <div className="empty-state-title">Kayıtlı İşlem Yok</div>
                  <div className="empty-state-desc">Bu cihaza ait servis veya arıza kaydı bulunmuyor.</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {actions.map((act, i) => (
                    <div key={i} className="card" style={{ padding: '16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span className="badge info">{act.part_type || 'Genel Bakım'}</span>
                          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{formatDateTime(act.action_date)}</span>
                        </div>
                        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                          {act.username || 'Yetkili Teknisyen'}
                        </span>
                      </div>
                      <div style={{ fontSize: '13.5px', color: 'var(--text-primary)', lineHeight: 1.4 }}>
                        {act.action_taken}
                      </div>
                      {(act.brand || act.model) && (
                        <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '8px' }}>
                          Kullanılan Parça: {act.brand} {act.model} {act.serial_no ? `(S/N: ${act.serial_no})` : ''}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
