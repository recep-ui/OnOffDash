import { useState, useEffect, useCallback } from 'react';
import AppShell from './layout/AppShell';
import DashboardOverview from './dashboard/DashboardOverview';
import DeviceTable from './DeviceTable';
import DeviceModal from './DeviceModal';
import DeviceDetailModal from './DeviceDetailModal';
import PrinterTable from './PrinterTable';
import PrinterModal from './PrinterModal';
import NotificationProvider, { useNotification } from './NotificationProvider';
import TonerStockPanel from './TonerStockPanel';
import ActionsPanel from './ActionsPanel';
import MaterialsPanel from './MaterialsPanel';
import MaintenanceGridPanel from './MaintenanceGridPanel';
import { useSocket } from '../hooks/useSocket';
import * as api from '../services/api';
import Login from './Login';
import AnalyticsPanel from './AnalyticsPanel';
import PhoneDirectoryPanel from './PhoneDirectoryPanel';
import IpamPanel from './IpamPanel';
import PdfToolsDashboard from '../pages/pdf-tools/PdfToolsDashboard';
import FileToolsDashboard from '../pages/file-tools/FileToolsDashboard';
import ConfirmDialog from './ui/ConfirmDialog';
import ForceChangePassword from './ForceChangePassword';
import { useAuth } from '../context/AuthContext';

export default function Dashboard() {
  const { token, user, login: handleLogin, logout: handleLogout, loading } = useAuth();
  const { connected, on, off, socket } = useSocket(token);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', backgroundColor: '#0f172a', color: '#94a3b8' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: '36px', height: '36px', border: '3px solid #6366f1', borderTopColor: 'transparent', borderRadius: '50%', margin: '0 auto 16px auto', animation: 'spin 1s linear infinite' }} />
          <p style={{ fontSize: '14px', margin: 0 }}>Oturum doğrulanıyor...</p>
        </div>
      </div>
    );
  }

  return (
    <NotificationProvider socket={socket}>
      <DashboardContent 
        connected={connected} 
        on={on} 
        off={off} 
        socket={socket}
        token={token}
        user={user}
        onLogin={handleLogin}
        onLogout={handleLogout}
      />
    </NotificationProvider>
  );
}

function DashboardContent({ connected, on, off, socket, token, user, onLogin, onLogout }) {
  const { showToast } = useNotification();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [stats, setStats] = useState(null);
  const [devices, setDevices] = useState([]);
  const [printers, setPrinters] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters for Device Table
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [departmentFilter, setDepartmentFilter] = useState('');

  // Modals
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDevice, setEditingDevice] = useState(null);

  const [isPrinterModalOpen, setIsPrinterModalOpen] = useState(false);
  const [editingPrinter, setEditingPrinter] = useState(null);

  // Custom delete confirmation modal state
  const [deleteConfirm, setDeleteConfirm] = useState({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: null
  });

  // Device Detail Modal
  const [detailDevice, setDetailDevice] = useState(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [statsData, devicesData, deptsData, printersData] = await Promise.all([
        api.fetchDashboardStats(),
        api.fetchDevices(),
        api.fetchDepartments(),
        api.fetchPrinters()
      ]);
      setStats(statsData);
      setDevices(devicesData);
      setDepartments(deptsData);
      setPrinters(printersData);
    } catch (err) {
      console.error('Failed to load data', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (token) {
      loadData();
    }
  }, [loadData, token]);

  // Socket event listeners
  useEffect(() => {
    const handleDeviceUpdated = (device) => {
      setDevices(prev => {
        const index = prev.findIndex(d => d.id === device.id);
        if (index >= 0) {
          const newDevices = [...prev];
          newDevices[index] = device;
          return newDevices;
        }
        return [...prev, device];
      });
    };

    const handleDeviceAdded = (device) => {
      setDevices(prev => [...prev, device]);
      if (device.department && !departments.includes(device.department)) {
        setDepartments(prev => [...prev, device.department].sort());
      }
    };

    const handleDeviceDeleted = ({ id }) => {
      setDevices(prev => prev.filter(d => d.id !== id));
    };

    const handleHeartbeatReceived = (data) => {
      setDevices(prev => prev.map(d => {
        if (d.id === data.device_id) {
          return {
            ...d,
            cpu_usage: data.cpu_usage,
            ram_usage: data.ram_usage,
            uptime_seconds: data.uptime_seconds,
            last_seen: data.last_seen
          };
        }
        return d;
      }));
    };

    const handleStats = (newStats) => {
      setStats(prev => ({
        ...prev,
        devices: newStats.devices || prev?.devices,
        printers: newStats.printers || prev?.printers,
        lastScanTime: newStats.lastScanTime
      }));
    };

    const handlePrinterAdded = (printer) => {
      setPrinters(prev => [...prev, printer]);
    };

    const handlePrinterUpdated = (printer) => {
      setPrinters(prev => {
        const index = prev.findIndex(p => p.id === printer.id);
        if (index >= 0) {
          const newPrinters = [...prev];
          newPrinters[index] = printer;
          return newPrinters;
        }
        return [...prev, printer];
      });
    };

    const handlePrinterDeleted = ({ id }) => {
      setPrinters(prev => prev.filter(p => p.id !== id));
    };

    on('device:updated', handleDeviceUpdated);
    on('device:added', handleDeviceAdded);
    on('device:deleted', handleDeviceDeleted);
    on('heartbeat:received', handleHeartbeatReceived);
    on('printer:added', handlePrinterAdded);
    on('printer:updated', handlePrinterUpdated);
    on('printer:deleted', handlePrinterDeleted);
    on('dashboard:stats', handleStats);

    return () => {
      off('device:updated');
      off('device:added');
      off('device:deleted');
      off('heartbeat:received');
      off('printer:added');
      off('printer:updated');
      off('printer:deleted');
      off('dashboard:stats');
    };
  }, [on, off, departments]);

  const handleAddDevice = () => {
    setEditingDevice(null);
    setIsModalOpen(true);
  };

  const handleEditDevice = (device) => {
    setEditingDevice(device);
    setIsModalOpen(true);
  };

  const handleDeleteDevice = (device) => {
    setDeleteConfirm({
      isOpen: true,
      title: 'Cihazı Sil',
      message: `${device.hostname} (${device.ip_address}) cihazını silmek istediğinize emin misiniz? Bu işlem cihazın tüm geçmişini kalıcı olarak silecektir.`,
      onConfirm: async () => {
        try {
          await api.deleteDevice(device.id);
          setDevices(prev => prev.filter(d => d.id !== device.id));
          showToast('success', '🗑️ Cihaz Silindi', 'Cihaz ve tüm bağlı veriler başarıyla silindi.');
        } catch (err) {
          showToast('error', '❌ Hata', 'Cihaz silinirken hata oluştu: ' + err.message);
        }
      }
    });
  };

  const handleSaveDevice = async (formData) => {
    if (editingDevice) {
      await api.updateDevice(editingDevice.id, formData);
    } else {
      await api.createDevice(formData);
    }
    loadData();
  };

  const handleAddPrinter = () => {
    setEditingPrinter(null);
    setIsPrinterModalOpen(true);
  };

  const handleEditPrinter = (printer) => {
    setEditingPrinter(printer);
    setIsPrinterModalOpen(true);
  };

  const handleDeletePrinter = (printer) => {
    setDeleteConfirm({
      isOpen: true,
      title: 'Yazıcıyı Sil',
      message: `${printer.name} (${printer.ip_address}) yazıcısını silmek istediğinize emin misiniz? Bu işlem yazıcıyı sistemden kalıcı olarak kaldıracaktır.`,
      onConfirm: async () => {
        try {
          await api.deletePrinter(printer.id);
          setPrinters(prev => prev.filter(p => p.id !== printer.id));
          showToast('success', '🗑️ Yazıcı Silindi', 'Yazıcı başarıyla silindi.');
        } catch (err) {
          showToast('error', '❌ Hata', 'Yazıcı silinirken hata oluştu: ' + err.message);
        }
      }
    });
  };

  const handleSavePrinter = async (formData) => {
    if (editingPrinter) {
      await api.updatePrinter(editingPrinter.id, formData);
    } else {
      await api.createPrinter(formData);
    }
    loadData();
  };

  const handleViewDevice = (device) => {
    setDetailDevice(device);
  };

  const handleImportExcel = async (file) => {
    try {
      showToast('info', '📥 Excel Yükleniyor', 'Excel dosyası işleniyor, lütfen bekleyin...');
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const dataUrl = e.target.result;
          const base64Data = dataUrl.split(',')[1];
          const result = await api.importExcel(base64Data);
          showToast('success', '✅ İçe Aktarma Başarılı', `Cihazlar başarıyla içe aktarıldı: ${result.updatedCount} güncellendi, ${result.insertedCount} yeni cihaz eklendi.`);
          loadData();
        } catch (err) {
          console.error(err);
          showToast('error', '❌ Hata', 'Excel içe aktarılırken bir hata oluştu: ' + err.message);
        }
      };
      reader.onerror = () => {
        showToast('error', '❌ Hata', 'Dosya okunurken bir hata oluştu.');
      };
      reader.readAsDataURL(file);
    } catch (err) {
      showToast('error', '❌ Hata', err.message);
    }
  };

  const handleExportExcel = async () => {
    try {
      showToast('info', '📤 Excel Hazırlanıyor', 'Excel dosyası indiriliyor...');
      await api.downloadFileWithAuth('/api/devices/export', 'Cihaz_Envanter_Export.xlsx');
      showToast('success', '✅ İndirme Başarılı', 'Cihaz envanteri Excel dosyası indirildi.');
    } catch (err) {
      showToast('error', '❌ Hata', 'Excel dışa aktarılırken hata oluştu: ' + err.message);
    }
  };

  if (!token) {
    return <Login onLogin={onLogin} />;
  }

  if (user && user.must_change_password) {
    return (
      <ForceChangePassword 
        token={token} 
        onPasswordChanged={onLogin} 
        onLogout={onLogout} 
      />
    );
  }

  return (
    <AppShell
      activeTab={activeTab}
      onSelectTab={setActiveTab}
      socketConnected={connected}
      lastUpdate={stats?.lastScanTime}
      user={user}
      onLogout={onLogout}
      stats={stats}
      devices={devices}
      printers={printers}
      onSelectDevice={handleViewDevice}
      onSelectPrinter={(printer) => {
        setActiveTab('printers');
      }}
    >
      {/* 1. Main Dashboard (Exact Reference Design View) */}
      {activeTab === 'dashboard' && (
        <DashboardOverview
          user={user}
          stats={stats}
          devices={devices}
          printers={printers}
          onSelectTab={setActiveTab}
          onViewDevice={handleViewDevice}
          onViewPrinter={() => setActiveTab('printers')}
        />
      )}

      {/* 2. Devices Tab */}
      {activeTab === 'devices' && (
        <DeviceTable
          devices={devices}
          search={search}
          statusFilter={statusFilter}
          departmentFilter={departmentFilter}
          departments={departments}
          onSearchChange={setSearch}
          onStatusFilterChange={setStatusFilter}
          onDepartmentFilterChange={setDepartmentFilter}
          onAddClick={user?.role !== 'viewer' ? handleAddDevice : null}
          onEdit={user?.role !== 'viewer' ? handleEditDevice : null}
          onDelete={user?.role === 'admin' ? handleDeleteDevice : null}
          onRowClick={handleViewDevice}
          onImportExcel={user?.role !== 'viewer' ? handleImportExcel : null}
          onExportExcel={handleExportExcel}
          role={user?.role}
        />
      )}

      {/* 3. Printers & Toner Stock Tab */}
      {activeTab === 'printers' && (
        <>
          <PrinterTable
            printers={printers}
            search={search}
            statusFilter={statusFilter}
            onSearchChange={setSearch}
            onStatusFilterChange={setStatusFilter}
            onAddClick={user?.role !== 'viewer' ? handleAddPrinter : null}
            onEdit={user?.role !== 'viewer' ? handleEditPrinter : null}
            onDelete={user?.role === 'admin' ? handleDeletePrinter : null}
            onRefresh={loadData}
            role={user?.role}
          />
          <TonerStockPanel role={user?.role} />
        </>
      )}

      {/* 4. Maintenance Tab */}
      {activeTab === 'maintenance' && (
        <MaintenanceGridPanel role={user?.role} />
      )}

      {/* 5. Actions / Tasks Tab */}
      {(activeTab === 'actions' || activeTab === 'actions-group') && (
        <ActionsPanel role={user?.role} onSwitchTab={setActiveTab} />
      )}

      {/* 6. Materials / Stock Tab */}
      {activeTab === 'materials' && (
        <MaterialsPanel role={user?.role} onSwitchTab={setActiveTab} />
      )}

      {/* 7. Phone Directory Tab */}
      {activeTab === 'phone-directory' && (
        <PhoneDirectoryPanel role={user?.role} />
      )}

      {/* 8. Analytics & Monitoring Tab */}
      {(activeTab === 'analytics' || activeTab === 'monitoring') && (
        <AnalyticsPanel />
      )}

      {/* 9. IPAM & Network Tab */}
      {(activeTab === 'ipam' || activeTab === 'network') && (
        <IpamPanel />
      )}

      {/* 10. PDF Tools Tab */}
      {activeTab === 'pdf-tools' && (
        <PdfToolsDashboard />
      )}

      {/* 11. File Tools Tab */}
      {(activeTab === 'file-tools' || activeTab === 'tools') && (
        <FileToolsDashboard />
      )}

      {/* Modals */}
      <DeviceModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        device={editingDevice}
        onSave={handleSaveDevice}
      />

      <DeviceDetailModal
        isOpen={!!detailDevice}
        onClose={() => setDetailDevice(null)}
        device={detailDevice}
        onUpdate={setDetailDevice}
        role={user?.role}
      />

      <PrinterModal
        isOpen={isPrinterModalOpen}
        onClose={() => setIsPrinterModalOpen(false)}
        printer={editingPrinter}
        onSave={handleSavePrinter}
      />

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
    </AppShell>
  );
}
