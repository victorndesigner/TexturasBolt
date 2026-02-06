/**
 * Converte string de duração para milissegundos
 * Suporta: s (segundos), m (minutos), h (horas), d (dias), a (anos)
 * Exemplos: '4h', '7d', '1a', '1d30m20s', '2h30m'
 * 
 * @param {string} duration - String de duração (ex: '1d30m20s')
 * @returns {number} - Duração em milissegundos
 */
function parseDuration(duration) {
    if (duration === 'permanente' || duration === 'permanent') {
        return null; // Null = permanente
    }

    const regex = /(\d+)([smhda])/g;
    let totalMs = 0;
    let match;

    while ((match = regex.exec(duration)) !== null) {
        const value = parseInt(match[1]);
        const unit = match[2];

        switch (unit) {
            case 's': // segundos
                totalMs += value * 1000;
                break;
            case 'm': // minutos
                totalMs += value * 60 * 1000;
                break;
            case 'h': // horas
                totalMs += value * 60 * 60 * 1000;
                break;
            case 'd': // dias
                totalMs += value * 24 * 60 * 60 * 1000;
                break;
            case 'a': // anos (365 dias)
                totalMs += value * 365 * 24 * 60 * 60 * 1000;
                break;
        }
    }

    return totalMs || null;
}

/**
 * Aplica duração a uma data base
 * @param {Date} baseDate - Data base (geralmente Date.now())
 * @param {string} duration - String de duração
 * @returns {Date|null} - Data de expiração ou null se permanente
 */
function applyDuration(baseDate, duration) {
    const ms = parseDuration(duration);
    if (ms === null) return null; // Permanente

    return new Date(baseDate.getTime() + ms);
}

module.exports = { parseDuration, applyDuration };
