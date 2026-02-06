const { Client, GatewayIntentBits, Collection, Events } = require('discord.js');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
    ]
});

client.commands = new Collection();
client.color = process.env.BOT_COLOR || '#c773ff';

module.exports = client;
