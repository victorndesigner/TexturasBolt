const createMainPanel = (guild, version = '1.0', keyShortener = 'Não definido', accessTime = '4h', useDeadline = '24h', targetFolderName = 'StumbleCups', sgVersion = '1.0', scVersion = '1.0', updateUrl = 'Não definido', downloadShortener = 'Não definido') => {
    const serverIcon = guild.iconURL({ dynamic: true, extension: 'png' }) || 'https://cdn.discordapp.com/embed/avatars/0.png';

    // Construção do Container Principal (Estilo V2 Nativo)
    const container = {
        type: 17, // ROOT CONTAINER
        accent_color: 0xc773ff,
        components: [
            // Banner Superior (Media Gallery = Type 12)
            {
                type: 12,
                items: [
                    { media: { url: 'https://i.imgur.com/YahM0Nf.png' } }
                ]
            },
            // Seção de Título com Ícone do Servidor (Section = Type 9)
            {
                type: 9,
                components: [
                    {
                        type: 10, // TEXT DISPLAY
                        content: `## 🛠️ PAINEL ADMINISTRATIVO\n> ### Sistema de Gerenciamento bolttexturas`
                    }
                ],
                accessory: {
                    type: 11, // THUMBNAIL
                    media: { url: serverIcon }
                }
            },
            { type: 14 }, // SEPARATOR (Type 14)
            // Informações (Text Display direto no container, pois Section exige accessory)
            {
                type: 10,
                content: `> **Servidor:** ${guild.name}\n> **Versão Atual:** \`${version}\`\n> **Versão StumbleGuys:** \`${sgVersion}\` | **Versão StumbleCups:** \`${scVersion}\`\n> **Encurtador Key:** \`${keyShortener}\`\n> **Encurtador Download:** \`${downloadShortener}\`\n> **Atualizar App:** \`${updateUrl}\`\n> **Pasta Alvo:** \`${targetFolderName}\`\n> **Tempo de Acesso:** \`${accessTime}\`\n> **Prazo de Uso:** \`${useDeadline}\`\n> -# Selecione uma categoria abaixo para iniciar o gerenciamento.`
            },
            { type: 14 }, // SEPARATOR
            // Menu de Seleção (Action Row = Type 1)
            {
                type: 1,
                components: [
                    {
                        type: 3, // STRING SELECT
                        custom_id: 'main_select',
                        placeholder: 'Configurar encurtadores e sistema...',
                        options: [
                            { label: '🎨 Estilo & Perfil', description: 'Banner padrão, Perfil e Visual', value: 'group_style', emoji: { name: '🎨' } },
                            { label: '🔗 Links & Encurtadores', description: 'Discord, Updates e Encurtadores', value: 'group_links', emoji: { name: '🔗' } },
                            { label: '⚙️ Sistema & Pastas', description: 'Versões, Prazos e Pastas', value: 'group_system', emoji: { name: '⚙️' } },
                            { label: '📦 Conteúdo', description: 'Categorias e Catálogo de Texturas', value: 'group_content', emoji: { name: '📦' } },
                            { label: '🔑 Keys & Usuários', description: 'Gerar Keys, Blacklist e Usuarios', value: 'group_keys', emoji: { name: '🔑' } }
                        ]
                    }
                ]
            },
            // Botões de Ação
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
