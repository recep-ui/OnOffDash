require('dotenv').config();

// SERVER_URL precedence:
// 1. Explicit SERVER_URL environment variable
// 2. SERVER_HOST + SERVER_PORT
// 3. Localhost fallback for development
function buildServerUrl() {
    if (process.env.SERVER_URL) {
        return process.env.SERVER_URL.replace(/\/+$/, '');
    }
    const host = process.env.SERVER_HOST || 'localhost';
    const port = process.env.SERVER_PORT || '80';
    return `http://${host}:${port}`;
}

module.exports = {
    serverUrl: buildServerUrl(),
    agentApiKey: process.env.AGENT_API_KEY || '',
    heartbeatInterval: parseInt(process.env.HEARTBEAT_INTERVAL || '30000', 10),
    softwareInterval: parseInt(process.env.SOFTWARE_INTERVAL || '21600000', 10),  // 6 saat
    updateCheckInterval: parseInt(process.env.UPDATE_CHECK_INTERVAL || '21600000', 10), // 6 saat
};
