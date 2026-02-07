const createTexturePanel = (guild, textures = []) => {
    const serverIcon = guild.iconURL({ dynamic: true, extension: 'png' }) || 'https://cdn.discordapp.com/embed/avatars/0.png';

    const container = {
        type: 17, // ROOT CONTAINER
        accent_color: 0xc773ff,
        components: [
            // Header Section
            {
                type: 9,
                components: [
                    {
                        type: 10,
                        content: `## 🎨 GERENCIAR TEXTURAS\n> ## Catálogo de Texturas bolttexturas`
                    }
                ],
                accessory: {
                    type: 11,
                    media: { url: serverIcon }
                }
            },
            { type: 14 }, // SEPARATOR
            // Stats (Text Display direto)
            {
                type: 10,
                content: `> **Servidor:** ${guild.name}\n> **Total de Texturas:** \`${textures.length}\`\n> -# Selecione uma textura abaixo para editar.`
            },
            { type: 14 }, // SEPARATOR
            // Select Menu
            {
                type: 1,
                components: [
                    {
                        type: 3,
                        custom_id: 'texture_manage_select',
                        placeholder: textures.length > 0 ? 'Selecione uma textura...' : '> Nenhuma textura cadastrada',
                        disabled: textures.length === 0,
                        options: textures.length > 0 ? textures.slice(0, 25).map(t => ({
                            label: t.name,
                            description: `Cat: ${t.category || 'Padrão'} | ID: ${t._id.toString().slice(-6)}`,
                            value: t._id.toString(),
                            emoji: { name: '🔸' }
                        })) : [{ label: 'Vazio', value: 'null' }]
                    }
                ]
            },
            // Button Row
            {
                type: 1,
                components: [
                    {
                        type: 2,
                        style: 3, // Green
                        label: 'Atualização',
                        custom_id: 'update_textures_btn',
                    },
                    {
                        type: 2,
                        style: 2,
                        label: 'Criar',
                        custom_id: 'create_texture',
                    },
                    {
                        type: 2,
                        style: 2,
                        label: 'Remover',
                        custom_id: 'remove_texture_btn',
                    },
                    {
                        type: 2,
                        style: 2,
                        label: 'Voltar',
                        custom_id: 'back_to_main',
                    }
                ]
            }
        ]
    };

    return { components: [container] };
};

module.exports = { createTexturePanel };
