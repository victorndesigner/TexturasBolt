const createMainPanel = (guild, version = '1.0', keyShortener = 'Não definido', accessTime = '4h', useDeadline = '24h', targetFolderName = 'StumbleCups', sgVersion = '1.0', scVersion = '1.0', updateUrl = 'Não definido', downloadShortener = 'Não definido') => {
    const serverIcon = guild.iconURL({ dynamic: true, extension: 'png' }) || 'https://cdn.discordapp.com/embed/avatars/0.png';

    const container = {
        type: 17,
        accent_color: 0xc773ff,
        components: [
            {
                type: 12,
                items: [
                    { media: { url: 'https://i.imgur.com/YahM0Nf.png' } }
                ]
            },
            {
                type: 9,
                components: [
                    {
                        type: 10,
                        content: `## 🛠️ PAINEL ADMINISTRATIVO\n> ### Sistema de Gerenciamento bolttexturas`
                    }
                ],
                accessory: { type: 11, media: { url: serverIcon } }
            },
            { type: 14 },
            {
                type: 10,
                content: `> **Servidor:** ${guild.name}\n> **Versão Atual:** \`${version}\`\n> **Versão StumbleGuys:** \`${sgVersion}\` | **Versão StumbleCups:** \`${scVersion}\`\n> **Tempo de Acesso:** \`${accessTime}\`\n> **Prazo de Uso:** \`${useDeadline}\`\n> -# Selecione uma categoria abaixo para iniciar o gerenciamento.`
            },
            { type: 14 },
            {
                type: 1,
                components: [
                    {
                        type: 3,
                        custom_id: 'main_select',
                        placeholder: 'Selecione uma categoria...',
                        options: [
                            { label: 'Estilo e Perfil', description: 'Banner padrão, Perfil e Visual', value: 'group_style', emoji: { name: '🎨' } },
                            { label: 'Links e Encurtadores', description: 'Discord, Updates e Encurtadores', value: 'group_links', emoji: { name: '🔗' } },
                            { label: 'Sistema e Pastas', description: 'Versões, Prazos e Pastas', value: 'group_system', emoji: { name: '⚙️' } },
                            { label: 'Conteúdo', description: 'Categorias e Catálogo de Texturas', value: 'group_content', emoji: { name: '📦' } },
                            { label: 'Keys e Usuários', description: 'Gerar Keys, Blacklist e Usuarios', value: 'group_keys', emoji: { name: '🔑' } }
                        ]
                    }
                ]
            },
            {
                type: 1,
                components: [
                    {
                        type: 2,
                        style: 2,
                        label: 'Atualizar',
                        custom_id: 'update_panel',
                    },
                    {
                        type: 2,
                        style: 2,
                        label: 'Sair',
                        custom_id: 'exit_panel',
                    }
                ]
            }
        ]
    };

    return { components: [container] };
};

module.exports = { createMainPanel };
