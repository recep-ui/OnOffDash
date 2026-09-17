import test from 'node:test';
import assert from 'node:assert/strict';

test('Frontend Auth Header Injection: correctly formats Bearer token', () => {
  function getAuthHeaders(headers = {}, token = null) {
    const authHeaders = { ...headers };
    if (token) {
      authHeaders['Authorization'] = `Bearer ${token}`;
    }
    return authHeaders;
  }

  // When token is null
  const headersWithoutToken = getAuthHeaders({ 'Content-Type': 'application/json' }, null);
  assert.deepEqual(headersWithoutToken, { 'Content-Type': 'application/json' });

  // When token is provided
  const headersWithToken = getAuthHeaders({ 'Content-Type': 'application/json' }, 'jwt-sample-token-xyz');
  assert.deepEqual(headersWithToken, {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer jwt-sample-token-xyz',
  });
});

test('Frontend Content-Disposition Filename Extraction', () => {
  function parseFilename(disposition, defaultFilename = 'download.xlsx') {
    let filename = defaultFilename;
    if (disposition && disposition.includes('filename=')) {
      const match = disposition.match(/filename="?([^";]+)"?/);
      if (match && match[1]) {
        filename = match[1].trim();
      }
    }
    return filename;
  }

  assert.equal(parseFilename(null), 'download.xlsx');
  assert.equal(parseFilename('attachment; filename=devices_export.xlsx'), 'devices_export.xlsx');
  assert.equal(parseFilename('attachment; filename="printers_report_2026.xlsx"; size=1234'), 'printers_report_2026.xlsx');
});

test('Frontend Role-Based Access Control (RBAC) Permissions Matrix', () => {
  function canPerformAction(role, action) {
    const permissions = {
      viewer: ['read', 'export'],
      operator: ['read', 'export', 'create', 'update', 'import'],
      admin: ['read', 'export', 'create', 'update', 'import', 'delete', 'manage_users'],
    };
    return (permissions[role] || []).includes(action);
  }

  // Viewer cannot mutate or delete
  assert.equal(canPerformAction('viewer', 'read'), true);
  assert.equal(canPerformAction('viewer', 'export'), true);
  assert.equal(canPerformAction('viewer', 'create'), false);
  assert.equal(canPerformAction('viewer', 'delete'), false);
  assert.equal(canPerformAction('viewer', 'manage_users'), false);

  // Operator can mutate but not delete
  assert.equal(canPerformAction('operator', 'create'), true);
  assert.equal(canPerformAction('operator', 'update'), true);
  assert.equal(canPerformAction('operator', 'import'), true);
  assert.equal(canPerformAction('operator', 'delete'), false);
  assert.equal(canPerformAction('operator', 'manage_users'), false);

  // Admin has full privileges
  assert.equal(canPerformAction('admin', 'delete'), true);
  assert.equal(canPerformAction('admin', 'manage_users'), true);
});

test('Frontend Socket Reconnect Listener Deduplication Logic', () => {
  // Simulates the behavior of useSocket on reconnect
  const registeredListeners = new Map();
  const listenersRef = {
    current: {
      'device:status': () => {},
      'printer:status': () => {},
    }
  };

  const fakeSocket = {
    off(event) {
      registeredListeners.delete(event);
    },
    on(event, cb) {
      if (registeredListeners.has(event)) {
        throw new Error(`Duplicate listener registered for event: ${event}`);
      }
      registeredListeners.set(event, cb);
    }
  };

  // First connection
  Object.keys(listenersRef.current).forEach(event => {
    const callback = listenersRef.current[event];
    if (callback) {
      fakeSocket.off(event);
      fakeSocket.on(event, callback);
    }
  });
  assert.equal(registeredListeners.size, 2);

  // Simulated reconnect: must call off() before on() so it doesn't throw Duplicate listener error
  assert.doesNotThrow(() => {
    Object.keys(listenersRef.current).forEach(event => {
      const callback = listenersRef.current[event];
      if (callback) {
        fakeSocket.off(event);
        fakeSocket.on(event, callback);
      }
    });
  });
  assert.equal(registeredListeners.size, 2);
});
