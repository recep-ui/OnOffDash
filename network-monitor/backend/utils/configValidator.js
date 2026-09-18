/**
 * Production Configuration Validator.
 * Verifies environment configuration on application startup.
 * Halts startup in production if insecure defaults or missing secrets are detected.
 */
function validateConfig(options = { exitOnError: true }) {
    const isProd = process.env.NODE_ENV === 'production';
    const errors = [];

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret || typeof jwtSecret !== 'string') {
        errors.push('JWT_SECRET is missing or empty.');
    } else if (jwtSecret.trim().length < 32) {
        errors.push(`JWT_SECRET must be at least 32 characters long (current length: ${jwtSecret.trim().length}).`);
    } else if (isProd && (jwtSecret.includes('ReplaceWith') || jwtSecret.includes('secret-key-2026') || jwtSecret.includes('changeme') || jwtSecret.includes('insecure'))) {
        errors.push('JWT_SECRET uses an insecure placeholder value in production.');
    }

    const agentKey = process.env.AGENT_API_KEY;
    if (!agentKey || typeof agentKey !== 'string') {
        errors.push('AGENT_API_KEY is missing or empty.');
    } else if (agentKey.trim().length < 32) {
        errors.push(`AGENT_API_KEY must be at least 32 characters long (current length: ${agentKey.trim().length}).`);
    } else if (isProd && (agentKey.includes('ReplaceWith') || agentKey.includes('changeme'))) {
        errors.push('AGENT_API_KEY uses an insecure placeholder value in production.');
    }

    const dbPassword = process.env.DB_PASSWORD || process.env.DB_APP_PASSWORD;
    if (isProd && dbPassword) {
        const forbidden = ['password', '123456', 'admin', 'admin123', 'root', 'sa'];
        if (forbidden.includes(dbPassword.toLowerCase()) || dbPassword.includes('ReplaceWith')) {
            errors.push('Database password uses an insecure default/placeholder in production.');
        }
    }

    const corsOrigins = process.env.CORS_ORIGINS || process.env.CORS_ORIGIN;
    if (isProd) {
        if (!corsOrigins || typeof corsOrigins !== 'string' || corsOrigins.trim() === '') {
            errors.push('CORS_ORIGINS is mandatory in production.');
        } else {
            const originsList = corsOrigins.split(',').map(s => s.trim()).filter(Boolean);
            if (originsList.includes('*')) {
                errors.push('Wildcard CORS origin (*) is forbidden in production.');
            }
        }
    }

    if (errors.length > 0) {
        console.error('❌ FATAL CONFIGURATION ERRORS:');
        errors.forEach(err => console.error(`   - ${err}`));
        if (isProd || process.env.STRICT_CONFIG === 'true') {
            if (options.exitOnError !== false) {
                console.error('Process startup aborted due to critical security configuration errors.');
                process.exit(1);
            } else {
                throw new Error(errors.join('; '));
            }
        } else {
            console.warn('⚠️ Running with configuration warnings (allowed in non-production mode).');
        }
        return false;
    }

    return true;
}

module.exports = { validateConfig };
