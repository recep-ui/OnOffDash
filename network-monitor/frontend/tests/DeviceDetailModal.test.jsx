import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import DeviceDetailModal from '../src/components/DeviceDetailModal';

describe('DeviceDetailModal Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should render nothing when device prop is null', () => {
    const { container } = render(<DeviceDetailModal device={null} onClose={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('should render modal header, hostname, IP, and navigation tabs when device is provided', () => {
    const sampleDevice = {
      id: 42,
      hostname: 'SRV-MAIN-DC',
      ip_address: '192.168.1.10',
      mac_address: '00:1B:44:11:3A:B7',
      status: 'online',
      department: 'IT Infrastructure',
      cpu_usage: 35.5,
      ram_usage: 55.2,
      disk_usage: 70.0,
      uptime_seconds: 86400,
      agent_installed: true,
      agent_status: 'online',
      last_seen: new Date().toISOString()
    };

    render(<DeviceDetailModal device={sampleDevice} onClose={vi.fn()} onUpdate={vi.fn()} />);

    expect(screen.getByText('SRV-MAIN-DC')).toBeInTheDocument();
    expect(screen.getByText(/192.168.1.10/)).toBeInTheDocument();
    expect(screen.getByText('Performans & Grafikler')).toBeInTheDocument();
    expect(screen.getByText('Yazılım Envanteri')).toBeInTheDocument();
    expect(screen.getByText('Donanım & Parçalar')).toBeInTheDocument();
  });
});
