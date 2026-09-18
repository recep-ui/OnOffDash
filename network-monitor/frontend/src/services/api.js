const API_BASE = '/api';

let inMemoryAccessToken = null;

export function setAccessToken(token) {
  inMemoryAccessToken = token;
}

export function getAccessToken() {
  return inMemoryAccessToken;
}

export function getAuthHeaders(headers = {}) {
  const token = inMemoryAccessToken;
  const authHeaders = { ...headers };
  if (token) {
    authHeaders['Authorization'] = `Bearer ${token}`;
  }
  return authHeaders;
}

export async function fetchWithAuth(url, options = {}) {
  const headers = getAuthHeaders(options.headers || {});
  const res = await fetch(url, { ...options, headers, credentials: 'include' });

  // 401 durumunda HttpOnly refresh cookie ile tek seferlik sessiz yenileme dene
  if (res.status === 401 && !url.includes('/api/auth/refresh') && !url.includes('/api/auth/login')) {
    try {
      const refreshRes = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      });
      if (refreshRes.ok) {
        const data = await refreshRes.json();
        if (data.token) {
          setAccessToken(data.token);
          window.dispatchEvent(new CustomEvent('auth:refreshed', { detail: data }));
          const retryHeaders = getAuthHeaders(options.headers || {});
          return fetch(url, { ...options, headers: retryHeaders, credentials: 'include' });
        }
      }
    } catch (_) {}

    setAccessToken(null);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('auth:logout'));
    }
  }

  return res;
}

export async function fetchDevices(params = {}) {
  const query = new URLSearchParams(params).toString();
  const res = await fetchWithAuth(`${API_BASE}/devices${query ? '?' + query : ''}`);
  if (!res.ok) throw new Error('Failed to fetch devices');
  return res.json();
}

export async function fetchDevice(id) {
  const res = await fetchWithAuth(`${API_BASE}/devices/${id}`);
  if (!res.ok) throw new Error('Failed to fetch device');
  return res.json();
}

export async function createDevice(data) {
  const res = await fetchWithAuth(`${API_BASE}/devices`, {
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
  const res = await fetchWithAuth(`${API_BASE}/devices/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update device');
  return res.json();
}

export async function deleteDevice(id) {
  const res = await fetchWithAuth(`${API_BASE}/devices/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete device');
  return res.json();
}

export async function fetchDepartments() {
  const res = await fetchWithAuth(`${API_BASE}/devices/departments`);
  if (!res.ok) throw new Error('Failed to fetch departments');
  return res.json();
}

export async function fetchDashboardStats() {
  const res = await fetchWithAuth(`${API_BASE}/dashboard/stats`);
  if (!res.ok) throw new Error('Failed to fetch stats');
  return res.json();
}

export async function fetchDeviceLogs(id, limit = 50) {
  const res = await fetchWithAuth(`${API_BASE}/devices/${id}/logs?limit=${limit}`);
  if (!res.ok) throw new Error('Failed to fetch logs');
  return res.json();
}

export async function fetchDeviceHeartbeats(id, limit = 50) {
  const res = await fetchWithAuth(`${API_BASE}/devices/${id}/heartbeats?limit=${limit}`);
  if (!res.ok) throw new Error('Failed to fetch heartbeats');
  return res.json();
}

// ===== PRINTER APIs =====
export async function fetchPrinters() {
  const res = await fetchWithAuth(`${API_BASE}/printers`);
  if (!res.ok) throw new Error('Failed to fetch printers');
  return res.json();
}

export async function createPrinter(data) {
  const res = await fetchWithAuth(`${API_BASE}/printers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create printer');
  return res.json();
}

export async function updatePrinter(id, data) {
  const res = await fetchWithAuth(`${API_BASE}/printers/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update printer');
  return res.json();
}

export async function deletePrinter(id) {
  const res = await fetchWithAuth(`${API_BASE}/printers/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete printer');
  return res.json();
}

export async function importExcel(fileData) {
  const res = await fetchWithAuth(`${API_BASE}/devices/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileData }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to import Excel');
  }
  return res.json();
}

// ===== MAINTENANCE APIs =====
export async function importMaintenanceExcel(fileData) {
  const res = await fetchWithAuth(`${API_BASE}/maintenance/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileData }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Bakım listesi içe aktarılamadı.');
  }
  return res.json();
}

// ===== ACTIONS & MATERIALS APIs =====
export async function importActionsExcel(fileData, type = 'action') {
  const res = await fetchWithAuth(`${API_BASE}/actions/import?type=${type}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileData, type }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'İşlem listesi içe aktarılamadı.');
  }
  return res.json();
}

// ===== TONER STOCK & REPLACEMENT APIs =====
export async function importTonerStockExcel(fileData) {
  const res = await fetchWithAuth(`${API_BASE}/printers/toners/stock/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileData }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Toner stokları içe aktarılamadı.');
  }
  return res.json();
}

export async function importTonerReplacementsExcel(fileData) {
  const res = await fetchWithAuth(`${API_BASE}/printers/toners/replacements/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileData }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Toner değişimleri içe aktarılamadı.');
  }
  return res.json();
}

// ===== PHONE DIRECTORY APIs =====
export async function fetchPhoneDirectory(params = {}) {
  const query = new URLSearchParams(params).toString();
  const res = await fetchWithAuth(`${API_BASE}/phone-directory${query ? '?' + query : ''}`);
  if (!res.ok) throw new Error('Rehber verileri yüklenemedi.');
  return res.json();
}

export async function createPhoneEntry(data) {
  const res = await fetchWithAuth(`${API_BASE}/phone-directory`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Kayıt eklenemedi.');
  }
  return res.json();
}

export async function updatePhoneEntry(id, data) {
  const res = await fetchWithAuth(`${API_BASE}/phone-directory/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Kayıt güncellenemedi.');
  }
  return res.json();
}

export async function deletePhoneEntry(id) {
  const res = await fetchWithAuth(`${API_BASE}/phone-directory/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Kayıt silinemedi.');
  return res.json();
}

export async function importPhoneDirectoryExcel(fileData) {
  const res = await fetchWithAuth(`${API_BASE}/phone-directory/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileData }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Excel içe aktarılamadı.');
  }
  return res.json();
}

// ===== IPAM APIs =====
export async function fetchIpamSummary() {
  const res = await fetchWithAuth(`${API_BASE}/ipam/summary`);
  if (!res.ok) throw new Error('IPAM özet verileri alınamadı.');
  return res.json();
}

export async function fetchIpamConflicts() {
  const res = await fetchWithAuth(`${API_BASE}/ipam/conflicts`);
  if (!res.ok) throw new Error('IP çakışma raporu alınamadı.');
  return res.json();
}

export async function suggestNextIp(subnet = '') {
  const res = await fetchWithAuth(`${API_BASE}/ipam/suggest${subnet ? '?subnet=' + encodeURIComponent(subnet) : ''}`);
  if (!res.ok) throw new Error('IP önerisi alınamadı.');
  return res.json();
}

/**
 * Downloads a file from an authenticated endpoint using Bearer token without exposing the token in query strings or URL history.
 * @param {string} url - Target URL to fetch
 * @param {string} defaultFilename - Fallback filename if Content-Disposition header is missing
 */
export async function downloadFileWithAuth(url, defaultFilename = 'download.xlsx') {
  const token = getAccessToken();
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    },
    credentials: 'include'
  });

  if (!response.ok) {
    let errorMsg = 'Dosya indirilemedi';
    try {
      const errJson = await response.json();
      errorMsg = errJson.error || errorMsg;
    } catch (_) {}
    throw new Error(errorMsg);
  }

  const disposition = response.headers.get('Content-Disposition');
  let filename = defaultFilename;
  if (disposition && disposition.includes('filename=')) {
    const match = disposition.match(/filename="?([^";]+)"?/);
    if (match && match[1]) {
      filename = match[1].trim();
    }
  }

  const blob = await response.blob();
  const blobUrl = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => window.URL.revokeObjectURL(blobUrl), 1000);
}

