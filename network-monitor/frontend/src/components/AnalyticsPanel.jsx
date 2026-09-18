import { useState, useEffect, useCallback } from 'react';
import {
  BarChart3,
  RotateCw,
  TrendingUp,
  Activity,
  Cpu,
  Printer,
  Calendar,
  Package,
  AlertTriangle,
  Zap,
  CheckCircle2
} from 'lucide-react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  AreaChart,
  Area
} from 'recharts';
import { useNotification } from './NotificationProvider';
import Button from './ui/Button';
import Card from './ui/Card';
import { fetchWithAuth } from '../services/api';

export default function AnalyticsPanel() {
  const { showToast } = useNotification();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchSummary = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetchWithAuth('/api/analytics/summary');
      if (!res.ok) throw new Error('Analitik verileri yüklenemedi.');
      const summary = await res.json();
      setData(summary);
    } catch (err) {
      console.error(err);
      showToast('error', '❌ Hata', err.message);
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  if (loading) {
    return (
      <div style={{ padding: '64px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
        <RotateCw size={28} className="spin" style={{ margin: '0 auto 12px auto' }} />
        <div style={{ fontWeight: 600 }}>Analitik Veriler Hesaplanıyor...</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
        Gösterilecek analitik veri bulunamadı.
      </div>
    );
  }

  // 1. Device status data
  const deviceStatusData = [
    { name: 'Online', value: data.deviceStatus?.online || 0, color: '#10b981' },
    { name: 'Offline', value: data.deviceStatus?.offline || 0, color: '#ef4444' },
    { name: 'Uyarı', value: data.deviceStatus?.warning || 0, color: '#f59e0b' }
  ].filter(d => d.value > 0);

  // 2. Resource usage data
  const resourceData = (data.resourceUsage || []).map(d => ({
    name: d.hostname,
    CPU: parseFloat(d.cpu_usage) || 0,
    RAM: parseFloat(d.ram_usage) || 0
  })).slice(0, 8);

  // 3. Toner data
  const tonerData = [];
  (data.printerToners || []).forEach(p => {
    const printerRow = { name: p.name };
    p.toners.forEach(t => {
      printerRow[t.color] = t.percentage;
    });
    tonerData.push(printerRow);
  });

  // 4. Maintenance data
  const maintenanceData = [
    { name: 'Tamamlanan', adet: data.maintenance?.completed || 0, color: '#10b981' },
    { name: 'Bekleyen', adet: data.maintenance?.pending || 0, color: '#f59e0b' }
  ];

  // 5. Material flow data
  const materialData = (data.materialFlow || []).map(f => ({
    tarih: f.date ? f.date.substring(5) : '',
    Giriş: f.incoming || 0,
    Çıkış: f.outgoing || 0
  }));

  // 6. Ping latency data
  const latencyData = (data.latencyHistory || []).map(l => ({
    time: l.time,
    'Gecikme (ms)': l.latency
  }));

  // 7. Maintenance completion by department
  const maintDeptDataMap = {};
  const allDepartments = new Set();
  if (data.maintDeptRates) {
    data.maintDeptRates.forEach(r => {
      const month = r.month;
      allDepartments.add(r.department);
      if (!maintDeptDataMap[month]) {
        maintDeptDataMap[month] = { month };
      }
      maintDeptDataMap[month][r.department] = r.rate;
    });
  }
  const maintDeptChartData = Object.values(maintDeptDataMap);
  const deptList = Array.from(allDepartments);

  // Custom Light Enterprise Tooltip
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div style={{
          backgroundColor: 'white',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          padding: '8px 12px',
          boxShadow: 'var(--shadow-md)',
          fontSize: '12px'
        }}>
          {label && <p style={{ margin: '0 0 4px 0', fontWeight: 600, color: 'var(--text-primary)' }}>{label}</p>}
          {payload.map((item, idx) => (
            <p key={idx} style={{ margin: '2px 0', color: item.color || '#2563eb' }}>
              {item.name}: <strong>{item.value}</strong>
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="analytics-page">
      {/* Header */}
      <div className="page-header">
        <div className="page-title-group">
          <h1 className="page-title">Sistem Analitikleri & Raporlar</h1>
          <p className="page-subtitle">Ağ performansı, SLA metrikleri, toner öngörüleri ve envanter akış analizleri.</p>
        </div>
        <div className="page-actions">
          <Button variant="secondary" icon={RotateCw} onClick={fetchSummary}>
            Yenile
          </Button>
        </div>
      </div>

      {/* Grid: 2 Columns of Insight Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))', gap: '20px', marginBottom: '24px' }}>
        
        {/* 1. Device Status Distribution */}
        <Card
          title={
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Activity size={17} color="var(--primary)" />
              Cihaz Durum Dağılım Oranları
            </span>
          }
        >
          <div style={{ display: 'flex', height: '200px', alignItems: 'center' }}>
            <div style={{ width: '55%', height: '100%' }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={deviceStatusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={75}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {deviceStatusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div style={{ width: '45%', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {deviceStatusData.map((item, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: item.color }} />
                  <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{item.name}:</span>
                  <strong style={{ fontSize: '13.5px', marginLeft: 'auto' }}>{item.value} adet</strong>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* 2. Top Resource Consuming Devices */}
        <Card
          title={
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Cpu size={17} color="#2563eb" />
              Kaynak Kullanımı (CPU & RAM)
            </span>
          }
        >
          <div style={{ height: '200px', width: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={resourceData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fill: '#94a3b8', fontSize: 11 }} unit="%" />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Bar dataKey="CPU" fill="#2563eb" radius={[4, 4, 0, 0]} />
                <Bar dataKey="RAM" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* 3. Ping Latency History */}
        <Card
          title={
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Zap size={17} color="#06b6d4" />
              Ortalama Ağ Gecikme Geçmişi (Ping)
            </span>
          }
        >
          <div style={{ height: '200px', width: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={latencyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="latencyGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="time" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} unit="ms" />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="Gecikme (ms)" stroke="#06b6d4" strokeWidth={2} fill="url(#latencyGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* 4. Material Inflow / Outflow Trends */}
        <Card
          title={
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Package size={17} color="#8b5cf6" />
              Malzeme Giriş / Çıkış Trendi
            </span>
          }
        >
          <div style={{ height: '200px', width: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={materialData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="inGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="outGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="tarih" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Area type="monotone" dataKey="Giriş" stroke="#10b981" strokeWidth={2} fill="url(#inGrad)" />
                <Area type="monotone" dataKey="Çıkış" stroke="#f59e0b" strokeWidth={2} fill="url(#outGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* 5. Toner Depletion & Remaining Forecast */}
      {data.tonerForecast && data.tonerForecast.length > 0 && (
        <Card
          title={
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Printer size={17} color="var(--primary)" />
              Yazıcı Toner Tüketim & Değişim Öngörüsü
            </span>
          }
          subtitle="Günlük ortalama sayfa basım hızına göre tahmini kalan toner süreleri"
        >
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>YAZICI ADI</th>
                  <th>IP ADRESİ</th>
                  <th>DEPARTMAN</th>
                  <th>RENK</th>
                  <th>MEVCUT SEVİYE</th>
                  <th>GÜNLÜK BASKI</th>
                  <th>TAHMİNİ KALAN SÜRE</th>
                </tr>
              </thead>
              <tbody>
                {data.tonerForecast.map((f, i) => {
                  const isCritical = f.estimatedRemainingDays <= 7;
                  const isWarning = f.estimatedRemainingDays <= 30;
                  return (
                    <tr key={i}>
                      <td><strong>{f.printerName}</strong></td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>{f.ip}</td>
                      <td>{f.department || '—'}</td>
                      <td>
                        <span className="badge info" style={{ fontSize: '11px' }}>{f.color}</span>
                      </td>
                      <td><strong>%{f.currentPercentage}</strong></td>
                      <td>{f.avgDailyPrint} sayfa/gün</td>
                      <td>
                        <span
                          className={`badge ${isCritical ? 'offline' : isWarning ? 'warning' : 'online'}`}
                          style={{ fontSize: '11px', fontWeight: 600 }}
                        >
                          {f.estimatedRemainingDays > 0 ? `~${f.estimatedRemainingDays} Gün` : 'Tükenmek Üzere'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
