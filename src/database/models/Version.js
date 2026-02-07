const mongoose = require('mongoose');

const VersionSchema = new mongoose.Schema({
    id: { type: String, default: 'global' },
    version: { type: String, default: '1.0' },
    keyShortener: { type: String, default: 'https://seulink.com' },
    defaultAccessTime: { type: String, default: '4h' },
    keyUseDeadline: { type: String, default: '24h' },
    targetFolderName: { type: String, default: 'StumbleCups' },
    removeUrlPart1: { type: String, default: '' },
    removeUrlPart2: { type: String, default: '' },
    profileImage: { type: String, default: 'https://i.imgur.com/YahM0Nf.png' },
    requiredServerId: { type: String, default: '' },
    requiredServerName: { type: String, default: '' },
    requiredServerInvite: { type: String, default: '' },
    keysChannelUrl: { type: String, default: 'https://discord.gg/bolttexturas' },
    updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Version', VersionSchema);
