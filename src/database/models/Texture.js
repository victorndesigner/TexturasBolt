const mongoose = require('mongoose');

const TextureSchema = new mongoose.Schema({
    name: { type: String, required: true },
    category: { type: String, default: 'Geral' },
    profileImage: { type: String, default: 'https://i.imgur.com/YahM0Nf.png' },
    downloadUrl: { type: String, required: true },
    downloadUrlPart2: { type: String, default: '' },
    shortenerUrl: { type: String, default: '' },
    removeUrlPart1: { type: String, default: '' },
    removeUrlPart2: { type: String, default: '' },
    version: { type: String, default: '1.0' },
    isUpdated: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Texture', TextureSchema);
