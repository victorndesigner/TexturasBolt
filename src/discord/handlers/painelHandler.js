const { createMainPanel } = require('../components/mainPanel');
const Version = require('../../database/models/Version');
const { MessageFlags } = require('discord.js');

module.exports = async (interaction) => {
    // --- VERIFICAÇÃO DE PERMISSÃO ---
    if (!interaction.member?.permissions.has('Administrator')) {
        return interaction.reply({
            content: '❌ **Acesso Negado.** Apenas administradores podem acessar o Painel de Controle.',
            flags: 64
        });
    }

    // --- VERIFICAÇÃO DE CONEXÃO COM O BANCO ---
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState !== 1) {
        return interaction.reply({
            content: '## ⏳ BANCO DE DADOS CONECTANDO...\n> O sistema ainda está ligando a conexão com o banco de dados.\n> Tente usar este comando novamente em 5 segundos.',
            flags: 64
        });
    }

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
        await interaction.reply({ content: '❌ Houve um erro ao abrir o painel.', flags: 64 });
    }
};
