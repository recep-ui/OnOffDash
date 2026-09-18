/**
 * Cookie parsing and setting helper for HttpOnly session management.
 * Avoids extra third-party dependencies while guaranteeing secure cookie flags.
 */

function parseCookies(req) {
    const list = {};
    const cookieHeader = req?.headers?.cookie;
    if (!cookieHeader) return list;

    cookieHeader.split(';').forEach(cookie => {
        const parts = cookie.split('=');
        if (parts.length >= 2) {
            const name = parts[0].trim();
            const val = parts.slice(1).join('=').trim();
            try {
                list[name] = decodeURIComponent(val);
            } catch {
                list[name] = val;
            }
        }
    });

    return list;
}

function setRefreshTokenCookie(res, refreshToken, maxAgeSeconds = 7 * 24 * 60 * 60) {
    const isProd = process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === 'true';
    const cookieParts = [
        `refreshToken=${encodeURIComponent(refreshToken)}`,
        'Path=/api/auth',
        'HttpOnly',
        'SameSite=Strict',
        `Max-Age=${maxAgeSeconds}`
    ];

    if (isProd) {
        cookieParts.push('Secure');
    }

    res.setHeader('Set-Cookie', cookieParts.join('; '));
}

function clearRefreshTokenCookie(res) {
    const isProd = process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === 'true';
    const cookieParts = [
        'refreshToken=',
        'Path=/api/auth',
        'HttpOnly',
        'SameSite=Strict',
        'Max-Age=0'
    ];

    if (isProd) {
        cookieParts.push('Secure');
    }

    res.setHeader('Set-Cookie', cookieParts.join('; '));
}

module.exports = {
    parseCookies,
    setRefreshTokenCookie,
    clearRefreshTokenCookie
};
