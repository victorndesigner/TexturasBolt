const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    hwid: { type: String, required: true, unique: true },
    discordId: { type: String, default: null },
    discordTag: { type: String, default: null },
    isBlacklisted: { type: Boolean, default: false },
    blacklistReason: { type: String, default: 'Vazou textura ou fez algo proibido.' },
    lastIp: { type: String },
    lastKeyUsed: { type: String },
    lastGeneratedKey: { type: String },
    totalInstalls: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', userSchema);
