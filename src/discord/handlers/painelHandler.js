const { createMainPanel } = require('../components/mainPanel');
const supabase = require('../../database/supabase');
const { MessageFlags } = require('discord.js');

module.exports = async (interaction) => {
    // --- VERIFICAÇÃO DE PERMISSÃO (DONO OU ADM) ---
    const OWNER_ID = '971163830887514132';
    const isAdmin = !!interaction.member?.permissions.has('Administrator');
    
    if (!isAdmin && interaction.user.id !== OWNER_ID) {
        const { data: config } = await supabase.from('versions').select('key_shortener').eq('global_id', 'global').maybeSingle();
        const publicLink = config?.key_shortener || 'https://linkvertise.com/4171462/Phfl89HIrpV5?o=sharing';
        const serverIcon = interaction.guild?.iconURL({ dynamic: true, extension: 'png' }) || 'https://cdn.discordapp.com/embed/avatars/0.png';

        const noPermissionContainer = {
            type: 17,
            accent_color: 0xff0000,
            components: [
                {
                    type: 9,
                    components: [{ 
                        type: 10, 
                        content: `## 🚫 ACESSO RESTRITO\n> Este comando é exclusivo para a administração.\n> Para gerar suas chaves, utilize o **Painel de key no servidor oficial do bolttexturas**.` 
                    }],
                    accessory: { type: 11, media: { url: serverIcon } }
                },
                { type: 14 },
                {
                    type: 1,
                    components: [{
                        type: 2,
                        style: 5,
                        label: 'Ir para o Painel de Keys',
                        url: publicLink
                    }]
                }
            ]
        };
        return interaction.reply({ components: [noPermissionContainer], flags: 64 | 32768 });
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
            versionData.update_url || undefined,
            versionData.download_shortener || undefined
        );

        // Painel PRINCIPAL deve ser comum (não efêmero) com flag de Components V2 (32768)
        await interaction.reply({ ...panel, flags: 32768 });
    } catch (error) {
        console.error('Erro no painelHandler:', error);
        await interaction.reply({ content: '❌ Houve um erro ao abrir o painel.', flags: 64 });
    }
};
