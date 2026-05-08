import { useState, useEffect, useCallback } from 'react';
import Header from './Header';
import SummaryCards from './SummaryCards';
import DeviceTable from './DeviceTable';
import DeviceModal from './DeviceModal';
import DeviceDetailModal from './DeviceDetailModal';
import PrinterTable from './PrinterTable';
import PrinterModal from './PrinterModal';
import NotificationProvider from './NotificationProvider';
import { useSocket } from '../hooks/useSocket';
import * as api from '../services/api';

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState('devices');
  const [stats, setStats] = useState(null);
  const [devices, setDevices] = useState([]);
  const [printers, setPrinters] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [departmentFilter, setDepartmentFilter] = useState('');

  // Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDevice, setEditingDevice] = useState(null);

  const [isPrinterModalOpen, setIsPrinterModalOpen] = useState(false);
  const [editingPrinter, setEditingPrinter] = useState(null);

  // Device Detail Modal
  const [detailDevice, setDetailDevice] = useState(null);

  const { connected, on, off, socket } = useSocket();

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
    loadData();
  }, [loadData]);

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

  const handleDeleteDevice = async (device) => {
    if (window.confirm(`${device.hostname} (${device.ip_address}) cihazını silmek istediğinize emin misiniz?`)) {
      try {
        await api.deleteDevice(device.id);
        // Optimistic update
        setDevices(prev => prev.filter(d => d.id !== device.id));
      } catch (err) {
        alert('Cihaz silinirken hata oluştu: ' + err.message);
      }
    }
  };

  const handleSaveDevice = async (formData) => {
    if (editingDevice) {
      await api.updateDevice(editingDevice.id, formData);
    } else {
      await api.createDevice(formData);
    }
    // Verileri yenile
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

  const handleDeletePrinter = async (printer) => {
    if (window.confirm(`${printer.name} (${printer.ip_address}) yazıcısını silmek istediğinize emin misiniz?`)) {
      try {
        await api.deletePrinter(printer.id);
        setPrinters(prev => prev.filter(p => p.id !== printer.id));
      } catch (err) {
        alert('Yazıcı silinirken hata oluştu: ' + err.message);
      }
    }
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

  return (
    <NotificationProvider socket={socket}>
      <div className="app">
        <Header socketConnected={connected} lastUpdate={stats?.lastScanTime} />
        
        <div className="tab-nav">
          <button 
            className={`tab-btn ${activeTab === 'devices' ? 'active' : ''}`}
            onClick={() => setActiveTab('devices')}
          >
            <span className="tab-icon">🖥️</span> Ağ Cihazları
          </button>
          <button 
            className={`tab-btn ${activeTab === 'printers' ? 'active' : ''}`}
            onClick={() => setActiveTab('printers')}
          >
            <span className="tab-icon">🖨️</span> Yazıcılar
            {stats?.printers?.jam > 0 && (
              <span className="tab-badge" style={{ backgroundColor: 'var(--status-offline)' }}>
                {stats.printers.jam}
              </span>
            )}
          </button>
        </div>

        <main className="main-content">
          <SummaryCards stats={stats} />
          
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
              onAddClick={handleAddDevice}
              onEdit={handleEditDevice}
              onDelete={handleDeleteDevice}
              onRowClick={handleViewDevice}
            />
          )}

          {activeTab === 'printers' && (
            <PrinterTable
              printers={printers}
              search={search}
              statusFilter={statusFilter}
              onSearchChange={setSearch}
              onStatusFilterChange={setStatusFilter}
              onAddClick={handleAddPrinter}
              onEdit={handleEditPrinter}
              onDelete={handleDeletePrinter}
            />
          )}
        </main>

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
        />

        <PrinterModal
          isOpen={isPrinterModalOpen}
          onClose={() => setIsPrinterModalOpen(false)}
          printer={editingPrinter}
          onSave={handleSavePrinter}
        />
      </div>
    </NotificationProvider>
  );
}
