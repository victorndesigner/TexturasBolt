const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, StringSelectMenuBuilder, MessageFlags } = require('discord.js');
const Version = require('../../database/models/Version');
const Texture = require('../../database/models/Texture');
const Key = require('../../database/models/Key');
const Category = require('../../database/models/Category');
const { createMainPanel } = require('../components/mainPanel');
const { createTexturePanel } = require('../components/texturePanel');
const crypto = require('crypto');

module.exports = async (interaction) => {
    try {
        // --- LIMPEZA AUTOMÁTICA DE KEYS EXPIRADAS (Resgate) ---
        await Key.deleteMany({ isUsed: false, expiresToUseAt: { $lt: new Date() } });

        // --- SELECT MENUS ---
        if (interaction.isStringSelectMenu()) {
            if (interaction.customId === 'main_select') {
                const value = interaction.values[0];

                if (value === 'manage_version') {
                    const modal = new ModalBuilder()
                        .setCustomId('modal_version')
                        .setTitle('Atualizar Versão');

                    const versionInput = new TextInputBuilder()
                        .setCustomId('version_input')
                        .setLabel('Nova Versão')
                        .setPlaceholder('Ex: 1.2')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true);

                    modal.addComponents(new ActionRowBuilder().addComponents(versionInput));
                    return await interaction.showModal(modal);
                }

                if (value === 'manage_shortener') {
                    const modal = new ModalBuilder()
                        .setCustomId('modal_shortener')
                        .setTitle('Encurtador da Key');

                    const shortenerInput = new TextInputBuilder()
                        .setCustomId('shortener_input')
                        .setLabel('Link do Encurtador')
                        .setPlaceholder('Ex: https://link.com')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true);

                    modal.addComponents(new ActionRowBuilder().addComponents(shortenerInput));
                    return await interaction.showModal(modal);
                }

                if (value === 'manage_time') {
                    const modal = new ModalBuilder()
                        .setCustomId('modal_time')
                        .setTitle('Tempo de Acesso Global');

                    const timeInput = new TextInputBuilder()
                        .setCustomId('time_input')
                        .setLabel('Tempo Padrão')
                        .setPlaceholder('Ex: 4h, 2h, 30m ou permanente')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true);

                    modal.addComponents(new ActionRowBuilder().addComponents(timeInput));
                    return await interaction.showModal(modal);
                }

                if (value === 'manage_use_deadline') {
                    const modal = new ModalBuilder()
                        .setCustomId('modal_use_deadline')
                        .setTitle('Prazo para Usar Key');

                    const deadlineInput = new TextInputBuilder()
                        .setCustomId('deadline_input')
                        .setLabel('Tempo para Resgate')
                        .setPlaceholder('Ex: 24h, 1h, 30m')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true);

                    modal.addComponents(new ActionRowBuilder().addComponents(deadlineInput));
                    return await interaction.showModal(modal);
                }

                if (value === 'generate_key') {
                    await interaction.deferUpdate();
                    const serverIcon = interaction.guild.iconURL({ dynamic: true, extension: 'png' }) || 'https://cdn.discordapp.com/embed/avatars/0.png';
                    const container = {
                        type: 17,
                        accent_color: 0xc773ff,
                        components: [
                            {
                                type: 9,
                                components: [{ type: 10, content: `## 🔑 GERAR KEY\n> Selecione o tipo de permissão para a nova chave:` }],
                                accessory: { type: 11, media: { url: serverIcon } }
                            },
                            {
                                type: 1,
                                components: [
                                    {
                                        type: 3,
                                        custom_id: 'gen_key_type_select',
                                        placeholder: 'Selecione o tipo de acesso...',
                                        options: [
                                            { label: 'Acesso Total', description: 'Todas as texturas, sem download direto', value: 'all', emoji: { name: '🌐' } },
                                            { label: 'Por Categoria', description: 'Somente uma categoria + Download Direto', value: 'category', emoji: { name: '🏷️' } },
                                            { label: 'Por Textura', description: 'Somente uma textura + Download Direto', value: 'texture', emoji: { name: '🎨' } }
                                        ]
                                    }
                                ]
                            },
                            {
                                type: 1,
                                components: [{ type: 2, style: 2, label: 'Voltar', custom_id: 'back_to_main' }]
                            }
                        ]
                    };
                    return await interaction.editReply({ components: [container], flags: 32768 });
                }

                if (value === 'list_keys') {
                    await interaction.deferUpdate();
                    return await showKeysList(interaction);
                }

                if (value === 'manage_folder') {
                    const modal = new ModalBuilder()
                        .setCustomId('modal_folder_name')
                        .setTitle('Nome da Pasta Alvo');

                    const folderInput = new TextInputBuilder()
                        .setCustomId('folder_input')
                        .setLabel('Nome da Pasta (ex: StumbleCups)')
                        .setPlaceholder('A pasta que deve conter StumbleCups_Data')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true);

                    modal.addComponents(new ActionRowBuilder().addComponents(folderInput));
                    return await interaction.showModal(modal);
                }

                if (value === 'manage_profile_global') {
                    const serverIcon = interaction.guild.iconURL({ dynamic: true, extension: 'png' }) || 'https://cdn.discordapp.com/embed/avatars/0.png';
                    const container = {
                        type: 17,
                        accent_color: 0xc773ff,
                        components: [
                            {
                                type: 9,
                                components: [{
                                    type: 10,
                                    content: `## 🖼️ FOTO DE PERFIL GLOBAL\n> Aguardando sua imagem no chat...\n\nVocê tem **30 segundos** para enviar uma foto ou um link de imagem no chat para definir como o perfil padrão no App.`
                                }],
                                accessory: { type: 11, media: { url: serverIcon } }
                            }
                        ]
                    };

                    await interaction.reply({
                        components: [container],
                        flags: 64 + 32768 // Ephemeral + Components V2
                    });

                    const filter = m => m.author.id === interaction.user.id;
                    const collector = interaction.channel.createMessageCollector({ filter, time: 30000, max: 1 });

                    collector.on('collect', async m => {
                        const url = m.attachments.first()?.url || m.content;
                        if (!url.startsWith('http')) return;

                        await Version.findOneAndUpdate({ id: 'global' }, { profileImage: url }, { upsert: true });

                        const successContainer = {
                            type: 17,
                            accent_color: 0x00ff88, // Verde Bolt
                            components: [{
                                type: 9,
                                components: [{ type: 10, content: `## ✅ SUCESSO!\n> Foto de perfil global atualizada.\n\nEsta imagem aparecerá agora em todas as texturas que não possuem uma miniatura própria.` }],
                                accessory: { type: 11, media: { url: url } }
                            }]
                        };

                        await interaction.followUp({ components: [successContainer], flags: 64 + 32768 });
                        if (m.deletable) m.delete().catch(() => { });
                    });
                    return;
                }

                if (value === 'manage_original_links') {
                    const config = await Version.findOne({ id: 'global' });
                    const modal = new ModalBuilder().setCustomId('modal_original_links').setTitle('Arquivos Originais (StumbleCups)');
                    modal.addComponents(
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('orig_p1').setLabel('Original P1 (Jogo)').setValue(config?.removeUrlPart1 || '').setStyle(TextInputStyle.Short).setRequired(false)),
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('orig_p2').setLabel('Original P2 (AppData)').setValue(config?.removeUrlPart2 || '').setStyle(TextInputStyle.Short).setRequired(false))
                    );
                    return await interaction.showModal(modal);
                }

                if (value === 'manage_categories') {
                    await interaction.deferUpdate();
                    return await showCategoriesPanel(interaction);
                }

                if (value === 'manage_textures') {
                    await interaction.deferUpdate();
                    const textures = await Texture.find();
                    const panel = createTexturePanel(interaction.guild, textures);
                    return await interaction.editReply({ ...panel, flags: 32768 });
                }
            }

            if (interaction.customId === 'manage_keys_select') {
                await interaction.deferUpdate();
                const keyId = interaction.values[0];
                const keyData = await Key.findById(keyId);
                if (!keyData) {
                    const serverIcon = interaction.guild.iconURL({ dynamic: true, extension: 'png' }) || 'https://cdn.discordapp.com/embed/avatars/0.png';
                    const errContainer = {
                        type: 17,
                        accent_color: 0xff0000,
                        components: [{
                            type: 9,
                            components: [{ type: 10, content: `## ❌ ERRO!\n> Key não encontrada no banco de dados.` }],
                            accessory: { type: 11, media: { url: serverIcon } }
                        }]
                    };
                    return interaction.followUp({ components: [errContainer], flags: 64 + 32768 });
                }

                const serverIcon = interaction.guild.iconURL({ dynamic: true, extension: 'png' }) || 'https://cdn.discordapp.com/embed/avatars/0.png';

                let timeContent = `> **Código:** \`${keyData.key}\`\n> **Duração:** \`${keyData.duration}\`\n> **Status:** \`${keyData.isUsed ? 'Utilizada' : 'Disponível'}\`\n> **Criada em:** <t:${Math.floor(keyData.createdAt.getTime() / 1000)}:R>`;

                if (!keyData.isUsed && keyData.expiresToUseAt) {
                    timeContent += `\n> **Expira para uso em:** <t:${Math.floor(keyData.expiresToUseAt.getTime() / 1000)}:R>`;
                } else if (keyData.isUsed && keyData.expiresAt) {
                    timeContent += `\n> **Expira acesso em:** <t:${Math.floor(keyData.expiresAt.getTime() / 1000)}:R>`;
                }

                const permissionText = keyData.permissions?.type === 'all' ? 'Acesso Total' : (keyData.permissions?.type === 'category' ? `Categoria: ${keyData.permissions.value}` : `Textura: ${keyData.permissions.value}`);

                const container = {
                    type: 17,
                    accent_color: 0xc773ff,
                    components: [
                        {
                            type: 9,
                            components: [{
                                type: 10,
                                content: `## 🔑 DETALHES DA KEY\n${timeContent}\n> **Permissão:** \`${permissionText}\``
                            }],
                            accessory: { type: 11, media: { url: serverIcon } }
                        },
                        {
                            type: 1,
                            components: [
                                { type: 2, style: 4, label: 'Excluir Key', custom_id: `delete_key_${keyId}`, emoji: { name: '🗑️' } },
                                { type: 2, style: 2, label: 'Voltar', custom_id: 'list_keys_back', emoji: { name: '⬅️' } }
                            ]
                        }
                    ]
                };

                return await interaction.editReply({ components: [container], flags: 32768 });
            }

            if (interaction.customId === 'texture_manage_select') {
                await interaction.deferUpdate();
                const textureId = interaction.values[0];
                const texture = await Texture.findById(textureId);
                if (!texture) return;

                const serverIcon = interaction.guild.iconURL({ dynamic: true, extension: 'png' }) || 'https://cdn.discordapp.com/embed/avatars/0.png';
                const container = {
                    type: 17,
                    accent_color: 0xc773ff,
                    components: [
                        {
                            type: 9,
                            components: [{ type: 10, content: `## ⚙️ GERENCIAR: ${texture.name}\n> **Categoria:** \`${texture.category}\`\n> **Status:** \`Cadastrada\`\n\nEscolha o que deseja configurar abaixo:` }],
                            accessory: { type: 11, media: { url: texture.profileImage || serverIcon } }
                        },
                        {
                            type: 1,
                            components: [
                                { type: 2, style: 1, label: 'Editar Dados', custom_id: `manage_edit_data_${textureId}`, emoji: { name: '✏️' } },
                                { type: 2, style: 1, label: 'Links de Downloads', custom_id: `manage_removal_${textureId}`, emoji: { name: '🛡️' } },
                                { type: 2, style: 2, label: 'Voltar', custom_id: 'manage_textures', emoji: { name: '⬅️' } }
                            ]
                        }
                    ]
                };
                return await interaction.editReply({ components: [container], flags: 32768 });
            }

            if (interaction.customId === 'remove_texture_select') {
                await interaction.deferUpdate();
                const textureId = interaction.values[0];
                await Texture.findByIdAndDelete(textureId);

                const serverIcon = interaction.guild.iconURL({ dynamic: true, extension: 'png' }) || 'https://cdn.discordapp.com/embed/avatars/0.png';
                const successContainer = {
                    type: 17,
                    accent_color: 0x00ff88,
                    components: [{
                        type: 9,
                        components: [{ type: 10, content: `## ✅ REMOVIDO!\n> Textura removida com sucesso do catálogo.` }],
                        accessory: { type: 11, media: { url: serverIcon } }
                    }]
                };
                return await interaction.followUp({ components: [successContainer], flags: 64 + 32768 });
            }

            if (interaction.customId === 'gen_key_type_select') {
                await interaction.deferUpdate();
                const type = interaction.values[0];

                if (type === 'all') {
                    const modal = new ModalBuilder().setCustomId('modal_gen_key_final_all').setTitle('Gerar Key (Acesso Total)');
                    modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('key_time').setLabel('Duração (ex: 7d, 1d30m, permanente)').setPlaceholder('Vazio = Padrão').setStyle(TextInputStyle.Short).setRequired(false)));
                    return await interaction.showModal(modal);
                }

                if (type === 'category') {
                    const categories = await Category.find();
                    const container = {
                        type: 17, accent_color: 0xc773ff,
                        components: [
                            { type: 9, components: [{ type: 10, content: `## 🔑 GERAR POR CATEGORIA\n> Escolha a categoria:` }], accessory: { type: 11, media: { url: interaction.guild.iconURL() } } },
                            {
                                type: 1, components: [{
                                    type: 3, custom_id: 'gen_key_value_cat_select', placeholder: 'Selecione a categoria...',
                                    options: categories.map(c => ({ label: c.name, value: c.name }))
                                }]
                            }
                        ]
                    };
                    return await interaction.editReply({ components: [container], flags: 32768 });
                }

                if (type === 'texture') {
                    const textures = await Texture.find();
                    const container = {
                        type: 17, accent_color: 0xc773ff,
                        components: [
                            { type: 9, components: [{ type: 10, content: `## 🔑 GERAR POR TEXTURA\n> Escolha a textura:` }], accessory: { type: 11, media: { url: interaction.guild.iconURL() } } },
                            {
                                type: 1, components: [{
                                    type: 3, custom_id: 'gen_key_value_tex_select', placeholder: 'Selecione a textura...',
                                    options: textures.slice(0, 25).map(t => ({ label: t.name, value: t._id.toString() }))
                                }]
                            }
                        ]
                    };
                    return await interaction.editReply({ components: [container], flags: 32768 });
                }
            }

            if (interaction.customId === 'gen_key_value_cat_select') {
                const value = interaction.values[0];
                const modal = new ModalBuilder().setCustomId(`modal_gen_key_final_category_${value}`).setTitle(`Gerar Key: ${value}`);
                modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('key_time').setLabel('Duração (ex: 7d, 1d30m, permanente)').setPlaceholder('Vazio = Padrão').setStyle(TextInputStyle.Short).setRequired(false)));
                return await interaction.showModal(modal);
            }

            if (interaction.customId === 'gen_key_value_tex_select') {
                const value = interaction.values[0];
                const texture = await Texture.findById(value);
                const modal = new ModalBuilder().setCustomId(`modal_gen_key_final_texture_${value}`).setTitle(`Gerar Key: ${texture.name}`);
                modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('key_time').setLabel('Duração (ex: 7d, 1d30m, permanente)').setPlaceholder('Vazio = Padrão').setStyle(TextInputStyle.Short).setRequired(false)));
                return await interaction.showModal(modal);
            }
        }

        // --- BUTTONS ---
        if (interaction.isButton()) {
            if (interaction.customId === 'update_panel' || interaction.customId === 'back_to_main') {
                await interaction.deferUpdate();
                let versionData = await Version.findOne({ id: 'global' });
                const panel = createMainPanel(interaction.guild, versionData?.version || '1.0', versionData?.keyShortener, versionData?.defaultAccessTime, versionData?.keyUseDeadline, versionData?.targetFolderName);
                return await interaction.editReply({ ...panel, flags: 32768 });
            }

            if (interaction.customId === 'list_keys_back') {
                await interaction.deferUpdate();
                return await showKeysList(interaction);
            }

            if (interaction.customId.startsWith('delete_key_')) {
                await interaction.deferUpdate();
                const keyId = interaction.customId.replace('delete_key_', '');
                await Key.findByIdAndDelete(keyId);

                let versionData = await Version.findOne({ id: 'global' });

                const serverIcon = interaction.guild.iconURL({ dynamic: true, extension: 'png' }) || 'https://cdn.discordapp.com/embed/avatars/0.png';
                const successContainer = {
                    type: 17,
                    accent_color: 0xc773ff,
                    components: [
                        {
                            type: 9,
                            components: [{
                                type: 10,
                                content: `## ✅ KEY EXCLUÍDA COM SUCESSO!\n> A chave foi removida permanentemente do banco de dados.`
                            }],
                            accessory: { type: 11, media: { url: serverIcon } }
                        }
                    ]
                };

                const panel = createMainPanel(interaction.guild, versionData?.version || '1.0', versionData?.keyShortener, versionData?.defaultAccessTime, versionData?.keyUseDeadline, versionData?.targetFolderName);
                await interaction.followUp({ components: [successContainer], flags: 32768 + 64 });
                return await interaction.editReply({ ...panel, flags: 32768 });
            }

            if (interaction.customId === 'exit_panel') {
                return await interaction.message.delete();
            }

            if (interaction.customId === 'manage_textures') {
                await interaction.deferUpdate();
                const textures = await Texture.find();
                const panel = createTexturePanel(interaction.guild, textures);
                return await interaction.editReply({ ...panel, flags: 32768 });
            }

            if (interaction.customId === 'create_texture') {
                const modal = new ModalBuilder()
                    .setCustomId('modal_create_texture')
                    .setTitle('Criar Nova Textura');

                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('texture_name').setLabel('Nome').setStyle(TextInputStyle.Short).setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('texture_category').setLabel('Categoria (StumbleGuys, StumbleCups, Reviver)').setStyle(TextInputStyle.Short).setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('texture_p1').setLabel('Link Part 1 (Textura)').setStyle(TextInputStyle.Short).setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('texture_p2').setLabel('Link Part 2 (Opcional - AppData)').setStyle(TextInputStyle.Short).setRequired(false)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('texture_profile').setLabel('Link Foto de Perfil').setStyle(TextInputStyle.Short).setRequired(false))
                );
                return await interaction.showModal(modal);
            }

            if (interaction.customId.startsWith('manage_edit_data_')) {
                const textureId = interaction.customId.replace('manage_edit_data_', '');
                const texture = await Texture.findById(textureId);
                const modal = new ModalBuilder().setCustomId(`modal_edit_texture_${textureId}`).setTitle('Editar Dados Básicos');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('edit_name').setLabel('Nome').setValue(texture.name).setStyle(TextInputStyle.Short)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('edit_category').setLabel('Categoria').setValue(texture.category).setStyle(TextInputStyle.Short)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('edit_shortener').setLabel('Link Encurtador (Opcional)').setValue(texture.shortenerUrl || '').setStyle(TextInputStyle.Short).setRequired(false)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('edit_profile').setLabel('Foto Perfil').setValue(texture.profileImage).setStyle(TextInputStyle.Short))
                );
                return await interaction.showModal(modal);
            }

            if (interaction.customId.startsWith('manage_removal_')) {
                const textureId = interaction.customId.replace('manage_removal_', '');
                const texture = await Texture.findById(textureId);
                const modal = new ModalBuilder().setCustomId(`modal_removal_links_${textureId}`).setTitle('Gerenciar Arquivos (Download)');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('file_p1').setLabel('Textura P1 (Jogo)').setValue(texture.downloadUrl).setStyle(TextInputStyle.Short)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('file_p2').setLabel('Textura P2 (AppData)').setValue(texture.downloadUrlPart2 || '').setStyle(TextInputStyle.Short).setRequired(false))
                );
                return await interaction.showModal(modal);
            }

            if (interaction.customId === 'remove_texture_btn') {
                await interaction.deferReply({ ephemeral: true }); // Defer reply for ephemeral message
                const textures = await Texture.find();
                if (textures.length === 0) {
                    const serverIcon = interaction.guild.iconURL({ dynamic: true, extension: 'png' }) || 'https://cdn.discordapp.com/embed/avatars/0.png';
                    const errorContainer = {
                        type: 17,
                        accent_color: 0xff0000, // Red color for error
                        components: [
                            {
                                type: 9,
                                components: [{
                                    type: 10,
                                    content: `## ❌ NENHUMA TEXTURA PARA REMOVER!\n> Não há texturas cadastradas para serem removidas.`
                                }],
                                accessory: { type: 11, media: { url: serverIcon } }
                            }
                        ]
                    };
                    return interaction.editReply({ components: [errorContainer], flags: 32768 + 64 });
                }

                const selectMenu = new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('remove_texture_select')
                        .setPlaceholder('Selecione uma textura para remover...')
                        .addOptions(textures.map(t => ({ label: t.name, value: t._id.toString() })))
                );

                const serverIcon = interaction.guild.iconURL({ dynamic: true, extension: 'png' }) || 'https://cdn.discordapp.com/embed/avatars/0.png';
                const container = {
                    type: 17,
                    accent_color: 0xc773ff,
                    components: [
                        {
                            type: 9,
                            components: [{ type: 10, content: `## 🗑️ REMOVER TEXTURA\n> Escolha uma textura abaixo para remover.` }],
                            accessory: { type: 11, media: { url: serverIcon } }
                        },
                        {
                            type: 1,
                            components: [selectMenu]
                        }
                    ]
                };
                return await interaction.editReply({ components: [container], flags: 32768 });
            }

            if (interaction.customId === 'create_category') {
                const modal = new ModalBuilder()
                    .setCustomId('modal_create_category')
                    .setTitle('Criar Categoria');

                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('cat_name').setLabel('Nome da Categoria').setStyle(TextInputStyle.Short).setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('cat_desc').setLabel('Descrição (Opcional)').setStyle(TextInputStyle.Short).setRequired(false))
                );
                return await interaction.showModal(modal);
            }

            if (interaction.customId === 'remove_category_btn') {
                const categories = await Category.find();
                if (categories.length === 0) {
                    return await interaction.followUp({ content: '❌ Nenhuma categoria para remover.', flags: [MessageFlags.Ephemeral] });
                }

                const selectMenu = new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('remove_category_select')
                        .setPlaceholder('Selecione uma categoria para remover...')
                        .addOptions(categories.map(c => ({ label: c.name, value: c._id.toString() })))
                );

                const serverIcon = interaction.guild.iconURL({ dynamic: true, extension: 'png' }) || 'https://cdn.discordapp.com/embed/avatars/0.png';
                const container = {
                    type: 17,
                    accent_color: 0xc773ff,
                    components: [
                        {
                            type: 9,
                            components: [{ type: 10, content: `## 🗑️ REMOVER CATEGORIA\n> Escolha uma categoria abaixo para remover.` }],
                            accessory: { type: 11, media: { url: serverIcon } }
                        },
                        { type: 1, components: [selectMenu] },
                        { type: 1, components: [{ type: 2, style: 2, label: 'Voltar', custom_id: 'manage_categories' }] }
                    ]
                };
                return await interaction.reply({ components: [container], flags: 64 + 32768 });
            }
        }

        // --- SELECT MENUS EXTRAS ---
        if (interaction.isStringSelectMenu()) {
            if (interaction.customId === 'remove_category_select') {
                await interaction.deferUpdate();
                const catId = interaction.values[0];
                await Category.findByIdAndDelete(catId);
                return await showCategoriesPanel(interaction);
            }
        }

        // --- MODALS ---
        if (interaction.isModalSubmit()) {
            await interaction.deferUpdate();

            if (interaction.customId === 'modal_version') {
                const newVersion = interaction.fields.getTextInputValue('version_input');
                const data = await Version.findOneAndUpdate({ id: 'global' }, { version: newVersion }, { upsert: true, new: true });

                const panel = createMainPanel(interaction.guild, data.version, data.keyShortener, data.defaultAccessTime, data.keyUseDeadline, data.targetFolderName);
                return await interaction.editReply({ ...panel, flags: 32768 });
            }

            if (interaction.customId === 'modal_shortener') {
                const newShortener = interaction.fields.getTextInputValue('shortener_input');
                const data = await Version.findOneAndUpdate({ id: 'global' }, { keyShortener: newShortener }, { upsert: true, new: true });

                const panel = createMainPanel(interaction.guild, data.version, data.keyShortener, data.defaultAccessTime, data.keyUseDeadline, data.targetFolderName);
                return await interaction.editReply({ ...panel, flags: 32768 });
            }

            if (interaction.customId === 'modal_time') {
                const newTime = interaction.fields.getTextInputValue('time_input');
                const data = await Version.findOneAndUpdate({ id: 'global' }, { defaultAccessTime: newTime }, { upsert: true, new: true });

                const panel = createMainPanel(interaction.guild, data.version, data.keyShortener, data.defaultAccessTime, data.keyUseDeadline, data.targetFolderName);
                return await interaction.editReply({ ...panel, flags: 32768 });
            }

            if (interaction.customId === 'modal_use_deadline') {
                const newDeadline = interaction.fields.getTextInputValue('deadline_input');
                const data = await Version.findOneAndUpdate({ id: 'global' }, { keyUseDeadline: newDeadline }, { upsert: true, new: true });

                const panel = createMainPanel(interaction.guild, data.version, data.keyShortener, data.defaultAccessTime, data.keyUseDeadline, data.targetFolderName);
                return await interaction.editReply({ ...panel, flags: 32768 });
            }

            if (interaction.customId.startsWith('modal_gen_key_final_')) {
                const parts = interaction.customId.replace('modal_gen_key_final_', '').split('_');
                const type = parts[0]; // all, category, texture
                const value = parts.slice(1).join('_') || null;

                let durationStr = interaction.fields.getTextInputValue('key_time');
                let versionData = await Version.findOne({ id: 'global' });
                if (!durationStr) durationStr = versionData?.defaultAccessTime || '4h';

                const keyCode = `TEXTURE-B-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;

                // Calcular Prazo para Usar
                let useDeadlineDate = null;
                const deadlineStr = versionData?.keyUseDeadline || '24h';
                const { parseDuration } = require('../../utils/durationParser');
                const deadlineMs = parseDuration(deadlineStr) || (24 * 60 * 60 * 1000);
                useDeadlineDate = new Date(Date.now() + deadlineMs);

                await Key.create({
                    key: keyCode,
                    duration: durationStr,
                    expiresToUseAt: useDeadlineDate,
                    permissions: {
                        type: type,
                        value: value
                    }
                });

                const serverIcon = interaction.guild.iconURL({ dynamic: true, extension: 'png' }) || 'https://cdn.discordapp.com/embed/avatars/0.png';
                const successContainer = {
                    type: 17,
                    accent_color: 0xc773ff,
                    components: [
                        {
                            type: 9,
                            components: [{
                                type: 10,
                                content: `## ✅ KEY GERADA COM SUCESSO!\n> **Cod:** \`${keyCode}\`\n> **Duração:** \`${durationStr}\`\n> **Acesso:** \`${type === 'all' ? 'Total' : (type === 'category' ? `Categoria: ${value}` : `Textura: ${value}`)}\`\n> **Expira resgate em:** <t:${Math.floor(useDeadlineDate.getTime() / 1000)}:R>\n> -# Chave disponível no banco.`
                            }],
                            accessory: { type: 11, media: { url: serverIcon } }
                        }
                    ]
                };

                const panel = createMainPanel(interaction.guild, versionData?.version || '1.0', versionData?.keyShortener, versionData?.defaultAccessTime, versionData?.keyUseDeadline, versionData?.targetFolderName);
                await interaction.followUp({ components: [successContainer], flags: 32768 + 64 });
                return await interaction.editReply({ ...panel, flags: 32768 });
            }

            if (interaction.customId === 'modal_create_category') {
                const name = interaction.fields.getTextInputValue('cat_name');
                const description = interaction.fields.getTextInputValue('cat_desc');
                await Category.findOneAndUpdate({ name }, { name, description }, { upsert: true });
                return await showCategoriesPanel(interaction);
            }

            if (interaction.customId === 'modal_create_texture') {
                const name = interaction.fields.getTextInputValue('texture_name');
                const category = interaction.fields.getTextInputValue('texture_category');
                const p1 = interaction.fields.getTextInputValue('texture_p1');
                const p2 = interaction.fields.getTextInputValue('texture_p2') || '';
                const profile = interaction.fields.getTextInputValue('texture_profile');

                await Texture.create({
                    name,
                    category,
                    downloadUrl: p1,
                    downloadUrlPart2: p2,
                    profileImage: profile || undefined
                });

                const textures = await Texture.find();
                const panel = createTexturePanel(interaction.guild, textures);
                return await interaction.editReply({ ...panel, flags: 32768 });
            }

            if (interaction.customId.startsWith('modal_edit_texture_')) {
                const textureId = interaction.customId.replace('modal_edit_texture_', '');
                await Texture.findByIdAndUpdate(textureId, {
                    name: interaction.fields.getTextInputValue('edit_name'),
                    category: interaction.fields.getTextInputValue('edit_category'),
                    shortenerUrl: interaction.fields.getTextInputValue('edit_shortener') || undefined,
                    profileImage: interaction.fields.getTextInputValue('edit_profile')
                });
                const textures = await Texture.find();
                return await interaction.editReply(createTexturePanel(interaction.guild, textures));
            }

            if (interaction.customId === 'modal_original_links') {
                const p1 = interaction.fields.getTextInputValue('orig_p1');
                const p2 = interaction.fields.getTextInputValue('orig_p2');
                await Version.findOneAndUpdate({ id: 'global' }, { removeUrlPart1: p1, removeUrlPart2: p2 }, { upsert: true });

                let versionData = await Version.findOne({ id: 'global' });
                const panel = createMainPanel(interaction.guild, versionData?.version, versionData?.keyShortener, versionData?.defaultAccessTime, versionData?.keyUseDeadline, versionData?.targetFolderName);
                return await interaction.editReply({ ...panel, flags: 32768 });
            }

            if (interaction.customId.startsWith('modal_removal_links_')) {
                const textureId = interaction.customId.replace('modal_removal_links_', '');
                await Texture.findByIdAndUpdate(textureId, {
                    downloadUrl: interaction.fields.getTextInputValue('file_p1'),
                    downloadUrlPart2: interaction.fields.getTextInputValue('file_p2')
                });
                const textures = await Texture.find();
                return await interaction.editReply(createTexturePanel(interaction.guild, textures));
            }
        }
    } catch (error) {
        console.error('Erro no interactionHandler:', error);
        const serverIcon = interaction.guild?.iconURL({ dynamic: true, extension: 'png' }) || 'https://cdn.discordapp.com/embed/avatars/0.png';
        const errorContainer = {
            type: 17,
            accent_color: 0xff0000,
            components: [{
                type: 9,
                components: [{ type: 10, content: `## ❌ ERRO INTERNO\n> Houve um problema ao processar seu comando.\n> Tente novamente em instantes.` }],
                accessory: { type: 11, media: { url: serverIcon } }
            }]
        };

        try {
            if (interaction.deferred || interaction.replied) {
                await interaction.followUp({ components: [errorContainer], flags: 64 + 32768 });
            } else {
                await interaction.reply({ components: [errorContainer], flags: 64 + 32768 });
            }
        } catch (e) { }
    }
};

// Funções Auxiliares para Navegação Limpa
async function showKeysList(interaction) {
    const keys = await Key.find().sort({ createdAt: -1 }).limit(25);
    const serverIcon = interaction.guild.iconURL({ dynamic: true, extension: 'png' }) || 'https://cdn.discordapp.com/embed/avatars/0.png';

    if (keys.length === 0) {
        const emptyContainer = {
            type: 17,
            accent_color: 0xc773ff,
            components: [
                {
                    type: 9,
                    components: [{ type: 10, content: `## 📋 LISTA DE KEYS\n> ❌ Nenhuma chave gerada até o momento.` }],
                    accessory: { type: 11, media: { url: serverIcon } }
                },
                {
                    type: 1,
                    components: [{ type: 2, style: 2, label: 'Voltar', custom_id: 'back_to_main', emoji: { name: '⬅️' } }]
                }
            ]
        };
        return await interaction.editReply({ components: [emptyContainer], flags: 32768 });
    }

    const container = {
        type: 17,
        accent_color: 0xc773ff,
        components: [
            {
                type: 9,
                components: [{ type: 10, content: `## 📋 LISTA DE KEYS\n> Selecione uma chave abaixo para gerenciar.` }],
                accessory: { type: 11, media: { url: serverIcon } }
            },
            {
                type: 1,
                components: [
                    {
                        type: 3,
                        custom_id: 'manage_keys_select',
                        placeholder: 'Escolha uma key da lista...',
                        options: keys.map(k => {
                            const pType = k.permissions?.type || 'all';
                            const pVal = k.permissions?.value ? ` (${k.permissions.value})` : '';
                            const accessLabel = pType === 'all' ? 'TOTAL' : (pType === 'category' ? 'CAT' : 'TEX');

                            return {
                                label: k.key.replace('TEXTURE-B-', ''),
                                description: `Exp: ${k.duration} | ${accessLabel}${pVal} | ${k.isUsed ? 'USADA' : 'SOLTA'}`,
                                value: k._id.toString(),
                                emoji: { name: k.isUsed ? '🔴' : '🟢' }
                            };
                        })
                    }
                ]
            },
            {
                type: 1,
                components: [
                    { type: 2, style: 2, label: 'Atualizar', custom_id: 'list_keys_back', },
                    { type: 2, style: 2, label: 'Voltar', custom_id: 'back_to_main', }
                ]
            }
        ]
    };

    return await interaction.editReply({ components: [container], flags: 32768 });
}

async function showCategoriesPanel(interaction) {
    const categories = await Category.find().sort({ name: 1 });
    const serverIcon = interaction.guild.iconURL({ dynamic: true, extension: 'png' }) || 'https://cdn.discordapp.com/embed/avatars/0.png';

    let content = '## 🏷️ GESTÃO DE CATEGORIAS\n> Liste, crie ou remova categorias para organizar suas texturas.';
    if (categories.length > 0) {
        content += '\n\n**Categorias cadastradas:**\n' + categories.map(c => `- \`${c.name}\`${c.description ? ` (${c.description})` : ''}`).join('\n');
    } else {
        content += '\n\n*Nenhuma categoria cadastrada.*';
    }

    const container = {
        type: 17,
        accent_color: 0xc773ff,
        components: [
            {
                type: 9,
                components: [{ type: 10, content: content }],
                accessory: { type: 11, media: { url: serverIcon } }
            },
            {
                type: 1,
                components: [
                    { type: 2, style: 3, label: 'Criar Categoria', custom_id: 'create_category', emoji: { name: '➕' } },
                    { type: 2, style: 4, label: 'Remover Categoria', custom_id: 'remove_category_btn', emoji: { name: '🗑️' } },
                    { type: 2, style: 2, label: 'Voltar', custom_id: 'back_to_main', emoji: { name: '⬅️' } }
                ]
            }
        ]
    };

    if (interaction.deferred || interaction.replied) {
        return await interaction.editReply({ components: [container], flags: 32768 });
    } else {
        return await interaction.reply({ components: [container], flags: 32768 });
    }
}
