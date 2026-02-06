const mongoose = require('mongoose');

const KeyRequestSchema = new mongoose.Schema({
    token: { type: String, required: true, unique: true },
    userId: { type: String, required: true },
    userTag: { type: String, required: true },
    createdAt: { type: Date, default: Date.now, expires: 900 } // 15 minutos para passar pelo encurtador
});

module.exports = mongoose.model('KeyRequest', KeyRequestSchema);
