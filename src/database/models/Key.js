const mongoose = require('mongoose');

const KeySchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    duration: { type: String, default: '4h' }, // ex: 4h, 2h, 30m, permanent
    isUsed: { type: Boolean, default: false },
    usedBy: { type: String, default: null }, // ID do usuário ou HWID
    expiresAt: { type: Date, default: null }, // Definido quando a key é usada pela primeira vez
    expiresToUseAt: { type: Date, default: null }, // Prazo para usar a key (resgate)
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Key', KeySchema);
