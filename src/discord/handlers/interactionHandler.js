const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, StringSelectMenuBuilder, MessageFlags } = require('discord.js');
const Version = require('../../database/models/Version');
const Texture = require('../../database/models/Texture');
const Key = require('../../database/models/Key');
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
                    const modal = new ModalBuilder()
                        .setCustomId('modal_generate_key')
                        .setTitle('Gerar Nova Key');

                    const keyTimeInput = new TextInputBuilder()
                        .setCustomId('key_time_input')
                        .setLabel('Duração desta Key')
                        .setPlaceholder('Ex: 4h, permanente (vazio = padrão)')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(false);

                    modal.addComponents(new ActionRowBuilder().addComponents(keyTimeInput));
                    return await interaction.showModal(modal);
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

                const container = {
                    type: 17,
                    accent_color: 0xc773ff,
                    components: [
                        {
                            type: 9,
                            components: [{
                                type: 10,
                                content: `## 🔑 DETALHES DA KEY\n${timeContent}`
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

            if (interaction.customId === 'modal_generate_key') {
                let duration = interaction.fields.getTextInputValue('key_time_input');
                let versionData = await Version.findOne({ id: 'global' });
                if (!duration) duration = versionData?.defaultAccessTime || '4h';

                const keyCode = `TEXTURE-B-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;

                // Calcular Prazo para Usar
                let useDeadlineDate = null;
                const deadline = versionData?.keyUseDeadline || '24h';
                const dValue = parseInt(deadline);
                const dUnit = deadline.slice(-1);
                useDeadlineDate = new Date();
                if (dUnit === 'h') useDeadlineDate.setHours(useDeadlineDate.getHours() + dValue);
                else if (dUnit === 'm') useDeadlineDate.setMinutes(useDeadlineDate.getMinutes() + dValue);
                else if (dUnit === 's') useDeadlineDate.setSeconds(useDeadlineDate.getSeconds() + dValue);
                else useDeadlineDate.setHours(useDeadlineDate.getHours() + 24);

                await Key.create({
                    key: keyCode,
                    duration: duration,
                    expiresToUseAt: useDeadlineDate
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
                                content: `## ✅ KEY GERADA COM SUCESSO!\n> **Cod:** \`${keyCode}\`\n> **Duração:** \`${duration}\`\n> **Expira resgate em:** <t:${Math.floor(useDeadlineDate.getTime() / 1000)}:R>\n> -# Chave disponível no banco.`
                            }],
                            accessory: { type: 11, media: { url: serverIcon } }
                        }
                    ]
                };

                const panel = createMainPanel(interaction.guild, versionData?.version || '1.0', versionData?.keyShortener, versionData?.defaultAccessTime, versionData?.keyUseDeadline, versionData?.targetFolderName);
                await interaction.followUp({ components: [successContainer], flags: 32768 + 64 });
                return await interaction.editReply({ ...panel, flags: 32768 });
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
                        options: keys.map(k => ({
                            label: k.key,
                            description: `Duração App: ${k.duration} | ${k.isUsed ? 'USADA' : 'SOLTA'}`,
                            value: k._id.toString(),
                            emoji: { name: k.isUsed ? '🔴' : '🟢' }
                        }))
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
