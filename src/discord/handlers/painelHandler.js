const { createMainPanel } = require('../components/mainPanel');
const supabase = require('../../database/supabase');
const { MessageFlags } = require('discord.js');

module.exports = async (interaction) => {
    // --- VERIFICAÇÃO DE PERMISSÃO ---
    if (!interaction.member?.permissions.has('Administrator')) {
        const serverIcon = interaction.guild?.iconURL({ dynamic: true, extension: 'png' }) || 'https://cdn.discordapp.com/embed/avatars/0.png';
        const noPermissionContainer = {
            type: 17,
            accent_color: 0xff0000,
            components: [{
                type: 9,
                components: [{ type: 10, content: `## 🚫 ACESSO NEGADO\n> Apenas administradores podem acessar o Painel de Controle.\n> -# Se você precisa de acesso, contate o dono do servidor.` }],
                accessory: { type: 11, media: { url: serverIcon } }
            }]
        };
        return interaction.reply({ components: [noPermissionContainer], flags: 64 | MessageFlags.IsComponentsV2 });
    }

    try {
        // Buscar versão no banco
        let { data: versionData } = await supabase.from('versions').select('*').eq('global_id', 'global').maybeSingle();
        
        if (!versionData) {
            const { data: newData } = await supabase.from('versions').insert({ global_id: 'global', version: '1.0' }).select().single();
            versionData = newData;
        }

        const panel = createMainPanel(
            interaction.guild, 
            versionData.version || undefined, 
            versionData.key_shortener || undefined, 
            versionData.default_access_time || undefined, 
            versionData.key_use_deadline || undefined, 
            versionData.target_folder_name || undefined, 
            versionData.stumble_guys_version || undefined, 
            versionData.stumble_cups_version || undefined,
            versionData.update_url || undefined
        );

        // Painel PRINCIPAL deve ser comum (não efêmero) com flag de Components V2 (32768)
        await interaction.reply({ ...panel, flags: 32768 });
    } catch (error) {
        console.error('Erro no painelHandler:', error);
        await interaction.reply({ content: '❌ Houve um erro ao abrir o painel.', flags: 64 });
    }
};
