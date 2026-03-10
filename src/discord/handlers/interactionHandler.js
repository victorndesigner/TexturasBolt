const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, StringSelectMenuBuilder, MessageFlags } = require('discord.js');
const supabase = require('../../database/supabase');
const { createMainPanel } = require('../components/mainPanel');
const { createTexturePanel } = require('../components/texturePanel');
const crypto = require('crypto');

// Cache de Version para modais (evita Unknown interaction por latência do DB)
let _versionCache = { data: null, ts: 0 };
const CACHE_TTL = 15000;
async function getVersionCached() {
    if (_versionCache.data && Date.now() - _versionCache.ts < CACHE_TTL) return _versionCache.data;
    const { data } = await supabase.from('versions').select('*').eq('global_id', 'global').maybeSingle();
    _versionCache = { data, ts: Date.now() };
    return data;
}
function invalidateVersionCache(newData) {
    _versionCache = newData ? { data: newData, ts: Date.now() } : { data: null, ts: 0 };
}

 // Dedupe de componentes: evita processar cliques duplicados (Discord às vezes reenvia)
 const _recentComponentActions = new Map();
 const COMPONENT_DEDUPE_MS = 2500;
 function componentFingerprint(interaction) {
     const type = interaction.type;
     const cid = interaction.customId || '';
     const mid = interaction.message?.id || '';
     const uid = interaction.user?.id || '';
     const vals = Array.isArray(interaction.values) ? interaction.values.join(',') : '';
     return `${type}:${cid}:${mid}:${uid}:${vals}`;
 }

async function interactionHandler(interaction) {
    // --- VERIFICAÇÃO DE PERMISSÕES (APENAS DONO/ADM) ---
    const OWNER_ID = '971163830887514132'; // ID do dono bolttexturas
    const isAdmin = !!interaction.member?.permissions?.has?.('Administrator');
    if (!isAdmin && interaction.user?.id !== OWNER_ID) {
        const serverIcon = interaction.guild?.iconURL({ dynamic: true, extension: 'png' }) || 'https://cdn.discordapp.com/embed/avatars/0.png';
        const noPermissionContainer = {
            type: 17,
            accent_color: 0xff0000,
            components: [{
                type: 9,
                components: [{ 
                    type: 10, 
                    content: `## 🚫 ACESSO NEGADO\n> Apenas administradores podem interagir com o painel.\n> -# Se você precisa de acesso, contate o dono do servidor.` 
                }],
                accessory: { type: 11, media: { url: serverIcon } }
            }]
        };

        if (interaction.isRepliable()) {
            if (interaction.deferred || interaction.replied) {
                return await interaction.followUp({ components: [noPermissionContainer], flags: 64 + 32768 });
            } else {
                return await interaction.reply({ components: [noPermissionContainer], flags: 64 + 32768 });
            }
        }
        return;
    }

    // --- DEDUPE DE COMPONENTES (evita double-ack / unknown interaction por duplicata) ---
    if (interaction.isButton() || interaction.isStringSelectMenu() || interaction.isModalSubmit()) {
        const fp = componentFingerprint(interaction);
        const last = _recentComponentActions.get(fp) || 0;
        const now = Date.now();
        if (now - last < COMPONENT_DEDUPE_MS) {
            return;
        }
        _recentComponentActions.set(fp, now);
        // limpeza leve
        if (_recentComponentActions.size > 1500) {
            for (const [k, ts] of _recentComponentActions.entries()) {
                if (now - ts > COMPONENT_DEDUPE_MS) _recentComponentActions.delete(k);
            }
        }
    }

    // DEFER IMEDIATO (evita Unknown interaction em cold start / latência)
    if (!interaction.deferred && !interaction.replied) {
        if (interaction.isModalSubmit()) {
            await interaction.deferUpdate();
        } else if (interaction.isButton()) {
            const cid = interaction.customId || '';
            const deferBtns = ['update_panel', 'back_to_main', 'list_keys_back', 'delete_key_', 'manage_textures', 'manage_categories', 'manage_users', 'toggle_ban_'];
            if (deferBtns.some(d => d.endsWith('_') ? cid.startsWith(d) : cid === d)) {
                await interaction.deferUpdate();
            }
        } else if (interaction.isStringSelectMenu() && interaction.customId === 'main_select') {
            const val = interaction.values?.[0];
            const deferVals = ['manage_textures', 'manage_categories', 'generate_key', 'list_keys', 'manage_users'];
            if (deferVals.includes(val)) {
                await interaction.deferUpdate();
            }
        } else if (interaction.isStringSelectMenu()) {
            const cid = interaction.customId || '';
            if (['manage_keys_select', 'select_user', 'texture_manage_select', 'remove_texture_select', 'remove_category_select'].includes(cid)) {
                await interaction.deferUpdate();
            }
        }
    }

    try {
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

                if (value === 'manage_textures_version') {
                    const config = await getVersionCached();
                    const modal = new ModalBuilder()
                        .setCustomId('modal_textures_version')
                        .setTitle('Versão das Texturas');

                    const sgVersionInput = new TextInputBuilder()
                        .setCustomId('sg_version_input')
                        .setLabel('Versão StumbleGuys/Reviver')
                        .setPlaceholder('Ex: 1.5')
                        .setValue(config?.stumble_guys_version || '1.0')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true);

                    const scVersionInput = new TextInputBuilder()
                        .setCustomId('sc_version_input')
                        .setLabel('Versão Stumble Cups')
                        .setPlaceholder('Ex: 1.2')
                        .setValue(config?.stumble_cups_version || '1.0')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true);

                    modal.addComponents(
                        new ActionRowBuilder().addComponents(sgVersionInput),
                        new ActionRowBuilder().addComponents(scVersionInput)
                    );
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
                    if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate();
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
                            { type: 14 }, // SEPARADOR (AGORA NO LUGAR CERTO)
                            {
                                type: 1,
                                components: [
                                    {
                                        type: 3,
                                        custom_id: 'gen_key_type_select',
                                        placeholder: 'Selecione o tipo de acesso...',
                                        options: [
                                            { label: 'Padrão', description: 'Todas as texturas, COM encurtador obrigatório', value: 'standard', emoji: { name: '🔗' } },
                                            { label: 'Acesso Total', description: 'Todas as texturas, SEM encurtador (Download Direto)', value: 'all', emoji: { name: '🌐' } },
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
                    if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate();
                    return await showKeysList(interaction);
                }

                if (value === 'manage_users') {
                    if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate();
                    return await showUsersPanel(interaction);
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

                        await supabase.from('versions').upsert({ global_id: 'global', profile_image: url });
                        invalidateVersionCache();

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
                    const config = await getVersionCached();
                    const modal = new ModalBuilder().setCustomId('modal_original_links').setTitle('Arquivos Originais (StumbleCups)');
                    modal.addComponents(
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('orig_p1').setLabel('Original P1 (Jogo)').setValue(config?.remove_url_part1 || '').setStyle(TextInputStyle.Short).setRequired(false)),
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('orig_p2').setLabel('Original P2 (AppData)').setValue(config?.remove_url_part2 || '').setStyle(TextInputStyle.Short).setRequired(false))
                    );
                    return await interaction.showModal(modal);
                }

                if (value === 'manage_categories') {
                    if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate();
                    return await showCategoriesPanel(interaction);
                }

                if (value === 'manage_textures') {
                    if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate();
                    const { data: textures } = await supabase.from('textures').select('*');
                    const panel = createTexturePanel(interaction.guild, textures || []);
                    return await interaction.editReply({ ...panel, flags: 32768 });
                }
            }

            if (interaction.customId === 'manage_keys_select') {
                if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate();
                const keyId = interaction.values[0];
                const { data: keyData } = await supabase.from('keys').select('*').eq('id', keyId).maybeSingle();
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

                let timeContent = `> **Código:** \`${keyData.key}\`\n> **Duração:** \`${keyData.duration}\`\n> **Status:** \`${keyData.is_used ? 'Utilizada' : 'Disponível'}\`\n> **Criada em:** <t:${Math.floor(new Date(keyData.created_at).getTime() / 1000)}:R>`;

                if (!keyData.is_used && keyData.expires_to_use_at) {
                    timeContent += `\n> **Expira para uso em:** <t:${Math.floor(new Date(keyData.expires_to_use_at).getTime() / 1000)}:R>`;
                } else if (keyData.is_used && keyData.expires_at) {
                    timeContent += `\n> **Expira acesso em:** <t:${Math.floor(new Date(keyData.expires_at).getTime() / 1000)}:R>`;
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
                                { type: 2, style: 2, label: 'Excluir', custom_id: `delete_key_${keyId}` },
                                { type: 2, style: 2, label: 'Voltar', custom_id: 'list_keys_back' }
                            ]
                        }
                    ]
                };

                return await interaction.editReply({ components: [container], flags: 32768 });
            }

            if (interaction.customId === 'select_user') {
                if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate();
                const hwid = interaction.values[0];
                const { data: userData } = await supabase.from('users').select('*').eq('hwid', hwid).maybeSingle();
                if (!userData) {
                    return await interaction.editReply({ content: '❌ Usuário não encontrado.', components: [], flags: 64 });
                }

                const serverIcon = interaction.guild.iconURL({ dynamic: true, extension: 'png' }) || 'https://cdn.discordapp.com/embed/avatars/0.png';
                const container = {
                    type: 17,
                    accent_color: userData.is_blacklisted ? 0xff0000 : 0xc773ff,
                    components: [
                        {
                            type: 9,
                            components: [{
                                type: 10,
                                content: `## 👤 INFORMAÇÕES DO USUÁRIO\n> **Status:** ${userData.is_blacklisted ? '🚫 **BANIDO**' : '✅ Ativo'}\n\n**Discord:** ${userData.discord_tag || 'Não vinculado'}\n**Discord ID:** \`${userData.discord_id || 'N/A'}\`\n**HWID:** \`${userData.hwid}\`\n**Último IP:** \`${userData.last_ip || 'N/A'}\`\n**Última Key Usada:** \`${userData.last_key_used || 'N/A'}\`\n**Última Key Gerada:** \`${userData.last_generated_key || 'Nenhuma'}\`\n**Total de Instalações:** \`${userData.total_installs}\`\n**Criado em:** <t:${Math.floor(new Date(userData.created_at).getTime() / 1000)}:R>\n**Atualizado em:** <t:${Math.floor(new Date(userData.updated_at).getTime() / 1000)}:R>`
                            }],
                            accessory: { type: 11, media: { url: serverIcon } }
                        },
                        { type: 14 },
                        {
                            type: 1,
                            components: [
                                {
                                    type: 2,
                                    style: userData.is_blacklisted ? 3 : 4,
                                    label: userData.is_blacklisted ? 'Remover Ban' : 'Banir Usuário',
                                    custom_id: `toggle_ban_${hwid}`
                                },
                                { type: 2, style: 2, label: 'Voltar', custom_id: 'manage_users' }
                            ]
                        }
                    ]
                };

                return await interaction.editReply({ components: [container], flags: 32768 });
            }

            if (interaction.customId === 'texture_manage_select') {
                if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate();
                const textureId = interaction.values[0];
                const { data: texture } = await supabase.from('textures').select('*').eq('id', textureId).maybeSingle();
                if (!texture) return;

                const serverIcon = interaction.guild.iconURL({ dynamic: true, extension: 'png' }) || 'https://cdn.discordapp.com/embed/avatars/0.png';
                const container = {
                    type: 17,
                    accent_color: 0xc773ff,
                    components: [
                        {
                            type: 9,
                            components: [{ 
                                type: 10, 
                                content: `## ⚙️ GERENCIAR: ${texture.name}\n> **Categoria:** \`${texture.category}\`\n> **Versão:** \`${texture.version || '1.0'}\`\n> **Status:** ${texture.is_updated ? '✅ Atualizada' : '❌ Desatualizada'}\n\nEscolha o que deseja configurar abaixo:` 
                            }],
                            accessory: { type: 11, media: { url: texture.profile_image || serverIcon } }
                        },
                        {
                            type: 1,
                            components: [
                                { 
                                type: 2, 
                                style: texture.is_updated ? 4 : 3, 
                                label: texture.is_updated ? 'Desatualizar' : 'Atualizar', 
                                custom_id: `toggle_texture_status_${textureId}`
                                },
                                { type: 2, style: 2, label: 'Editar', custom_id: `manage_edit_data_${textureId}` },
                                { type: 2, style: 2, label: 'Links', custom_id: `manage_removal_${textureId}` },
                                { type: 2, style: 2, label: 'Voltar', custom_id: 'manage_textures' }
                            ]
                        }
                    ]
                };
                return await interaction.editReply({ components: [container], flags: 32768 });
            }

            if (interaction.customId === 'remove_texture_select') {
                if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate();
                const textureId = interaction.values[0];
                await supabase.from('textures').delete().eq('id', textureId);

                // Mensagem de Sucesso (Efêmera)
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
                await interaction.followUp({ components: [successContainer], flags: 64 + 32768 });

                // Atualizar o painel principal
                const { data: textures } = await supabase.from('textures').select('*');
                const panel = createTexturePanel(interaction.guild, textures || []);
                return await interaction.editReply({ ...panel, flags: 32768 });
            }

            if (interaction.customId === 'gen_key_type_select') {
                const type = interaction.values[0];

                if (type === 'standard') {
                    const modal = new ModalBuilder().setCustomId('modal_gen_key_final_standard').setTitle('Gerar Key (Padrão)');
                    modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('key_time').setLabel('Duração (ex: 7d, 1d30m, permanente)').setPlaceholder('Vazio = Padrão').setStyle(TextInputStyle.Short).setRequired(false)));
                    return await interaction.showModal(modal);
                }

                if (type === 'all') {
                    const modal = new ModalBuilder().setCustomId('modal_gen_key_final_all').setTitle('Gerar Key (Acesso Total)');
                    modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('key_time').setLabel('Duração (ex: 7d, 1d30m, permanente)').setPlaceholder('Vazio = Padrão').setStyle(TextInputStyle.Short).setRequired(false)));
                    return await interaction.showModal(modal);
                }

                if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate();

                if (type === 'category') {
                    const { data: categories } = await supabase.from('categories').select('*');
                    const container = {
                        type: 17, accent_color: 0xc773ff,
                        components: [
                            { type: 9, components: [{ type: 10, content: `## 🔑 GERAR POR CATEGORIA\n> Escolha a categoria:` }], accessory: { type: 11, media: { url: interaction.guild.iconURL() } } },
                            {
                                type: 1, components: [{
                                    type: 3, custom_id: 'gen_key_value_cat_select', placeholder: 'Selecione a categoria...',
                                    options: (categories || []).map(c => ({ label: c.name, value: c.name }))
                                }]
                            }
                        ]
                    };
                    return await interaction.editReply({ components: [container], flags: 32768 });
                }

                if (type === 'texture') {
                    const { data: textures } = await supabase.from('textures').select('*');
                    const container = {
                        type: 17, accent_color: 0xc773ff,
                        components: [
                            { type: 9, components: [{ type: 10, content: `## 🔑 GERAR POR TEXTURA\n> Escolha a textura:` }], accessory: { type: 11, media: { url: interaction.guild.iconURL() } } },
                            {
                                type: 1, components: [{
                                    type: 3, custom_id: 'gen_key_value_tex_select', placeholder: 'Selecione a textura...',
                                    options: (textures || []).slice(0, 25).map(t => ({ label: t.name, value: t.id.toString() }))
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
                const { data: texture } = await supabase.from('textures').select('*').eq('id', value).maybeSingle();
                const modal = new ModalBuilder().setCustomId(`modal_gen_key_final_texture_${value}`).setTitle(`Gerar Key: ${texture?.name || 'N/A'}`);
                modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('key_time').setLabel('Duração (ex: 7d, 1d30m, permanente)').setPlaceholder('Vazio = Padrão').setStyle(TextInputStyle.Short).setRequired(false)));
                return await interaction.showModal(modal);
            }
        }

        // --- BUTTONS ---
        if (interaction.isButton()) {
            if (interaction.customId === 'search_user') {
                const modal = new ModalBuilder()
                    .setCustomId('modal_search_user')
                    .setTitle('Pesquisar Usuário');

                modal.addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('search_hwid')
                            .setLabel('Termo de Pesquisa')
                            .setPlaceholder('HWID, Discord ID ou Nome de Usuário...')
                            .setStyle(TextInputStyle.Short)
                            .setRequired(true)
                    )
                );
                return await interaction.showModal(modal);
            }
            if (interaction.customId === 'update_textures_btn') {
                const serverIcon = interaction.guild.iconURL({ dynamic: true, extension: 'png' }) || 'https://cdn.discordapp.com/embed/avatars/0.png';
                const container = {
                    type: 17,
                    accent_color: 0xc773ff,
                    components: [
                        {
                            type: 9,
                            components: [{ type: 10, content: `## 🔄 ATUALIZAÇÃO EM MASSA\n> Escolha uma opção para gerenciar o status de todas as texturas.` }],
                            accessory: { type: 11, media: { url: serverIcon } }
                        },
                        {
                            type: 1,
                            components: [
                                {
                                    type: 3,
                                    custom_id: 'bulk_update_select',
                                    placeholder: 'Selecione uma ação...',
                                    options: [
                                        { label: 'Atualizar Tudo', description: 'Marca todas as texturas como atualizadas', value: 'update_all', emoji: { name: '✅' } },
                                        { label: 'Desatualizar Tudo', description: 'Marca todas as texturas como desatualizadas', value: 'desat_all', emoji: { name: '❌' } },
                                        { label: 'Atualizar Categoria', description: 'Escolha uma ou mais categorias para atualizar', value: 'att_category', emoji: { name: '🏷️' } },
                                        { label: 'Desatualizar Categoria', description: 'Escolha uma ou mais categorias para desatualizar', value: 'desat_category', emoji: { name: '🏷️' } }
                                    ]
                                }
                            ]
                        }
                    ]
                };
                return await interaction.reply({ components: [container], flags: 64 + 32768 });
            }

            if (interaction.customId.startsWith('toggle_texture_status_')) {
                if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate();
                const textureId = interaction.customId.replace('toggle_texture_status_', '');
                const { data: texture } = await supabase.from('textures').select('*').eq('id', textureId).maybeSingle();
                
                if (texture) {
                    const newStatus = !texture.is_updated;
                    await supabase.from('textures').update({ is_updated: newStatus }).eq('id', textureId);
                    texture.is_updated = newStatus; // Local update for the panel rebuild
                    
                    const serverIcon = interaction.guild.iconURL({ dynamic: true, extension: 'png' }) || 'https://cdn.discordapp.com/embed/avatars/0.png';
                    const container = {
                        type: 17,
                        accent_color: 0xc773ff,
                        components: [
                            {
                                type: 9,
                                components: [{ 
                                    type: 10, 
                                    content: `## ⚙️ GERENCIAR: ${texture.name}\n> **Categoria:** \`${texture.category}\`\n> **Versão:** \`${texture.version || '1.0'}\`\n> **Status:** ${texture.is_updated ? '✅ Atualizada' : '❌ Desatualizada'}\n\nEscolha o que deseja configurar abaixo:` 
                                }],
                                accessory: { type: 11, media: { url: texture.profile_image || serverIcon } }
                            },
                            {
                                type: 1,
                                components: [
                                    { 
                                        type: 2, 
                                        style: texture.is_updated ? 4 : 3, 
                                        label: texture.is_updated ? 'Desatualizar' : 'Atualizar', 
                                        custom_id: `toggle_texture_status_${textureId}` 
                                    },
                                    { type: 2, style: 2, label: 'Editar', custom_id: `manage_edit_data_${textureId}` },
                                    { type: 2, style: 2, label: 'Links', custom_id: `manage_removal_${textureId}` },
                                    { type: 2, style: 2, label: 'Voltar', custom_id: 'manage_textures' }
                                ]
                            }
                        ]
                    };
                    return await interaction.editReply({ components: [container], flags: 32768 });
                }
            }

            if (interaction.customId === 'update_panel' || interaction.customId === 'back_to_main') {
                if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate();
                const versionData = await getVersionCached();
                const panel = createMainPanel(interaction.guild, versionData?.version || '1.0', versionData?.key_shortener, versionData?.default_access_time, versionData?.key_use_deadline, versionData?.target_folder_name, versionData?.stumble_guys_version, versionData?.stumble_cups_version);
                return await interaction.editReply({ ...panel, flags: 32768 });
            }

            if (interaction.customId === 'list_keys_back') {
                if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate();
                return await showKeysList(interaction);
            }

            if (interaction.customId.startsWith('delete_key_')) {
                if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate();
                const keyId = interaction.customId.replace('delete_key_', '');
                await supabase.from('keys').delete().eq('id', keyId);

                const versionData = await getVersionCached();

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

                const panel = createMainPanel(interaction.guild, versionData?.version || '1.0', versionData?.key_shortener, versionData?.default_access_time, versionData?.key_use_deadline, versionData?.target_folder_name, versionData?.stumble_guys_version, versionData?.stumble_cups_version);
                await interaction.followUp({ components: [successContainer], flags: 32768 + 64 });
                return await interaction.editReply({ ...panel, flags: 32768 });
            }

            if (interaction.customId === 'exit_panel') {
                return await interaction.message.delete();
            }

            if (interaction.customId === 'manage_textures') {
                if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate();
                const { data: textures } = await supabase.from('textures').select('*');
                const panel = createTexturePanel(interaction.guild, textures || []);
                return await interaction.editReply({ ...panel, flags: 32768 });
            }

            if (interaction.customId === 'create_texture') {
                const modal = new ModalBuilder()
                    .setCustomId('modal_create_texture')
                    .setTitle('Criar Nova Textura');

                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('texture_name').setLabel('Nome').setStyle(TextInputStyle.Short).setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('texture_category').setLabel('Categoria (StumbleGuys, StumbleCups, Reviver)').setStyle(TextInputStyle.Short).setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('texture_version').setLabel('Versão da Textura').setPlaceholder('Ex: 1.0').setStyle(TextInputStyle.Short).setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('texture_p1').setLabel('Link Part 1 (Textura)').setStyle(TextInputStyle.Short).setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('texture_p2').setLabel('Link Part 2 (Opcional - AppData)').setStyle(TextInputStyle.Short).setRequired(false))
                );
                return await interaction.showModal(modal);
            }

            if (interaction.customId.startsWith('manage_edit_data_')) {
                const textureId = interaction.customId.replace('manage_edit_data_', '');
                const { data: texture } = await supabase.from('textures').select('*').eq('id', textureId).maybeSingle();
                const modal = new ModalBuilder().setCustomId(`modal_edit_texture_${textureId}`).setTitle('Editar Dados Básicos');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('edit_name').setLabel('Nome').setValue(texture.name).setStyle(TextInputStyle.Short)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('edit_category').setLabel('Categoria').setValue(texture.category).setStyle(TextInputStyle.Short)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('edit_version').setLabel('Versão Atual').setValue(texture.version || '1.0').setStyle(TextInputStyle.Short)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('edit_shortener').setLabel('Link Encurtador (Opcional)').setValue(texture.shortener_url || '').setStyle(TextInputStyle.Short).setRequired(false)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('edit_profile').setLabel('Foto Perfil').setValue(texture.profile_image).setStyle(TextInputStyle.Short))
                );
                return await interaction.showModal(modal);
            }

            if (interaction.customId.startsWith('manage_removal_')) {
                const textureId = interaction.customId.replace('manage_removal_', '');
                const { data: texture } = await supabase.from('textures').select('*').eq('id', textureId).maybeSingle();
                const modal = new ModalBuilder().setCustomId(`modal_removal_links_${textureId}`).setTitle('Gerenciar Arquivos (Download)');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('file_p1').setLabel('Textura P1 (Jogo)').setValue(texture.download_url).setStyle(TextInputStyle.Short)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('file_p2').setLabel('Textura P2 (AppData)').setValue(texture.download_url_part2 || '').setStyle(TextInputStyle.Short).setRequired(false))
                );
                return await interaction.showModal(modal);
            }

            if (interaction.customId === 'remove_texture_btn') {
                const { data: textures } = await supabase.from('textures').select('*');
                if (!textures || textures.length === 0) {
                    const serverIcon = interaction.guild.iconURL({ dynamic: true, extension: 'png' }) || 'https://cdn.discordapp.com/embed/avatars/0.png';
                    const errorContainer = {
                        type: 17,
                        accent_color: 0xff0000,
                        components: [
                            {
                                type: 9,
                                components: [{
                                    type: 10,
                                    content: `## ❌ NENHUMA TEXTURA PARA REMOVER!\n> Não há texturas cadastradas para serem removidas.`
                                }],
                                accessory: { type: 11, media: { url: serverIcon } }
                            },
                            {
                                type: 1,
                                components: [{ type: 2, style: 2, label: 'Voltar', custom_id: 'manage_textures' }]
                            }
                        ]
                    };
                    return await interaction.update({ components: [errorContainer], flags: 32768 });
                }

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
                            components: [
                                {
                                    type: 3,
                                    custom_id: 'remove_texture_select',
                                    placeholder: 'Selecione uma textura para remover...',
                                    options: textures.slice(0, 25).map(t => ({ label: t.name, value: t.id }))
                                }
                            ]
                        },
                        {
                            type: 1,
                            components: [
                                { type: 2, style: 2, label: 'Voltar', custom_id: 'manage_textures' }
                            ]
                        }
                    ]
                };
                return await interaction.update({ components: [container], flags: 32768 });
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
                const { data: categories } = await supabase.from('categories').select('*');
                if (!categories || categories.length === 0) {
                    return await interaction.reply({ content: '❌ Nenhuma categoria para remover.', flags: 64 });
                }

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
                        {
                            type: 1,
                            components: [
                                {
                                    type: 3,
                                    custom_id: 'remove_category_select',
                                    placeholder: 'Selecione uma categoria...',
                                    options: categories.slice(0, 25).map(c => ({ label: c.name, value: c.id }))
                                }
                            ]
                        },
                        {
                            type: 1,
                            components: [
                                { type: 2, style: 2, label: 'Voltar', custom_id: 'manage_categories' }
                            ]
                        }
                    ]
                };
                return await interaction.update({ components: [container] });
            }

            if (interaction.customId === 'manage_categories') {
                if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate();
                return await showCategoriesPanel(interaction);
            }


            if (interaction.customId.startsWith('toggle_ban_')) {
                if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate();
                const hwid = interaction.customId.replace('toggle_ban_', '');
                const { data: userData } = await supabase.from('users').select('*').eq('hwid', hwid).maybeSingle();

                if (!userData) {
                    return await interaction.editReply({ content: '❌ Usuário não encontrado.', components: [], flags: 64 });
                }

                const newBanStatus = !userData.is_blacklisted;
                await supabase.from('users').update({ 
                    is_blacklisted: newBanStatus,
                    blacklist_reason: newBanStatus ? 'Banido via painel administrativo' : null,
                    updated_at: new Date().toISOString()
                }).eq('hwid', hwid);
                
                userData.is_blacklisted = newBanStatus; // Local sync for success msg

                const serverIcon = interaction.guild.iconURL({ dynamic: true, extension: 'png' }) || 'https://cdn.discordapp.com/embed/avatars/0.png';
                const successContainer = {
                    type: 17,
                    accent_color: userData.is_blacklisted ? 0xff0000 : 0x00ff88,
                    components: [{
                        type: 9,
                        components: [{
                            type: 10,
                            content: `## ${userData.is_blacklisted ? '🚫 USUÁRIO BANIDO' : '✅ BAN REMOVIDO'}\n> **Discord:** ${userData.discord_tag || 'Não vinculado'}\n> **HWID:** \`${userData.hwid}\`\n> **Status:** ${userData.is_blacklisted ? '**BANIDO**' : 'Ativo'}`
                        }],
                        accessory: { type: 11, media: { url: serverIcon } }
                    }]
                };

                await interaction.followUp({ components: [successContainer], flags: 64 + 32768 });
                return await showUsersPanel(interaction);
            }

            if (interaction.customId === 'manage_users') {
                if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate();
                return await showUsersPanel(interaction);
            }
        }

        // --- SELECT MENUS EXTRAS ---
        if (interaction.isStringSelectMenu()) {
            if (interaction.customId === 'remove_category_select') {
                if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate();
                const catId = interaction.values[0];
                const { data: category } = await supabase.from('categories').select('*').eq('id', catId).maybeSingle();
                if (category) {
                    const catName = category.name;
                    await supabase.from('textures').update({ category: 'Geral' }).eq('category', catName);
                    await supabase.from('categories').delete().eq('id', catId);

                    // Mensagem Efêmera de Sucesso V2
                    const serverIcon = interaction.guild.iconURL({ dynamic: true, extension: 'png' }) || 'https://cdn.discordapp.com/embed/avatars/0.png';
                    const successContainer = {
                        type: 17,
                        accent_color: 0x00ff88,
                        components: [{
                            type: 9,
                            components: [{ type: 10, content: `## ✅ CATEGORIA REMOVIDA\n> A categoria **${catName}** foi removida.\n> Texturas associadas foram movidas para 'Geral'.` }],
                            accessory: { type: 11, media: { url: serverIcon } }
                        }]
                    };
                    await interaction.followUp({ components: [successContainer], flags: 64 + 32768 });
                }
                return await showCategoriesPanel(interaction);
            }

            if (interaction.customId === 'bulk_update_select') {
                const value = interaction.values[0];
                if (value === 'update_all') {
                    await supabase.from('textures').update({ is_updated: true }).not('id', 'is', null);
                    const serverIcon = interaction.guild.iconURL({ dynamic: true, extension: 'png' }) || 'https://cdn.discordapp.com/embed/avatars/0.png';
                    const ok = {
                        type: 17,
                        accent_color: 0x00ff88,
                        components: [{
                            type: 9,
                            components: [{ type: 10, content: '## ✅ ATUALIZADO\n> Todas as texturas foram marcadas como **Atualizadas**.' }],
                            accessory: { type: 11, media: { url: serverIcon } }
                        }]
                    };
                    return await interaction.update({ components: [ok], flags: 64 + 32768 });
                }
                if (value === 'desat_all') {
                    await supabase.from('textures').update({ is_updated: false }).not('id', 'is', null);
                    const serverIcon = interaction.guild.iconURL({ dynamic: true, extension: 'png' }) || 'https://cdn.discordapp.com/embed/avatars/0.png';
                    const ok = {
                        type: 17,
                        accent_color: 0xff0000,
                        components: [{
                            type: 9,
                            components: [{ type: 10, content: '## ❌ DESATUALIZADO\n> Todas as texturas foram marcadas como **Desatualizadas**.' }],
                            accessory: { type: 11, media: { url: serverIcon } }
                        }]
                    };
                    return await interaction.update({ components: [ok], flags: 64 + 32768 });
                }
                if (value === 'att_category') {
                    const { data: textures } = await supabase.from('textures').select('category');
                    const categories = [...new Set((textures || []).map(t => t.category))];
                    const serverIcon = interaction.guild.iconURL({ dynamic: true, extension: 'png' }) || 'https://cdn.discordapp.com/embed/avatars/0.png';
                    if (!categories.length) {
                        const err = {
                            type: 17,
                            accent_color: 0xff0000,
                            components: [{
                                type: 9,
                                components: [{ type: 10, content: '## ❌ ERRO\n> Nenhuma categoria encontrada.' }],
                                accessory: { type: 11, media: { url: serverIcon } }
                            }]
                        };
                        return await interaction.update({ components: [err], flags: 64 + 32768 });
                    }

                    const root = {
                        type: 17,
                        accent_color: 0xc773ff,
                        components: [
                            {
                                type: 9,
                                components: [{ type: 10, content: '## ✅ ATUALIZAR CATEGORIA\n> Escolha uma ou mais categorias para marcar como **Atualizadas**.' }],
                                accessory: { type: 11, media: { url: serverIcon } }
                            },
                            {
                                type: 1,
                                components: [
                                    {
                                        type: 3,
                                        custom_id: 'bulk_att_cat_select',
                                        placeholder: 'Selecione categorias...',
                                        min_values: 1,
                                        max_values: Math.min(25, categories.length),
                                        options: categories.slice(0, 25).map(cat => ({ label: cat, value: cat }))
                                    }
                                ]
                            }
                        ]
                    };
                    return await interaction.update({ components: [root], flags: 64 + 32768 });
                }
                if (value === 'desat_category') {
                    const { data: textures } = await supabase.from('textures').select('category');
                    const categories = [...new Set((textures || []).map(t => t.category))];
                    const serverIcon = interaction.guild.iconURL({ dynamic: true, extension: 'png' }) || 'https://cdn.discordapp.com/embed/avatars/0.png';
                    if (!categories.length) {
                        const err = {
                            type: 17,
                            accent_color: 0xff0000,
                            components: [{
                                type: 9,
                                components: [{ type: 10, content: '## ❌ ERRO\n> Nenhuma categoria encontrada.' }],
                                accessory: { type: 11, media: { url: serverIcon } }
                            }]
                        };
                        return await interaction.update({ components: [err], flags: 64 + 32768 });
                    }

                    const root = {
                        type: 17,
                        accent_color: 0xc773ff,
                        components: [
                            {
                                type: 9,
                                components: [{ type: 10, content: '## ❌ DESATUALIZAR CATEGORIA\n> Escolha uma ou mais categorias para marcar como **Desatualizadas**.' }],
                                accessory: { type: 11, media: { url: serverIcon } }
                            },
                            {
                                type: 1,
                                components: [
                                    {
                                        type: 3,
                                        custom_id: 'bulk_desat_cat_select',
                                        placeholder: 'Selecione categorias...',
                                        min_values: 1,
                                        max_values: Math.min(25, categories.length),
                                        options: categories.slice(0, 25).map(cat => ({ label: cat, value: cat }))
                                    }
                                ]
                            }
                        ]
                    };
                    return await interaction.update({ components: [root], flags: 64 + 32768 });
                }
            }

            if (interaction.customId === 'bulk_att_cat_select') {
                const selected = interaction.values;
                await supabase.from('textures').update({ is_updated: true }).in('category', selected);
                const serverIcon = interaction.guild.iconURL({ dynamic: true, extension: 'png' }) || 'https://cdn.discordapp.com/embed/avatars/0.png';
                const ok = {
                    type: 17,
                    accent_color: 0x00ff88,
                    components: [{
                        type: 9,
                        components: [{ type: 10, content: `## ✅ ATUALIZADO\n> Categorias marcadas como **Atualizadas**:\n\n${selected.map(c => `> - ${c}`).join('\n')}` }],
                        accessory: { type: 11, media: { url: serverIcon } }
                    }]
                };
                return await interaction.update({ components: [ok], flags: 64 + 32768 });
            }

            if (interaction.customId === 'bulk_desat_cat_select') {
                const selected = interaction.values;
                await supabase.from('textures').update({ is_updated: false }).in('category', selected);
                const serverIcon = interaction.guild.iconURL({ dynamic: true, extension: 'png' }) || 'https://cdn.discordapp.com/embed/avatars/0.png';
                const ok = {
                    type: 17,
                    accent_color: 0xff0000,
                    components: [{
                        type: 9,
                        components: [{ type: 10, content: `## ❌ DESATUALIZADO\n> Categorias marcadas como **Desatualizadas**:\n\n${selected.map(c => `> - ${c}`).join('\n')}` }],
                        accessory: { type: 11, media: { url: serverIcon } }
                    }]
                };
                return await interaction.update({ components: [ok], flags: 64 + 32768 });
            }
        }

        // --- MODALS ---
        if (interaction.isModalSubmit()) {
            try {
                if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate();
            } catch (err) {
                // Ignorar erro se já foi respondida (evita crash 40060)
                if (err.code !== 40060 && err.code !== 10062) console.error('Erro ao deferir modal:', err);
            }

            if (interaction.customId === 'modal_textures_version') {
                const sgVersion = interaction.fields.getTextInputValue('sg_version_input');
                const scVersion = interaction.fields.getTextInputValue('sc_version_input');
                await supabase.from('versions').upsert({ 
                    global_id: 'global',
                    stumble_guys_version: sgVersion, 
                    stumble_cups_version: scVersion 
                });
                invalidateVersionCache();
                const data = await getVersionCached();

                const panel = createMainPanel(interaction.guild, data?.version || '1.0', data?.key_shortener, data?.default_access_time, data?.key_use_deadline, data?.target_folder_name, data?.stumble_guys_version, data?.stumble_cups_version);
                return await interaction.editReply({ ...panel, flags: 32768 });
            }

            if (interaction.customId === 'modal_version') {
                const newVersion = interaction.fields.getTextInputValue('version_input');
                await supabase.from('versions').upsert({ global_id: 'global', version: newVersion });
                invalidateVersionCache();
                const data = await getVersionCached();

                const panel = createMainPanel(interaction.guild, data?.version || '1.0', data?.key_shortener, data?.default_access_time, data?.key_use_deadline, data?.target_folder_name, data?.stumble_guys_version, data?.stumble_cups_version);
                return await interaction.editReply({ ...panel, flags: 32768 });
            }

            if (interaction.customId === 'modal_shortener') {
                const newShortener = interaction.fields.getTextInputValue('shortener_input');
                await supabase.from('versions').upsert({ global_id: 'global', key_shortener: newShortener });
                invalidateVersionCache();
                const data = await getVersionCached();

                const panel = createMainPanel(interaction.guild, data?.version || '1.0', data?.key_shortener, data?.default_access_time, data?.key_use_deadline, data?.target_folder_name, data?.stumble_guys_version, data?.stumble_cups_version);
                return await interaction.editReply({ ...panel, flags: 32768 });
            }

            if (interaction.customId === 'modal_time') {
                const newTime = interaction.fields.getTextInputValue('time_input');
                await supabase.from('versions').upsert({ global_id: 'global', default_access_time: newTime });
                invalidateVersionCache();
                const data = await getVersionCached();

                const panel = createMainPanel(interaction.guild, data?.version || '1.0', data?.key_shortener, data?.default_access_time, data?.key_use_deadline, data?.target_folder_name, data?.stumble_guys_version, data?.stumble_cups_version);
                return await interaction.editReply({ ...panel, flags: 32768 });
            }

            if (interaction.customId === 'modal_use_deadline') {
                const newDeadline = interaction.fields.getTextInputValue('deadline_input');
                await supabase.from('versions').upsert({ global_id: 'global', key_use_deadline: newDeadline });
                invalidateVersionCache();
                const data = await getVersionCached();

                const panel = createMainPanel(interaction.guild, data?.version || '1.0', data?.key_shortener, data?.default_access_time, data?.key_use_deadline, data?.target_folder_name, data?.stumble_guys_version, data?.stumble_cups_version);
                return await interaction.editReply({ ...panel, flags: 32768 });
            }

            if (interaction.customId === 'modal_folder_name') {
                const newFolderName = interaction.fields.getTextInputValue('folder_input');
                await supabase.from('versions').upsert({ global_id: 'global', target_folder_name: newFolderName });
                invalidateVersionCache();
                const data = await getVersionCached();

                const panel = createMainPanel(interaction.guild, data?.version || '1.0', data?.key_shortener, data?.default_access_time, data?.key_use_deadline, data?.target_folder_name, data?.stumble_guys_version, data?.stumble_cups_version);
                return await interaction.editReply({ ...panel, flags: 32768 });
            }

            if (interaction.customId === 'modal_original_links') {
                const p1 = interaction.fields.getTextInputValue('orig_p1');
                const p2 = interaction.fields.getTextInputValue('orig_p2');
                await supabase.from('versions').upsert({ global_id: 'global', remove_url_part1: p1, remove_url_part2: p2 });
                invalidateVersionCache();
                const data = await getVersionCached();

                const panel = createMainPanel(interaction.guild, data?.version || '1.0', data?.key_shortener, data?.default_access_time, data?.key_use_deadline, data?.target_folder_name, data?.stumble_guys_version, data?.stumble_cups_version);
                return await interaction.editReply({ ...panel, flags: 32768 });
            }

            if (interaction.customId === 'modal_create_texture') {
                const name = interaction.fields.getTextInputValue('texture_name');
                const category = interaction.fields.getTextInputValue('texture_category');
                const version = interaction.fields.getTextInputValue('texture_version');
                const p1 = interaction.fields.getTextInputValue('texture_p1');
                const p2 = interaction.fields.getTextInputValue('texture_p2');

                await supabase.from('textures').insert({
                    name,
                    category,
                    version,
                    download_url: p1,
                    download_url_part2: p2 || null,
                    is_updated: true
                });

                const { data: textures } = await supabase.from('textures').select('*');
                const panel = createTexturePanel(interaction.guild, textures || []);
                return await interaction.editReply({ ...panel, flags: 32768 });
            }

            if (interaction.customId.startsWith('modal_edit_texture_')) {
                const textureId = interaction.customId.replace('modal_edit_texture_', '');
                const name = interaction.fields.getTextInputValue('edit_name');
                const category = interaction.fields.getTextInputValue('edit_category');
                const version = interaction.fields.getTextInputValue('edit_version');
                const shortener = interaction.fields.getTextInputValue('edit_shortener');
                const profile = interaction.fields.getTextInputValue('edit_profile');

                await supabase.from('textures').update({
                    name,
                    category,
                    version,
                    shortener_url: shortener || null,
                    profile_image: profile || null
                }).eq('id', textureId);

                const { data: textures } = await supabase.from('textures').select('*');
                const panel = createTexturePanel(interaction.guild, textures || []);
                return await interaction.editReply({ ...panel, flags: 32768 });
            }

            if (interaction.customId.startsWith('modal_removal_links_')) {
                const textureId = interaction.customId.replace('modal_removal_links_', '');
                const p1 = interaction.fields.getTextInputValue('file_p1');
                const p2 = interaction.fields.getTextInputValue('file_p2');

                await supabase.from('textures').update({
                    download_url: p1,
                    download_url_part2: p2 || null
                }).eq('id', textureId);

                const { data: textures } = await supabase.from('textures').select('*');
                const panel = createTexturePanel(interaction.guild, textures || []);
                return await interaction.editReply({ ...panel, flags: 32768 });
            }

            if (interaction.customId === 'modal_create_category') {
                const name = interaction.fields.getTextInputValue('cat_name');
                const description = interaction.fields.getTextInputValue('cat_desc');

                await supabase.from('categories').insert({ name, description });

                return await showCategoriesPanel(interaction);
            }

            if (interaction.customId === 'modal_search_user') {
                const term = interaction.fields.getTextInputValue('search_hwid');
                const { data: results } = await supabase.from('users').select('*')
                    .or(`hwid.ilike.%${term}%,discord_id.ilike.%${term}%,discord_tag.ilike.%${term}%`);

                const serverIcon = interaction.guild.iconURL({ dynamic: true, extension: 'png' }) || 'https://cdn.discordapp.com/embed/avatars/0.png';
                if (!results || results.length === 0) {
                    const err = {
                        type: 17,
                        accent_color: 0xff0000,
                        components: [{
                            type: 9,
                            components: [{ type: 10, content: `## ❌ SEM RESULTADOS\n> Nenhum usuário encontrado para **${term}**.` }],
                            accessory: { type: 11, media: { url: serverIcon } }
                        }, {
                            type: 1,
                            components: [{ type: 2, style: 2, label: 'Voltar', custom_id: 'manage_users' }]
                        }]
                    };
                    return await interaction.editReply({ components: [err], flags: 64 + 32768 });
                }

                const container = {
                    type: 17,
                    accent_color: 0xc773ff,
                    components: [
                        {
                            type: 9,
                            components: [{ type: 10, content: `## 🔍 RESULTADOS DA PESQUISA\n> Termo: **${term}**\n> Foram encontrados **${results.length}** usuários.` }],
                            accessory: { type: 11, media: { url: serverIcon } }
                        },
                        {
                            type: 1,
                            components: [
                                {
                                    type: 3,
                                    custom_id: 'select_user',
                                    placeholder: 'Selecione um usuário...',
                                    options: results.slice(0, 25).map(u => ({ label: u.discord_tag || u.hwid.slice(0, 20), description: `ID: ${u.discord_id || 'N/A'} | HWID: ${u.hwid.slice(0, 15)}...`, value: u.hwid }))
                                }
                            ]
                        }
                    ]
                };
                return await interaction.editReply({ components: [container], flags: 32768 });
            }

            if (interaction.customId.startsWith('modal_gen_key_final_')) {
                const parts = interaction.customId.replace('modal_gen_key_final_', '').split('_');
                const type = parts[0];
                const value = parts[1] || 'all';

                const userTime = interaction.fields.getTextInputValue('key_time');
                const config = await getVersionCached();
                const duration = userTime || config?.default_access_time || '2h';

                const crypto = require('crypto');
                const key = `BOLT-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;

                const permissions = { type };
                if (type === 'category' || type === 'texture') permissions.value = value;

                let expiresToUseAt = null;
                const deadline = config?.key_use_deadline || '24h';
                const deadlineMs = parseDuration(deadline);
                if (deadlineMs) expiresToUseAt = new Date(Date.now() + deadlineMs).toISOString();

                await supabase.from('keys').insert({
                    key,
                    duration,
                    permissions,
                    is_used: false,
                    expires_to_use_at: expiresToUseAt,
                    created_at: new Date().toISOString()
                });

                const serverIcon = interaction.guild.iconURL({ dynamic: true, extension: 'png' }) || 'https://cdn.discordapp.com/embed/avatars/0.png';
                const successContainer = {
                    type: 17,
                    accent_color: 0x00ff88,
                    components: [{
                        type: 9,
                        components: [{
                            type: 10,
                            content: `## ✅ KEY GERADA!\n> **Key:** \`${key}\`\n> **Tipo:** \`${type}\`${value !== 'all' && value !== 'standard' ? ` (\`${value}\`)` : ''}\n> **Duração:** \`${duration}\`\n\nAcesse o encurtador para liberar o acesso.`
                        }],
                        accessory: { type: 11, media: { url: serverIcon } }
                    }]
                };

                return await interaction.editReply({ components: [successContainer], flags: 64 + 32768 });
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
    const { data: keys } = await supabase.from('keys').select('*').order('created_at', { ascending: false }).limit(25);
    const serverIcon = interaction.guild.iconURL({ dynamic: true, extension: 'png' }) || 'https://cdn.discordapp.com/embed/avatars/0.png';

    if (!keys || keys.length === 0) {
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
                                label: k.key.replace('BOLT-', ''),
                                description: `Exp: ${k.duration} | ${accessLabel}${pVal} | ${k.is_used ? 'USADA' : 'SOLTA'}`,
                                value: k.id.toString(),
                                emoji: { name: k.is_used ? '🔴' : '🟢' }
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
    const { data: textureData } = await supabase.from('textures').select('category');
    const textureCategories = [...new Set((textureData || []).map(t => t.category))];
    
    for (const catName of textureCategories) {
        if (catName) await supabase.from('categories').upsert({ name: catName }, { onConflict: 'name' });
    }

    const { data: categories } = await supabase.from('categories').select('*').order('name', { ascending: true });
    const serverIcon = interaction.guild.iconURL({ dynamic: true, extension: 'png' }) || 'https://cdn.discordapp.com/embed/avatars/0.png';

    const container = {
        type: 17,
        accent_color: 0xc773ff,
        components: [
            // Cabeçalho
            {
                type: 9,
                components: [{ type: 10, content: `## 🏷️ GESTÃO DE CATEGORIAS\n> Liste, crie ou remova categorias para organizar suas texturas.` }],
                accessory: { type: 11, media: { url: serverIcon } }
            },
            { type: 14 }, // SEPARADOR 1

            // Lista de Categorias
            {
                type: 10,
                content: categories && categories.length > 0
                    ? `### 📋 Categorias cadastradas:\n` + categories.map(c => `- \`${c.name}\`${c.description ? ` (${c.description})` : ''}`).join('\n')
                    : `### 📋 Categorias cadastradas:\n> *- Nenhuma categoria cadastrada.*`
            },
            { type: 14 }, // SEPARADOR 2

            // Botões de Ação
            {
                type: 1,
                components: [
                    { type: 2, style: 2, label: 'Criar', custom_id: 'create_category' },
                    { type: 2, style: 2, label: 'Remover', custom_id: 'remove_category_btn' },
                    { type: 2, style: 2, label: 'Voltar', custom_id: 'back_to_main' }
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

async function showUsersPanel(interaction) {
    const { data: users } = await supabase.from('users').select('*').order('created_at', { ascending: false }).limit(25);
    const serverIcon = interaction.guild.iconURL({ dynamic: true, extension: 'png' }) || 'https://cdn.discordapp.com/embed/avatars/0.png';

    const container = {
        type: 17,
        accent_color: 0xc773ff,
        components: [
            {
                type: 9,
                components: [{ type: 10, content: `## 👥 GESTÃO DE USUÁRIOS\n> Gerencie usuários, visualize informações e controle a blacklist.` }],
                accessory: { type: 11, media: { url: serverIcon } }
            },
            { type: 14 },
            {
                type: 10,
                content: users && users.length > 0
                    ? `### 📊 Total de usuários: **${users.length}**\n> Selecione um usuário abaixo ou use a pesquisa.`
                    : `### 📊 Nenhum usuário registrado ainda.`
            },
            { type: 14 }
        ]
    };

    if (users && users.length > 0) {
        container.components.push({
            type: 1,
            components: [{
                type: 3,
                custom_id: 'select_user',
                placeholder: 'Selecione um usuário...',
                options: users.map(u => ({
                    label: u.discord_tag || `HWID: ${u.hwid.substring(0, 12)}...`,
                    description: `IP: ${u.last_ip || 'N/A'} | Installs: ${u.total_installs}`,
                    value: u.hwid,
                    emoji: { name: u.is_blacklisted ? '🚫' : '✅' }
                }))
            }]
        });
    }

    container.components.push({
        type: 1,
        components: [
            { type: 2, style: 2, label: 'Pesquisar', custom_id: 'search_user' },
            { type: 2, style: 2, label: 'Voltar', custom_id: 'back_to_main' }
        ]
    });

    return await interaction.editReply({ components: [container], flags: 32768 });
}

module.exports = interactionHandler;
module.exports.warmVersionCache = async () => {
    try {
        const { data } = await supabase.from('versions').select('*').eq('global_id', 'global').maybeSingle();
        if (data) _versionCache = { data, ts: Date.now() };
    } catch (_) {}
};
