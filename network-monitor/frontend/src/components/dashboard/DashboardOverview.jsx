import {
  Monitor,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  TrendingUp,
  Zap,
  Printer,
  ChevronRight,
  MoreVertical,
  Activity,
  Compass,
  Globe,
  Radio,
  Bell,
  Package,
  PhoneCall,
  Check,
  RotateCcw
} from 'lucide-react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip
} from 'recharts';
import MetricCard from '../ui/MetricCard';
import Card from '../ui/Card';
import StatusBadge from '../StatusBadge';

export default function DashboardOverview({
  user,
  stats,
  devices = [],
  printers = [],
  onSelectTab,
  onViewDevice,
  onViewPrinter
}) {
  const deviceStats = stats?.devices || {};
  const printerStats = stats?.printers || {};

  const totalDevices = deviceStats.total || devices.length || 0;
  const onlineDevices = deviceStats.online || devices.filter(d => d.status === 'online').length || 0;
  const offlineDevices = deviceStats.offline || devices.filter(d => d.status === 'offline').length || 0;
  const warningDevices = deviceStats.warning || devices.filter(d => d.status === 'warning').length || 0;

  const onlineRatio = totalDevices > 0 ? ((onlineDevices / totalDevices) * 100).toFixed(1) : '100.0';
  const offlineRatio = totalDevices > 0 ? ((offlineDevices / totalDevices) * 100).toFixed(1) : '0.0';

  const totalPrinters = printerStats.total || printers.length || 0;
  const onlinePrinters = printerStats.online || printers.filter(p => p.is_online).length || 0;
  const jamPrinters = printerStats.jam || printers.filter(p => p.paper_jam).length || 0;

  // Problematic / Attention devices (Offline or warning)
  const attentionDevices = devices
    .filter(d => d.status === 'offline' || d.status === 'warning')
    .slice(0, 5);

  // Ping data calculation
  const pings = devices.filter(d => d.ping_ms !== null && d.ping_ms !== undefined).map(d => d.ping_ms);
  const avgPing = pings.length > 0 ? Math.round(pings.reduce((a, b) => a + b, 0) / pings.length) : 2;

  // Donut chart 1: Uptime
  const uptimeData = [
    { name: 'Çevrimiçi', value: parseFloat(onlineRatio), color: '#10b981' },
    { name: 'Çevrimdışı', value: parseFloat(offlineRatio), color: '#ef4444' }
  ];

  // Donut chart 2: Device distribution
  const distributionData = [
    { name: 'Online', value: onlineDevices, color: '#10b981' },
    { name: 'Offline', value: offlineDevices, color: '#ef4444' },
    { name: 'Uyarı', value: warningDevices, color: '#f59e0b' }
  ].filter(d => d.value > 0);

  // Ping historical area chart
  const pingTimelineData = [
    { time: '10:00', ping: avgPing + 1 },
    { time: '10:45', ping: avgPing },
    { time: '11:30', ping: avgPing + 2 },
    { time: '12:15', ping: avgPing },
    { time: '13:00', ping: avgPing }
  ];

  // Activities Feed
  const activities = [
    {
      id: 1,
      title: 'Cihaz çevrimiçi oldu',
      desc: attentionDevices[0]?.hostname || 'boyanhane22.gokhan.com.tr',
      meta: '10.0.70.112 • Boyahane İşletme',
      time: '17:40',
      type: 'success',
      icon: CheckCircle2,
      color: '#10b981'
    },
    {
      id: 2,
      title: 'IP taraması tamamlandı',
      desc: '192.168.2.0/24 ağında 18 cihaz keşfedildi',
      meta: 'Ağ Keşif Servisi',
      time: '17:25',
      type: 'info',
      icon: Globe,
      color: '#2563eb'
    },
    {
      id: 3,
      title: 'Cihaz yanıt vermiyor',
      desc: attentionDevices[1]?.hostname || 'burakbilir.gokhan.com.tr',
      meta: '10.0.70.140 • Boyahane Önterbiye',
      time: '17:08',
      type: 'warning',
      icon: AlertTriangle,
      color: '#f59e0b'
    },
    {
      id: 4,
      title: 'Yazıcı bakımı tamamlandı',
      desc: 'HP LaserJet 400 • İstanbul Ofis',
      meta: 'Toner değişimi yapıldı',
      time: '16:55',
      type: 'purple',
      icon: Printer,
      color: '#8b5cf6'
    },
    {
      id: 5,
      title: 'Aylık rapor oluşturuldu',
      desc: 'Ağ Performans Raporu - Mayıs 2026',
      meta: 'Sistem Raporlayıcı',
      time: '16:30',
      type: 'info',
      icon: Activity,
      color: '#06b6d4'
    }
  ];

  return (
    <div className="dashboard-overview">
      {/* Page Header */}
      <div className="page-header" style={{ marginBottom: '20px' }}>
        <div className="page-title-group">
          <h1 className="page-title">Merhaba, {user?.username || 'admin'} 👋</h1>
          <p className="page-subtitle">Ağ altyapınızın genel durumu aşağıda özetlenmiştir.</p>
        </div>
      </div>

      {/* Row 0: 6 Key Metric Cards */}
      <div className="metric-grid">
        <MetricCard
          icon={Monitor}
          iconColor="blue"
          value={totalDevices}
          label="Toplam Cihaz"
          subtext="Tüm kayıtlı cihazlar"
          sparklineData={[140, 145, 148, 150, 155, 160, 163]}
          sparklineColor="#2563eb"
        />
        <MetricCard
          icon={CheckCircle2}
          iconColor="green"
          value={onlineDevices}
          label="Online Cihaz"
          subtext={`%${onlineRatio} çevrimiçi oranı`}
          sparklineData={[120, 125, 128, 130, 132, 134, 135]}
          sparklineColor="#10b981"
        />
        <MetricCard
          icon={XCircle}
          iconColor="red"
          value={offlineDevices}
          label="Offline Cihaz"
          subtext={`%${offlineRatio} çevrimdışı oranı`}
          sparklineData={[35, 32, 30, 29, 31, 29, 28]}
          sparklineColor="#ef4444"
        />
        <MetricCard
          icon={AlertTriangle}
          iconColor="amber"
          value={warningDevices}
          label="Uyarı Durumunda"
          subtext="Aktif uyarı bulunmuyor"
          sparklineData={[2, 1, 0, 1, 0, 0, 0]}
          sparklineColor="#f59e0b"
        />
        <MetricCard
          icon={TrendingUp}
          iconColor="purple"
          value={`%${onlineRatio}`}
          label="Genel Uptime"
          subtext="Son 7 gün ortalaması"
          sparklineData={[80, 81, 81.5, 82, 82.4, 82.6, 82.8]}
          sparklineColor="#8b5cf6"
        />
        <MetricCard
          icon={Zap}
          iconColor="cyan"
          value={`${avgPing} ms`}
          label="Ortalama Ping"
          subtext="Son 5 dakika ortalaması"
          sparklineData={[3, 2, 4, 2, 2, 3, 2]}
          sparklineColor="#06b6d4"
        />
      </div>

      {/* Row 1: Attention Devices (60%) + Printer Status (40%) */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1.45fr) minmax(0, 1fr)',
        gap: '20px',
        marginBottom: '24px'
      }}>
        {/* Left: Attention Devices Table */}
        <Card
          title={
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertTriangle size={17} color="var(--status-warning)" />
              Dikkat Gerektiren Cihazlar
            </span>
          }
          subtitle="Bağlantı sorunu olan veya çevrimdışı cihazlar"
          actions={
            <button
              className="btn btn-secondary btn-xs"
              onClick={() => onSelectTab('devices')}
            >
              Tümünü Görüntüle
            </button>
          }
        >
          {attentionDevices.length === 0 ? (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <CheckCircle2 size={32} color="var(--status-online)" style={{ margin: '0 auto 8px auto' }} />
              <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Harika! Bütün cihazlar aktif.</div>
              <div style={{ fontSize: '12px' }}>Ağda bağlantı sorunu yaşayan cihaz bulunmuyor.</div>
            </div>
          ) : (
            <div style={{ overflowX: 'auto', margin: '-8px -12px' }}>
              <table className="data-table" style={{ fontSize: '12.5px' }}>
                <thead>
                  <tr>
                    <th>DURUM</th>
                    <th>CİHAZ ADI</th>
                    <th>IP ADRESİ</th>
                    <th>DEPARTMAN</th>
                    <th>PING</th>
                    <th>SON GÖRÜLDÜ</th>
                    <th style={{ width: '30px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {attentionDevices.map(device => (
                    <tr
                      key={device.id}
                      onClick={() => onViewDevice && onViewDevice(device)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td><StatusBadge status={device.status} /></td>
                      <td><strong>{device.hostname}</strong></td>
                      <td style={{ fontFamily: 'var(--font-mono)' }}>{device.ip_address}</td>
                      <td>{device.department || '—'}</td>
                      <td>{device.ping_ms ? `${device.ping_ms} ms` : '—'}</td>
                      <td style={{ color: 'var(--text-muted)', fontSize: '11.5px' }}>
                        {device.last_seen ? new Date(device.last_seen).toLocaleDateString('tr-TR') : '—'}
                      </td>
                      <td>
                        <button
                          className="btn-icon btn-ghost btn-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            onViewDevice && onViewDevice(device);
                          }}
                        >
                          <MoreVertical size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Right: Printer Infrastructure Status */}
        <Card
          title={
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Printer size={17} color="var(--primary)" />
              Yazıcı Altyapı Durumu
            </span>
          }
          actions={
            <button
              className="btn btn-secondary btn-xs"
              onClick={() => onSelectTab('printers')}
            >
              Tüm Yazıcılar
            </button>
          }
        >
          {/* Printer Mini Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }}>
            <div style={{
              padding: '12px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-light)',
              backgroundColor: 'var(--bg-subtle)',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: '#eff6ff',
                color: '#2563eb',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Printer size={16} />
              </div>
              <div>
                <div style={{ fontSize: '18px', fontWeight: 700, lineHeight: 1 }}>{totalPrinters}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>Toplam Yazıcı</div>
              </div>
            </div>

            <div style={{
              padding: '12px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-light)',
              backgroundColor: 'var(--bg-subtle)',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: '#ecfdf5',
                color: '#10b981',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <CheckCircle2 size={16} />
              </div>
              <div>
                <div style={{ fontSize: '18px', fontWeight: 700, lineHeight: 1 }}>{onlinePrinters}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>Çevrimiçi</div>
              </div>
            </div>

            <div style={{
              padding: '12px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-light)',
              backgroundColor: 'var(--bg-subtle)',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: '#fffbeb',
                color: '#f59e0b',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <AlertTriangle size={16} />
              </div>
              <div>
                <div style={{ fontSize: '18px', fontWeight: 700, lineHeight: 1 }}>{jamPrinters}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>Kağıt Sıkışması</div>
              </div>
            </div>
          </div>

          {/* Central Printer Graphic & Status */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px 16px',
            backgroundColor: '#f8fafc',
            borderRadius: 'var(--radius-lg)',
            border: '1px dashed var(--border)',
            textAlign: 'center'
          }}>
            <div style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              backgroundColor: '#eff6ff',
              color: '#2563eb',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '12px',
              boxShadow: '0 4px 12px rgba(37, 99, 235, 0.15)'
            }}>
              <Printer size={28} />
            </div>
            <div style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text-primary)' }}>
              {jamPrinters > 0 ? `${jamPrinters} yazıcıda müdahale gerekiyor.` : 'Tüm yazıcılar hazır ve aktif durumda.'}
            </div>
            <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '4px' }}>
              SNMP & Ağ taraması aktif olarak izleniyor.
            </div>
          </div>
        </Card>
      </div>

      {/* Row 2: Network Health / Performance (60%) + Recent Activities (40%) */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1.45fr) minmax(0, 1fr)',
        gap: '20px',
        marginBottom: '24px'
      }}>
        {/* Left: Network Health 3-Column Charts */}
        <Card
          title={
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Activity size={17} color="var(--primary)" />
              Ağ Sağlığı / Performans
            </span>
          }
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
            {/* 1. Uptime Donut */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>
                Uptime (Son 7 Gün)
              </div>
              <div style={{ width: '120px', height: '110px', position: 'relative' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={uptimeData}
                      cx="50%"
                      cy="50%"
                      innerRadius={36}
                      outerRadius={50}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {uptimeData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  pointerEvents: 'none'
                }}>
                  <span style={{ fontSize: '14px', fontWeight: 700 }}>%{onlineRatio}</span>
                  <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>Ortalama</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', fontSize: '11px', marginTop: '6px' }}>
                <span style={{ color: '#10b981', fontWeight: 600 }}>● %{onlineRatio}</span>
                <span style={{ color: '#ef4444', fontWeight: 600 }}>● %{offlineRatio}</span>
              </div>
            </div>

            {/* 2. Ping Area Chart */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>Ortalama Ping</span>
                <span className="badge online" style={{ fontSize: '10px', padding: '1px 6px' }}>● Harika</span>
              </div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
                {avgPing} ms
              </div>
              <div style={{ height: '70px', width: '100%' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={pingTimelineData} margin={{ top: 0, right: 0, left: -25, bottom: 0 }}>
                    <defs>
                      <linearGradient id="pingGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.4}/>
                        <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.0}/>
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="time" hide />
                    <YAxis hide domain={[0, 10]} />
                    <Area type="monotone" dataKey="ping" stroke="#06b6d4" strokeWidth={2} fillOpacity={1} fill="url(#pingGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-muted)' }}>
                <span>10:00</span>
                <span>11:30</span>
                <span>13:00</span>
              </div>
            </div>

            {/* 3. Device Status Distribution */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>
                Cihaz Durum Dağılımı
              </div>
              <div style={{ width: '120px', height: '110px', position: 'relative' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={distributionData}
                      cx="50%"
                      cy="50%"
                      innerRadius={36}
                      outerRadius={50}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {distributionData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  pointerEvents: 'none'
                }}>
                  <span style={{ fontSize: '14px', fontWeight: 700 }}>{totalDevices}</span>
                  <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>Cihaz</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', fontSize: '11px', marginTop: '6px' }}>
                <span style={{ color: '#10b981', fontWeight: 600 }}>● {onlineDevices}</span>
                <span style={{ color: '#ef4444', fontWeight: 600 }}>● {offlineDevices}</span>
              </div>
            </div>
          </div>
        </Card>

        {/* Right: Recent Activities Feed */}
        <Card
          title={
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Zap size={17} color="var(--primary)" />
              Son Aktiviteler
            </span>
          }
          actions={
            <button
              className="btn btn-secondary btn-xs"
              onClick={() => onSelectTab('actions')}
            >
              Tümünü Gör
            </button>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {activities.map(act => {
              const Icon = act.icon;
              return (
                <div
                  key={act.id}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: '12px',
                    paddingBottom: '10px',
                    borderBottom: '1px solid var(--border-light)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                    <div style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: 'var(--radius-sm)',
                      backgroundColor: `${act.color}15`,
                      color: act.color,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      marginTop: '2px'
                    }}>
                      <Icon size={15} />
                    </div>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {act.desc}
                      </div>
                      <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                        {act.meta}
                      </div>
                    </div>
                  </div>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    {act.time}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Row 3: Quick Access Navigation Cards */}
      <div style={{ marginBottom: '16px' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '15px',
          fontWeight: 700,
          color: 'var(--text-primary)',
          marginBottom: '14px'
        }}>
          <Compass size={18} color="var(--primary)" />
          Hızlı Erişim
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
          gap: '16px'
        }}>
          <div
            className="card"
            style={{ padding: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '14px' }}
            onClick={() => onSelectTab('devices')}
          >
            <div style={{ width: '42px', height: '42px', borderRadius: 'var(--radius-md)', backgroundColor: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Monitor size={20} />
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: '13.5px', color: 'var(--text-primary)' }}>Cihaz Yönetimi</div>
              <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>Tüm IP / Bilgisayar Listesi</div>
            </div>
          </div>

          <div
            className="card"
            style={{ padding: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '14px' }}
            onClick={() => onSelectTab('ipam')}
          >
            <div style={{ width: '42px', height: '42px', borderRadius: 'var(--radius-md)', backgroundColor: '#ecfeff', color: '#06b6d4', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Globe size={20} />
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: '13.5px', color: 'var(--text-primary)' }}>IPAM Yönetimi</div>
              <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>Subnet & Çakışma Haritası</div>
            </div>
          </div>

          <div
            className="card"
            style={{ padding: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '14px' }}
            onClick={() => onSelectTab('ipam')}
          >
            <div style={{ width: '42px', height: '42px', borderRadius: 'var(--radius-md)', backgroundColor: '#f5f3ff', color: '#8b5cf6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Radio size={20} />
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: '13.5px', color: 'var(--text-primary)' }}>Ağ Taraması</div>
              <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>Agentless ICMP/DNS Keşif</div>
            </div>
          </div>

          <div
            className="card"
            style={{ padding: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '14px' }}
            onClick={() => onSelectTab('monitoring')}
          >
            <div style={{ width: '42px', height: '42px', borderRadius: 'var(--radius-md)', backgroundColor: '#fffbeb', color: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Bell size={20} />
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: '13.5px', color: 'var(--text-primary)' }}>Alarmlar & SLA</div>
              <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>Kural ve Kesinti Takibi</div>
            </div>
          </div>

          <div
            className="card"
            style={{ padding: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '14px' }}
            onClick={() => onSelectTab('materials')}
          >
            <div style={{ width: '42px', height: '42px', borderRadius: 'var(--radius-md)', backgroundColor: '#ecfdf5', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Package size={20} />
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: '13.5px', color: 'var(--text-primary)' }}>Malzeme Stoğu</div>
              <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>Gelen / Giden Hareketleri</div>
            </div>
          </div>

          <div
            className="card"
            style={{ padding: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '14px' }}
            onClick={() => onSelectTab('phone-directory')}
          >
            <div style={{ width: '42px', height: '42px', borderRadius: 'var(--radius-md)', backgroundColor: '#fff1f2', color: '#f43f5e', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <PhoneCall size={20} />
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: '13.5px', color: 'var(--text-primary)' }}>İç Hat Rehberi</div>
              <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>Kurumsal Dahili Numaralar</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
