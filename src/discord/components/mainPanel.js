const createMainPanel = (guild, version = '1.0', keyShortener = 'Não definido', accessTime = '4h', useDeadline = '24h', targetFolderName = 'StumbleCups') => {
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
                content: `> **Servidor:** ${guild.name}\n> **Versão Atual:** \`${version}\`\n> **Encurtador Key:** \`${keyShortener}\`\n> **Pasta Alvo:** \`${targetFolderName}\`\n> **Tempo de Acesso:** \`${accessTime}\`\n> **Prazo de Uso:** \`${useDeadline}\`\n> -# Selecione uma categoria abaixo para iniciar o gerenciamento.`
            },
            { type: 14 }, // SEPARATOR
            // Menu de Seleção (Action Row = Type 1)
            {
                type: 1,
                components: [
                    {
                        type: 3, // STRING SELECT
                        custom_id: 'main_select',
                        placeholder: 'Selecione uma categoria...',
                        options: [
                            { label: 'Versão', description: 'Alterar versão do sistema', value: 'manage_version', emoji: { name: '🚀' } },
                            { label: 'Tempo', description: 'Tempo de acesso do App', value: 'manage_time', emoji: { name: '⏳' } },
                            { label: 'Prazo Uso', description: 'Tempo para usar a key', value: 'manage_use_deadline', emoji: { name: '⌛' } },
                            { label: 'Gerar Key', description: 'Criar nova key de acesso', value: 'generate_key', emoji: { name: '🔑' } },
                            { label: 'Pasta Alvo', description: 'Nome da pasta do jogo', value: 'manage_folder', emoji: { name: '📂' } },
                            { label: 'Foto Perfil', description: 'Mudar foto global', value: 'manage_profile_global', emoji: { name: '🖼️' } },
                            { label: 'Arquivos Originais', description: 'Links de remoção (Cups)', value: 'manage_original_links', emoji: { name: '🛡️' } },
                            { label: 'Keys', description: 'Ver todas as keys geradas', value: 'list_keys', emoji: { name: '📋' } },
                            { label: 'Encurtador', description: 'Link da key', value: 'manage_shortener', emoji: { name: '🔗' } },
                            { label: 'Categorias', description: 'Gerenciar categorias de texturas', value: 'manage_categories', emoji: { name: '🏷️' } },
                            { label: 'Texturas', description: 'Abrir catálogo', value: 'manage_textures', emoji: { name: '🎨' } }
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
