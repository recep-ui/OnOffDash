import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchWithAuth, fetchDevices, downloadFileWithAuth } from '../src/services/api';

describe('API Service (Real Production Module)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('fetchWithAuth should inject Authorization: Bearer header when token exists in localStorage', async () => {
    localStorage.setItem('token', 'my-auth-token-xyz');

    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 'ok' }),
    });

    await fetchWithAuth('/api/test-endpoint');

    expect(globalThis.fetch).toHaveBeenCalledWith('/api/test-endpoint', expect.objectContaining({
      headers: expect.objectContaining({
        'Authorization': 'Bearer my-auth-token-xyz',
      })
    }));
  });

  it('fetchWithAuth should not include Authorization header when no token is in localStorage', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 'ok' }),
    });

    await fetchWithAuth('/api/public-endpoint');

    const headers = globalThis.fetch.mock.calls[0][1].headers;
    expect(headers['Authorization']).toBeUndefined();
  });

  it('fetchDevices should append query parameters correctly', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => [{ id: 1, hostname: 'Device1' }],
    });

    const result = await fetchDevices({ department: 'IT', status: 'online' });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/devices?department=IT&status=online'),
      expect.any(Object)
    );
    expect(result).toEqual([{ id: 1, hostname: 'Device1' }]);
  });

  it('downloadFileWithAuth should parse Content-Disposition filename and trigger anchor download', async () => {
    localStorage.setItem('token', 'token-for-download');

    const mockBlob = new Blob(['sample data'], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      headers: new Headers({
        'Content-Disposition': 'attachment; filename="monthly_report_2026.xlsx"'
      }),
      blob: async () => mockBlob,
    });

    // Mock window.URL and DOM link click
    window.URL.createObjectURL = vi.fn().mockReturnValue('blob:http://localhost/mock-blob-uuid');
    window.URL.revokeObjectURL = vi.fn();

    await downloadFileWithAuth('/api/devices/export');

    expect(globalThis.fetch).toHaveBeenCalledWith('/api/devices/export', expect.objectContaining({
      method: 'GET',
      headers: expect.objectContaining({
        'Authorization': 'Bearer token-for-download'
      })
    }));
    expect(window.URL.createObjectURL).toHaveBeenCalledWith(mockBlob);
  });
});
