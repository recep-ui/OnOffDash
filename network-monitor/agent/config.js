require('dotenv').config();

// SERVER_URL yapılandırması:
//   Docker ortamı (Nginx reverse proxy): http://10.0.80.110     (port 80, varsayılan)
//   Docker dışı (doğrudan backend):      http://10.0.80.110:3001 (port 3001)
//
// .env dosyasında SERVER_URL tanımlayarak özelleştirebilirsiniz.
// Örnek: SERVER_URL=http://10.0.80.113:3001

function buildServerUrl() {
    if (process.env.SERVER_URL) {
        return process.env.SERVER_URL;
    }
    const host = process.env.SERVER_HOST || '10.0.80.110';
    const port = process.env.SERVER_PORT || '80';
    return `http://${host}:${port}`;
}

module.exports = {
    serverUrl: buildServerUrl(),
    heartbeatInterval: parseInt(process.env.HEARTBEAT_INTERVAL || '30000', 10),
    softwareInterval: parseInt(process.env.SOFTWARE_INTERVAL || '21600000', 10),  // 6 saat
    updateCheckInterval: parseInt(process.env.UPDATE_CHECK_INTERVAL || '21600000', 10), // 6 saat
};
