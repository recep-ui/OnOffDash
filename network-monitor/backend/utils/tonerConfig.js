/**
 * Centralized low toner threshold configuration.
 * Configured via LOW_TONER_THRESHOLD_PERCENT (default: 10).
 * Validated within range: 1–100%.
 */
function getLowTonerThreshold() {
    const rawVal = process.env.LOW_TONER_THRESHOLD_PERCENT;
    if (rawVal !== undefined && rawVal !== null && String(rawVal).trim() !== '') {
        const parsed = parseInt(String(rawVal).trim(), 10);
        if (!isNaN(parsed) && parsed >= 1 && parsed <= 100) {
            return parsed;
        }
    }
    return 10; // Default 10%
}

module.exports = { getLowTonerThreshold };
