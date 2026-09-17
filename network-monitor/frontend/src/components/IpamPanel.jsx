import { useState, useEffect, useMemo } from 'react';
import {
  Globe,
  RotateCw,
  Search,
  CheckCircle2,
  AlertTriangle,
  Server,
  Radio,
  Copy,
  Check,
  ArrowRight,
  ShieldAlert,
  Layers,
  Sparkles,
  X
} from 'lucide-react';
import { useNotification } from './NotificationProvider';
import { fetchIpamSummary, fetchIpamConflicts, suggestNextIp } from '../services/api';
import Button from './ui/Button';
import Card from './ui/Card';
import StatusBadge from './StatusBadge';

export default function IpamPanel() {
  const { showToast } = useNotification();
  const [subnets, setSubnets] = useState([]);
  const [conflicts, setConflicts] = useState({ ipConflicts: [], macConflicts: [] });
  const [loading, setLoading] = useState(true);
  const [activeSubnetTab, setActiveSubnetTab] = useState('');

  // IP Suggestion wizard state
  const [suggestSubnet, setSuggestSubnet] = useState('');
  const [suggestedIp, setSuggestedIp] = useState('');
  const [suggestLoading, setSuggestLoading] = useState(false);

  // Selected cell/device details and search states
  const [selectedCell, setSelectedCell] = useState(null);
  const [gridSearch, setGridSearch] = useState('');

  // Load IPAM data
  const loadData = async () => {
    try {
      setLoading(true);
      const [summaryData, conflictsData] = await Promise.all([
        fetchIpamSummary(),
        fetchIpamConflicts()
      ]);
      const validSubnets = Array.isArray(summaryData) ? summaryData : [];
      setSubnets(validSubnets);
      setConflicts(conflictsData || { ipConflicts: [], macConflicts: [] });

      if (validSubnets.length > 0 && !activeSubnetTab) {
        setActiveSubnetTab(validSubnets[0].subnet);
        setSuggestSubnet(validSubnets[0].subnet);
      }
    } catch (err) {
      console.error(err);
      showToast('error', '❌ Hata', 'IPAM verileri yüklenirken hata oluştu.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const selectedSubnetObj = useMemo(() => {
    return subnets.find(s => s.subnet === activeSubnetTab);
  }, [subnets, activeSubnetTab]);

  // Construct the 254 IP Grid status mapping
  const ipGridData = useMemo(() => {
    if (!selectedSubnetObj) return [];
    const grid = [];
    const devicesMap = {};

    selectedSubnetObj.devices.forEach(d => {
      devicesMap[d.octet] = d;
    });

    for (let i = 1; i <= 254; i++) {
      const occupiedBy = devicesMap[i];
      grid.push({
        octet: i,
        ip: `${selectedSubnetObj.prefix}.${i}`,
        occupied: !!occupiedBy,
        details: occupiedBy || null
      });
    }
    return grid;
  }, [selectedSubnetObj]);

  const filteredDevices = useMemo(() => {
    if (!selectedSubnetObj) return [];
    if (!gridSearch) return selectedSubnetObj.devices;
    const term = gridSearch.toLowerCase();
    return selectedSubnetObj.devices.filter(d =>
      d.ip.includes(term) ||
      (d.name || '').toLowerCase().includes(term) ||
      (d.mac || '').toLowerCase().includes(term) ||
      (d.department || '').toLowerCase().includes(term)
    );
  }, [selectedSubnetObj, gridSearch]);

  const matchesSearch = (cell) => {
    if (!gridSearch) return false;
    const term = gridSearch.toLowerCase();
    if (cell.ip.includes(term)) return true;
    if (cell.octet.toString() === term) return true;
    if (cell.occupied && cell.details) {
      if ((cell.details.name || '').toLowerCase().includes(term)) return true;
      if ((cell.details.mac || '').toLowerCase().includes(term)) return true;
      if ((cell.details.department || '').toLowerCase().includes(term)) return true;
    }
    return false;
  };

  // Fetch suggested IP
  const handleSuggest = async (subnetVal) => {
    try {
      setSuggestLoading(true);
      const res = await suggestNextIp(subnetVal);
      setSuggestedIp(res.suggestedIp);
    } catch (err) {
      console.error('IP adresi önerilemedi', err);
    } finally {
      setSuggestLoading(false);
    }
  };

  useEffect(() => {
    if (suggestSubnet) {
      handleSuggest(suggestSubnet);
    }
  }, [suggestSubnet]);

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    showToast('info', '📋 Kopyalandı', `${text} panoya kopyalandı.`);
  };

  const totalIpsMonitored = subnets.reduce((sum, s) => sum + (s.total_devices || 0), 0);
  const totalConflicts = (conflicts.ipConflicts?.length || 0) + (conflicts.macConflicts?.length || 0);

  if (loading) {
    return (
      <div style={{ padding: '64px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
        <RotateCw size={28} className="spin" style={{ margin: '0 auto 12px auto' }} />
        <div style={{ fontWeight: 600 }}>IPAM ve Ağ Haritası Yükleniyor...</div>
      </div>
    );
  }

  return (
    <div className="ipam-page">
      {/* Page Header */}
      <div className="page-header">
        <div className="page-title-group">
          <h1 className="page-title">IP Yönetimi & Ağ Haritası (IPAM)</h1>
          <p className="page-subtitle">Alt ağ doluluk oranları, 254 IP durum haritası ve IP çakışma tespiti.</p>
        </div>
        <div className="page-actions">
          <Button variant="secondary" icon={RotateCw} onClick={loadData}>
            Yenile
          </Button>
        </div>
      </div>

      {/* Summary Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '20px' }}>
        <div className="card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '38px', height: '38px', borderRadius: 'var(--radius-md)', backgroundColor: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Globe size={18} />
          </div>
          <div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.1 }}>{subnets.length}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Aktif Subnet</div>
          </div>
        </div>

        <div className="card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '38px', height: '38px', borderRadius: 'var(--radius-md)', backgroundColor: '#ecfdf5', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Server size={18} />
          </div>
          <div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.1 }}>{totalIpsMonitored}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Kullanılan IP</div>
          </div>
        </div>

        <div className="card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '38px', height: '38px', borderRadius: 'var(--radius-md)', backgroundColor: '#ecfeff', color: '#06b6d4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CheckCircle2 size={18} />
          </div>
          <div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.1 }}>
              {subnets.length * 254 - totalIpsMonitored}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Boş Rezerv IP</div>
          </div>
        </div>

        <div className="card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '38px',
            height: '38px',
            borderRadius: 'var(--radius-md)',
            backgroundColor: totalConflicts > 0 ? '#fef2f2' : '#ecfdf5',
            color: totalConflicts > 0 ? '#ef4444' : '#10b981',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <ShieldAlert size={18} />
          </div>
          <div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: totalConflicts > 0 ? '#ef4444' : '#10b981', lineHeight: 1.1 }}>
              {totalConflicts}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>IP / MAC Çakışması</div>
          </div>
        </div>
      </div>

      {/* Next IP Suggestion Box */}
      <div className="card" style={{
        padding: '16px 20px',
        marginBottom: '24px',
        background: 'linear-gradient(135deg, #eff6ff 0%, #f8fafc 100%)',
        border: '1px solid #bfdbfe'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: 'var(--radius-md)', backgroundColor: '#2563eb', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Sparkles size={18} />
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)' }}>
                Akıllı IP Atama Sihirbazı
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                Ağda kullanılmayan bir sonraki sıralı güvenli IP adresini otomatik belirleyin.
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <select
              className="form-select"
              style={{ width: '180px', height: '36px' }}
              value={suggestSubnet}
              onChange={e => setSuggestSubnet(e.target.value)}
            >
              {subnets.map(s => (
                <option key={s.subnet} value={s.subnet}>{s.subnet}</option>
              ))}
            </select>

            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              backgroundColor: 'white',
              border: '1px solid var(--border)',
              padding: '6px 14px',
              borderRadius: 'var(--radius-md)',
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              fontSize: '13px',
              color: 'var(--primary)'
            }}>
              <span>{suggestLoading ? 'Hesaplanıyor...' : (suggestedIp || '—')}</span>
              {suggestedIp && (
                <button
                  onClick={() => copyToClipboard(suggestedIp)}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex' }}
                  title="Kopyala"
                >
                  <Copy size={14} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Subnet Tab Selector */}
      <div className="nav-tabs">
        {subnets.map(s => {
          const isActive = activeSubnetTab === s.subnet;
          const occupancy = ((s.total_devices / 254) * 100).toFixed(0);
          return (
            <button
              key={s.subnet}
              className={`nav-tab-item ${isActive ? 'active' : ''}`}
              onClick={() => setActiveSubnetTab(s.subnet)}
            >
              <Globe size={15} />
              <span>{s.subnet}</span>
              <span className="badge neutral" style={{ fontSize: '11px', marginLeft: '4px' }}>
                %{occupancy} Dolu ({s.total_devices}/254)
              </span>
            </button>
          );
        })}
      </div>

      {/* Interactive 254 IP Grid & Device Inspector */}
      {selectedSubnetObj && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: selectedCell ? 'minmax(0, 1.8fr) minmax(0, 1fr)' : '1fr',
          gap: '24px',
          marginBottom: '24px'
        }}>
          {/* 254 Visual Cell Matrix */}
          <Card
            title={
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Layers size={17} color="var(--primary)" />
                {selectedSubnetObj.subnet} • 254 IP Adres Haritası
              </span>
            }
            subtitle="Hücrelere tıklayarak cihaz ayrıntılarını görüntüleyin."
            actions={
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div className="search-field">
                  <span className="search-field-icon"><Search size={14} /></span>
                  <input
                    type="text"
                    className="search-field-input"
                    placeholder="Oktet, IP veya cihaz ara..."
                    value={gridSearch}
                    onChange={e => setGridSearch(e.target.value)}
                    style={{ width: '220px', height: '32px', fontSize: '12px' }}
                  />
                </div>
              </div>
            }
          >
            {/* Legend */}
            <div style={{ display: 'flex', gap: '16px', marginBottom: '14px', fontSize: '12px', color: 'var(--text-muted)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '12px', height: '12px', borderRadius: '3px', backgroundColor: '#eff6ff', border: '1px solid #bfdbfe' }} /> Boş IP
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '12px', height: '12px', borderRadius: '3px', backgroundColor: '#2563eb' }} /> Dolu Cihaz (Online)
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '12px', height: '12px', borderRadius: '3px', backgroundColor: '#ef4444' }} /> Çevrimdışı
              </span>
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(36px, 1fr))',
              gap: '4px',
              maxHeight: '440px',
              overflowY: 'auto',
              padding: '4px'
            }}>
              {ipGridData.map(cell => {
                const isSelected = selectedCell?.ip === cell.ip;
                const isMatch = matchesSearch(cell);
                let cellBg = '#f8fafc';
                let cellBorder = '#e2e8f0';
                let cellColor = '#64748b';

                if (cell.occupied) {
                  const isOnline = cell.details?.is_online || cell.details?.status === 'online';
                  cellBg = isOnline ? '#2563eb' : '#ef4444';
                  cellBorder = isOnline ? '#1d4ed8' : '#dc2626';
                  cellColor = '#ffffff';
                }

                if (isMatch) {
                  cellBorder = '#f59e0b';
                  cellBg = '#fef3c7';
                  cellColor = '#92400e';
                }

                return (
                  <button
                    key={cell.octet}
                    onClick={() => setSelectedCell(cell)}
                    style={{
                      height: '32px',
                      borderRadius: 'var(--radius-xs)',
                      backgroundColor: cellBg,
                      border: isSelected ? '2px solid #0f172a' : `1px solid ${cellBorder}`,
                      color: cellColor,
                      fontSize: '11px',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: cell.occupied ? 700 : 500,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'transform var(--transition-fast)',
                      boxShadow: isSelected ? '0 0 0 2px rgba(37,99,235,0.3)' : 'none'
                    }}
                    title={`${cell.ip} ${cell.occupied ? `(${cell.details?.name || 'Dolu'})` : '(Boş)'}`}
                  >
                    .{cell.octet}
                  </button>
                );
              })}
            </div>
          </Card>

          {/* Right: Selected IP Details Inspector */}
          {selectedCell && (
            <Card
              title={
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Server size={17} color="var(--primary)" />
                  IP Detayı: {selectedCell.ip}
                </span>
              }
              actions={
                <button
                  className="btn-icon btn-ghost btn-xs"
                  onClick={() => setSelectedCell(null)}
                >
                  <X size={16} />
                </button>
              }
            >
              {selectedCell.occupied && selectedCell.details ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {selectedCell.details.name}
                    </span>
                    <StatusBadge status={selectedCell.details.is_online || selectedCell.details.status === 'online' ? 'online' : 'offline'} />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>IP Adresi:</span>
                      <strong style={{ fontFamily: 'var(--font-mono)' }}>{selectedCell.ip}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>MAC Adresi:</span>
                      <strong style={{ fontFamily: 'var(--font-mono)' }}>{selectedCell.details.mac || '—'}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Departman:</span>
                      <strong>{selectedCell.details.department || '—'}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Cihaz Türü:</span>
                      <strong>{selectedCell.details.type || 'Ağ Cihazı'}</strong>
                    </div>
                  </div>

                  <div style={{ marginTop: '12px' }}>
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={Copy}
                      onClick={() => copyToClipboard(selectedCell.ip)}
                      style={{ width: '100%' }}
                    >
                      IP Adresini Kopyala
                    </Button>
                  </div>
                </div>
              ) : (
                <div style={{ padding: '24px 12px', textAlign: 'center' }}>
                  <div style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '50%',
                    backgroundColor: '#ecfdf5',
                    color: '#10b981',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 12px auto'
                  }}>
                    <CheckCircle2 size={24} />
                  </div>
                  <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)' }}>
                    Bu IP Adresi Boşta
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                    {selectedCell.ip} adresine yeni cihaz tanımlanabilir.
                  </div>
                  <div style={{ marginTop: '16px' }}>
                    <Button
                      size="sm"
                      variant="primary"
                      icon={Copy}
                      onClick={() => copyToClipboard(selectedCell.ip)}
                    >
                      Adresi Kopyala
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          )}
        </div>
      )}

      {/* Subnet Device Table */}
      {selectedSubnetObj && (
        <Card
          title={`Subnet Cihaz Listesi (${filteredDevices.length})`}
          subtitle={`${selectedSubnetObj.subnet} ağına bağlı tüm hostlar`}
        >
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>DURUM</th>
                  <th>HOST ADI</th>
                  <th>IP ADRESİ</th>
                  <th>MAC ADRESİ</th>
                  <th>DEPARTMAN</th>
                  <th>TÜR</th>
                </tr>
              </thead>
              <tbody>
                {filteredDevices.map((d, i) => (
                  <tr key={i}>
                    <td><StatusBadge status={d.is_online || d.status === 'online' ? 'online' : 'offline'} /></td>
                    <td><strong>{d.name}</strong></td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{d.ip}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>{d.mac || '—'}</td>
                    <td>{d.department || '—'}</td>
                    <td>
                      <span className="badge neutral" style={{ fontSize: '11px' }}>
                        {d.type || 'Host'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
