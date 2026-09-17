const { pool } = require('./db/connection');

async function run() {
    try {
        // 1. Get all devices
        const devRes = await pool.query("SELECT id, hostname, username FROM devices");
        const devices = devRes.rows;
        
        // 2. Get all usernames from device_actions
        const actRes = await pool.query("SELECT device_id, username, MAX(action_date) as max_date FROM device_actions WHERE username IS NOT NULL AND username != '' GROUP BY device_id, username");
        const actionsMap = {};
        for (const row of actRes.rows) {
            if (!actionsMap[row.device_id] || new Date(row.max_date) > new Date(actionsMap[row.device_id].max_date)) {
                actionsMap[row.device_id] = row;
            }
        }
        
        console.log(`Mapping usernames for ${devices.length} devices...`);
        let updatedCount = 0;
        
        for (const dev of devices) {
            let targetUser = '';
            
            // Check action log first
            if (actionsMap[dev.id]) {
                targetUser = actionsMap[dev.id].username.trim();
            } else {
                // Extract from hostname
                let hostPrefix = dev.hostname.split('.')[0].trim();
                hostPrefix = hostPrefix.replace(/\(.*?\)/g, '').trim(); // Remove parentheses content
                hostPrefix = hostPrefix.replace(/[-_]/g, ' ').trim(); // Replace dashes/underscores with space
                
                // Filter out generic machine hostnames
                const genericKeywords = [
                    'boyahane', 'boylab', 'bobinboya', 'boyamutfagi', 'boyelektrik', 'boykalite', 
                    'apre', 'desen', 'depo', 'aksesuar', 'danisma', 'server', 'switch', 'yazici', 
                    'printer', 'firewall', 'sanal', 'test', 'maint', 'tartı', 'tartıpc', 'lab',
                    'sevkiyat', 'muhasebe', 'arsiv', 'kesim', 'iplik', 'dokuma', 'tasarim', 'guvenlik',
                    'sistem', 'yonetim', 'mutfak', 'kamera', 'camera'
                ];
                
                const isGeneric = genericKeywords.some(kw => hostPrefix.toLowerCase().includes(kw));
                
                if (!isGeneric) {
                    // Format hostname prefix into Title Case
                    let cleanName = hostPrefix.replace(/\./g, ' ');
                    targetUser = cleanName.split(' ')
                        .map(w => w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : '')
                        .join(' ')
                        .trim();
                }
            }
            
            // Map Turkish characters or clean up if needed
            if (targetUser) {
                targetUser = targetUser
                    .replace(/ı/g, 'ı')
                    .replace(/i̇/g, 'i')
                    .replace(/ş/g, 'ş')
                    .replace(/ğ/g, 'ğ')
                    .replace(/ü/g, 'ü')
                    .replace(/ö/g, 'ö')
                    .replace(/ç/g, 'ç');
            }
            
            if (targetUser && targetUser !== dev.username) {
                await pool.query("UPDATE devices SET username = $1 WHERE id = $2", [targetUser, dev.id]);
                updatedCount++;
            }
        }
        
        console.log(`🎉 Successfully updated ${updatedCount} devices with username.`);
        process.exit(0);
    } catch (e) {
        console.error("❌ Username update failed:", e);
        process.exit(1);
    }
}

// Delay execution for 2 seconds to make sure db is connected
setTimeout(run, 2000);
