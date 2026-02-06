const { createMainPanel } = require('../components/mainPanel');
const Version = require('../../database/models/Version');
const { MessageFlags } = require('discord.js');

module.exports = async (interaction) => {
    try {
        // Buscar versão no banco
        let versionData = await Version.findOne({ id: 'global' });
        if (!versionData) {
            versionData = await Version.create({ id: 'global', version: '1.0' });
        }

        const panel = createMainPanel(interaction.guild, versionData.version, versionData.keyShortener, versionData.defaultAccessTime, versionData.keyUseDeadline);

        // Painel PRINCIPAL deve ser comum (não efêmero) com flag de Components V2 (32768)
        await interaction.reply({ ...panel, flags: 32768 });
    } catch (error) {
        console.error('Erro no painelHandler:', error);
        await interaction.reply({ content: '❌ Houve um erro ao abrir o painel.', flags: [MessageFlags.Ephemeral] });
    }
};
