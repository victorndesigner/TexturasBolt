const { Client, GatewayIntentBits, Collection, Events } = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences
    ]
});

client.commands = new Collection();
client.color = process.env.BOT_COLOR || '#c773ff';

module.exports = client;
