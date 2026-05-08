const API_BASE = '/api';

export async function fetchDevices(params = {}) {
  const query = new URLSearchParams(params).toString();
  const res = await fetch(`${API_BASE}/devices${query ? '?' + query : ''}`);
  if (!res.ok) throw new Error('Failed to fetch devices');
  return res.json();
}

export async function fetchDevice(id) {
  const res = await fetch(`${API_BASE}/devices/${id}`);
  if (!res.ok) throw new Error('Failed to fetch device');
  return res.json();
}

export async function createDevice(data) {
  const res = await fetch(`${API_BASE}/devices`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to create device');
  }
  return res.json();
}

export async function updateDevice(id, data) {
  const res = await fetch(`${API_BASE}/devices/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update device');
  return res.json();
}

export async function deleteDevice(id) {
  const res = await fetch(`${API_BASE}/devices/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete device');
  return res.json();
}

export async function fetchDepartments() {
  const res = await fetch(`${API_BASE}/devices/departments`);
  if (!res.ok) throw new Error('Failed to fetch departments');
  return res.json();
}

export async function fetchDashboardStats() {
  const res = await fetch(`${API_BASE}/dashboard/stats`);
  if (!res.ok) throw new Error('Failed to fetch stats');
  return res.json();
}

export async function fetchDeviceLogs(id, limit = 50) {
  const res = await fetch(`${API_BASE}/devices/${id}/logs?limit=${limit}`);
  if (!res.ok) throw new Error('Failed to fetch logs');
  return res.json();
}

export async function fetchDeviceHeartbeats(id, limit = 50) {
  const res = await fetch(`${API_BASE}/devices/${id}/heartbeats?limit=${limit}`);
  if (!res.ok) throw new Error('Failed to fetch heartbeats');
  return res.json();
}

// ===== PRINTER APIs =====
export async function fetchPrinters() {
  const res = await fetch(`${API_BASE}/printers`);
  if (!res.ok) throw new Error('Failed to fetch printers');
  return res.json();
}

export async function createPrinter(data) {
  const res = await fetch(`${API_BASE}/printers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create printer');
  return res.json();
}

export async function updatePrinter(id, data) {
  const res = await fetch(`${API_BASE}/printers/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update printer');
  return res.json();
}

export async function deletePrinter(id) {
  const res = await fetch(`${API_BASE}/printers/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete printer');
  return res.json();
}
