import { useState, useEffect } from 'react';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart
} from 'recharts';
import * as api from '../services/api';

const TIME_RANGES = [
    { label: '1 Saat', hours: 1 },
    { label: '6 Saat', hours: 6 },
    { label: '24 Saat', hours: 24 },
    { label: '7 Gün', hours: 168 },
];

const TABS = [
    { key: 'metrics', label: '📊 Performans', icon: '📊' },
    { key: 'software', label: '📦 Yazılımlar', icon: '📦' },
];

function formatTime(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

function formatDateTime(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleDateString('tr-TR') + ' ' + d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

function formatUptime(seconds) {
    if (!seconds) return '-';
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (d > 0) return `${d}g ${h}s ${m}dk`;
    if (h > 0) return `${h}s ${m}dk`;
    return `${m}dk`;
}

const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
        <div className="chart-tooltip">
            <div className="chart-tooltip-time">{label}</div>
            {payload.map((p, i) => (
                <div key={i} className="chart-tooltip-item" style={{ color: p.color }}>
                    {p.name}: <strong>{typeof p.value === 'number' ? p.value.toFixed(1) : p.value}%</strong>
                </div>
            ))}
        </div>
    );
};

export default function DeviceDetailModal({ device, onClose }) {
    const [activeTab, setActiveTab] = useState('metrics');
    const [timeRange, setTimeRange] = useState(24);
    const [heartbeats, setHeartbeats] = useState([]);
    const [software, setSoftware] = useState([]);
    const [softwareSearch, setSoftwareSearch] = useState('');
    const [softwareSource, setSoftwareSource] = useState('all');
    const [loading, setLoading] = useState(true);
    const [softwareLoading, setSoftwareLoading] = useState(false);

    // Heartbeat verisini yükle
    useEffect(() => {
        if (!device?.id) return;
        setLoading(true);

        fetch(`/api/devices/${device.id}/heartbeats?hours=${timeRange}&limit=500`)
            .then(res => res.json())
            .then(data => {
                // Zaman sırasına göre sırala (eski → yeni)
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

    // Yazılım listesini yükle
    useEffect(() => {
        if (!device?.id || activeTab !== 'software') return;
        setSoftwareLoading(true);

        const params = new URLSearchParams();
        if (softwareSearch) params.set('search', softwareSearch);
        if (softwareSource !== 'all') params.set('source', softwareSource);

        fetch(`/api/software/${device.id}?${params}`)
            .then(res => res.json())
            .then(data => {
                setSoftware(data || []);
                setSoftwareLoading(false);
            })
            .catch(() => {
                setSoftware([]);
                setSoftwareLoading(false);
            });
    }, [device?.id, activeTab, softwareSearch, softwareSource]);

    if (!device) return null;

    const lastHeartbeat = heartbeats.length > 0 ? heartbeats[heartbeats.length - 1] : null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal detail-modal" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="modal-header">
                    <div>
                        <h2 className="modal-title">
                            {device.status === 'online' ? '🟢' : device.status === 'warning' ? '🟡' : '🔴'}
                            {' '}{device.hostname || device.ip_address}
                        </h2>
                        <div className="detail-subtitle">{device.ip_address} • {device.department || 'Departman yok'}</div>
                    </div>
                    <button className="modal-close" onClick={onClose}>✕</button>
                </div>

                {/* Cihaz Bilgileri */}
                <div className="detail-info-grid">
                    <div className="detail-info-item">
                        <span className="detail-info-label">Durum</span>
                        <span className={`status-badge ${device.status}`}>
                            <span className={`status-dot ${device.status}`}></span>
                            {device.status === 'online' ? 'Çevrimiçi' : device.status === 'warning' ? 'Uyarı' : 'Çevrimdışı'}
                        </span>
                    </div>
                    <div className="detail-info-item">
                        <span className="detail-info-label">Kullanıcı</span>
                        <span>{device.username || '-'}</span>
                    </div>
                    <div className="detail-info-item">
                        <span className="detail-info-label">Ping</span>
                        <span className={`ping-value ${device.ping_ms < 50 ? 'good' : device.ping_ms < 150 ? 'medium' : 'bad'}`}>
                            {device.ping_ms ? `${device.ping_ms}ms` : '-'}
                        </span>
                    </div>
                    <div className="detail-info-item">
                        <span className="detail-info-label">Uptime</span>
                        <span>{formatUptime(device.uptime)}</span>
                    </div>
                    {lastHeartbeat && (
                        <>
                            <div className="detail-info-item">
                                <span className="detail-info-label">CPU</span>
                                <span className="metric-value">{lastHeartbeat.cpu.toFixed(1)}%</span>
                            </div>
                            <div className="detail-info-item">
                                <span className="detail-info-label">RAM</span>
                                <span className="metric-value">{lastHeartbeat.ram.toFixed(1)}%</span>
                            </div>
                            <div className="detail-info-item">
                                <span className="detail-info-label">Disk</span>
                                <span className="metric-value">{lastHeartbeat.disk.toFixed(1)}%</span>
                            </div>
                            <div className="detail-info-item">
                                <span className="detail-info-label">Agent</span>
                                <span className="agent-badge installed">✓ Yüklü</span>
                            </div>
                        </>
                    )}
                </div>

                {/* Tab Navigation */}
                <div className="detail-tabs">
                    {TABS.map(tab => (
                        <button
                            key={tab.key}
                            className={`detail-tab ${activeTab === tab.key ? 'active' : ''}`}
                            onClick={() => setActiveTab(tab.key)}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Tab Content */}
                <div className="detail-body">
                    {activeTab === 'metrics' && (
                        <div className="metrics-tab">
                            {/* Zaman aralığı seçici */}
                            <div className="time-range-selector">
                                {TIME_RANGES.map(tr => (
                                    <button
                                        key={tr.hours}
                                        className={`time-range-btn ${timeRange === tr.hours ? 'active' : ''}`}
                                        onClick={() => setTimeRange(tr.hours)}
                                    >
                                        {tr.label}
                                    </button>
                                ))}
                            </div>

                            {loading ? (
                                <div className="chart-loading">Veriler yükleniyor...</div>
                            ) : heartbeats.length === 0 ? (
                                <div className="chart-empty">Bu zaman aralığında veri bulunamadı</div>
                            ) : (
                                <div className="charts-grid">
                                    {/* CPU Chart */}
                                    <div className="chart-card">
                                        <div className="chart-title">🔥 CPU Kullanımı</div>
                                        <ResponsiveContainer width="100%" height={180}>
                                            <AreaChart data={heartbeats}>
                                                <defs>
                                                    <linearGradient id="cpuGrad" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                                                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                                    </linearGradient>
                                                </defs>
                                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                                                <XAxis dataKey="time" tick={{ fill: '#64748b', fontSize: 11 }} />
                                                <YAxis domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 11 }} unit="%" />
                                                <Tooltip content={<CustomTooltip />} />
                                                <Area type="monotone" dataKey="cpu" stroke="#3b82f6" fill="url(#cpuGrad)" strokeWidth={2} name="CPU" dot={false} />
                                            </AreaChart>
                                        </ResponsiveContainer>
                                    </div>

                                    {/* RAM Chart */}
                                    <div className="chart-card">
                                        <div className="chart-title">💾 RAM Kullanımı</div>
                                        <ResponsiveContainer width="100%" height={180}>
                                            <AreaChart data={heartbeats}>
                                                <defs>
                                                    <linearGradient id="ramGrad" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                                                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                                    </linearGradient>
                                                </defs>
                                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                                                <XAxis dataKey="time" tick={{ fill: '#64748b', fontSize: 11 }} />
                                                <YAxis domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 11 }} unit="%" />
                                                <Tooltip content={<CustomTooltip />} />
                                                <Area type="monotone" dataKey="ram" stroke="#10b981" fill="url(#ramGrad)" strokeWidth={2} name="RAM" dot={false} />
                                            </AreaChart>
                                        </ResponsiveContainer>
                                    </div>

                                    {/* Disk Chart */}
                                    <div className="chart-card">
                                        <div className="chart-title">💿 Disk Kullanımı</div>
                                        <ResponsiveContainer width="100%" height={180}>
                                            <AreaChart data={heartbeats}>
                                                <defs>
                                                    <linearGradient id="diskGrad" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                                                        <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                                                    </linearGradient>
                                                </defs>
                                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                                                <XAxis dataKey="time" tick={{ fill: '#64748b', fontSize: 11 }} />
                                                <YAxis domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 11 }} unit="%" />
                                                <Tooltip content={<CustomTooltip />} />
                                                <Area type="monotone" dataKey="disk" stroke="#f59e0b" fill="url(#diskGrad)" strokeWidth={2} name="Disk" dot={false} />
                                            </AreaChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'software' && (
                        <div className="software-tab">
                            <div className="software-toolbar">
                                <div className="search-input software-search">
                                    <span>🔍</span>
                                    <input
                                        type="text"
                                        placeholder="Yazılım ara..."
                                        value={softwareSearch}
                                        onChange={e => setSoftwareSearch(e.target.value)}
                                    />
                                </div>
                                <select
                                    className="filter-select"
                                    value={softwareSource}
                                    onChange={e => setSoftwareSource(e.target.value)}
                                >
                                    <option value="all">Tüm Kaynaklar</option>
                                    <option value="registry">📦 Yüklü Programlar</option>
                                    <option value="store">🏪 Store Uygulamaları</option>
                                    <option value="service">⚙️ Servisler</option>
                                </select>
                                <span className="software-count">{software.length} yazılım</span>
                            </div>

                            {softwareLoading ? (
                                <div className="chart-loading">Yazılım listesi yükleniyor...</div>
                            ) : software.length === 0 ? (
                                <div className="chart-empty">
                                    {device.agent_installed
                                        ? 'Yazılım verisi henüz gelmedi. Agent ilk raporunu gönderdikten sonra görünecektir.'
                                        : 'Agent yüklü değil. Yazılım envanteri için agent gereklidir.'
                                    }
                                </div>
                            ) : (
                                <div className="software-table-wrapper">
                                    <table className="device-table software-table">
                                        <thead>
                                            <tr>
                                                <th>Program Adı</th>
                                                <th>Versiyon</th>
                                                <th>Yayıncı</th>
                                                <th>Kaynak</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {software.map((sw, i) => (
                                                <tr key={i}>
                                                    <td className="sw-name">{sw.name}</td>
                                                    <td className="sw-version">{sw.version || '-'}</td>
                                                    <td className="sw-publisher">{sw.publisher || '-'}</td>
                                                    <td>
                                                        <span className={`source-badge ${sw.source}`}>
                                                            {sw.source === 'registry' ? '📦' : sw.source === 'store' ? '🏪' : '⚙️'}
                                                            {' '}{sw.source === 'registry' ? 'Program' : sw.source === 'store' ? 'Store' : 'Servis'}
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
                </div>
            </div>
        </div>
    );
}
