const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, StringSelectMenuBuilder, MessageFlags } = require('discord.js');
const supabase = require('../../database/supabase');
const { createMainPanel } = require('../components/mainPanel');
const { createTexturePanel } = require('../components/texturePanel');
const crypto = require('crypto');
const { parseDuration, applyDuration } = require('../../utils/durationParser');

// Cache de Version para modais
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

async function interactionHandler(interaction) {
    const OWNER_ID = '971163830887514132';
    const isAdmin = !!interaction.member?.permissions?.has?.('Administrator');
    const serverIcon = interaction.guild?.iconURL({ dynamic: true, extension: 'png' }) || 'https://cdn.discordapp.com/embed/avatars/0.png';

    if (!isAdmin && interaction.user?.id !== OWNER_ID) {
        const noPermissionContainer = {
            type: 17,
            accent_color: 0xff0000,
            components: [
                {
                    type: 9,
                    components: [{ type: 10, content: `## 🚫 ACESSO NEGADO\n> Apenas administradores podem interagir com o painel.` }],
                    accessory: { type: 11, media: { url: serverIcon } }
                }
            ]
        };
        if (interaction.isRepliable()) {
            if (interaction.deferred || interaction.replied) return await interaction.followUp({ components: [noPermissionContainer], flags: 32768 });
            else return await interaction.reply({ components: [noPermissionContainer], flags: 32768 });
        }
        return;
    }

    // DEFER LOGIC
    if (!interaction.deferred && !interaction.replied) {
        if (interaction.isModalSubmit()) {
            await interaction.deferUpdate();
        } else if (interaction.isButton() || interaction.isStringSelectMenu()) {
            const cid = interaction.customId || '';
            const val = interaction.values?.[0] || '';

            const modalTriggers = ['group_style', 'group_links', 'group_version', 'group_system', 'manage_original_links', 'create_category', 'create_texture', 'manage_time', 'manage_use_deadline', 'manage_folder', 'manage_profile_global', 'search_users_btn'];
            let shouldShowModal = modalTriggers.some(mt => cid === mt || cid.startsWith(mt));

            // Casos especiais de Selects que abrem modais dependendo do valor
            if (cid === 'gen_key_type_select' && (val === 'standard' || val === 'all')) shouldShowModal = true;
            if (cid === 'gen_key_category_select' || cid === 'gen_key_texture_select') shouldShowModal = true;
            if (cid === 'edit_category_select' || cid === 'texture_manage_select') shouldShowModal = true;

            // main_select: os valores group_style, group_links, group_version abrem modais diretamente
            if (cid === 'main_select' && ['group_style', 'group_links', 'group_version'].includes(val)) shouldShowModal = true;

            if (!shouldShowModal) {
                try { await interaction.deferUpdate(); } catch (e) { console.error('Defer Error:', e); }
            }
        }
    }

    try {
        let value = (interaction.isStringSelectMenu() && interaction.customId === 'main_select') ? interaction.values[0] : (interaction.isButton() ? interaction.customId : null);

        if (value) {
            if (value === 'group_style') {
                const config = await getVersionCached();
                const modal = new ModalBuilder().setCustomId('modal_group_style').setTitle('Personalização Visual');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('profile_url_input').setLabel('URL Imagem de Perfil (App)').setValue(config?.profile_url || '').setStyle(TextInputStyle.Short).setRequired(false)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('default_banner_input').setLabel('URL Banner Padrão').setValue(config?.default_banner_url || '').setStyle(TextInputStyle.Short).setRequired(false))
                );
                return await interaction.showModal(modal);
            }

            if (value === 'group_links') {
                const config = await getVersionCached();
                const modal = new ModalBuilder().setCustomId('modal_group_links').setTitle('Links e Encurtadores');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('discord_url_input').setLabel('Link Discord').setValue(config?.discord_url || '').setStyle(TextInputStyle.Short).setRequired(false)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('update_url_input').setLabel('Link Atualização').setValue(config?.update_url || '').setStyle(TextInputStyle.Short).setRequired(false)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('key_shortener_input').setLabel('Encurtador KEY').setValue(config?.key_shortener || '').setStyle(TextInputStyle.Short).setRequired(false)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('dl_shortener_input').setLabel('Encurtador DOWNLOAD').setValue(config?.download_shortener || '').setStyle(TextInputStyle.Short).setRequired(false))
                );
                return await interaction.showModal(modal);
            }

            if (value === 'group_version') {
                const config = await getVersionCached();
                const modal = new ModalBuilder().setCustomId('modal_version_update').setTitle('Versão do App');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('app_version_input').setLabel('Nova Versão do App').setValue(config?.version || '1.0').setStyle(TextInputStyle.Short).setRequired(true))
                );
                return await interaction.showModal(modal);
            }

            if (value === 'group_system') return await showSystemPanel(interaction);

            if (value === 'manage_prazos') {
                const config = await getVersionCached();
                const modal = new ModalBuilder().setCustomId('modal_prazos_globais').setTitle('Prazos de Acesso');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('time_input').setLabel('Acesso | Prazo').setValue(`${config?.default_access_time || '4h'} | ${config?.key_use_deadline || '24h'}`).setStyle(TextInputStyle.Short))
                );
                return await interaction.showModal(modal);
            }

            if (value === 'group_content') {
                const { count: catCount } = await supabase.from('categories').select('*', { count: 'exact', head: true });
                const { count: texCount } = await supabase.from('textures').select('*', { count: 'exact', head: true });
                const container = {
                    type: 17, accent_color: 0xc773ff, components: [
                        { type: 12, items: [{ media: { url: 'https://i.imgur.com/YahM0Nf.png' } }] },
                        { type: 10, content: `## GERENCIAR CONTEÚDO\n> Escolha o que deseja gerenciar:\n> **Categorias:** \`${catCount || 0}\` | **Texturas:** \`${texCount || 0}\`` },
                        { type: 14 },
                        {
                            type: 1, components: [
                                { type: 2, style: 2, label: 'Categorias', custom_id: 'manage_categories' },
                                { type: 2, style: 2, label: 'Texturas', custom_id: 'manage_textures' },
                                { type: 2, style: 2, label: 'Voltar', custom_id: 'back_to_main' }
                            ]
                        }
                    ]
                };
                return await interaction.editReply({ components: [container], flags: 32768 });
            }

            if (value === 'group_keys') return await showKeysAndUsersPanel(interaction);

            if (value === 'generate_key') {
                const container = {
                    type: 17, accent_color: 0xc773ff, components: [
                        { type: 12, items: [{ media: { url: 'https://i.imgur.com/YahM0Nf.png' } }] },
                        { type: 10, content: `## 🔑 GERAR KEY\n> Selecione o tipo de permissão para a nova chave:\n\n### 📝 Tipos Disponíveis:\n> - **Padrão:** Todas as texturas + Encurtador Obrigatório.\n> - **Acesso Total:** Todas as texturas + Download Direto.\n> - **Por Categoria:** Apenas uma categoria + Download Direto.\n> - **Por Textura:** Apenas uma textura + Download Direto.` },
                        { type: 14 },
                        {
                            type: 1, components: [{
                                type: 3, custom_id: 'gen_key_type_select', placeholder: 'Selecione o tipo de acesso...',
                                options: [
                                    { label: 'Padrão', value: 'standard', emoji: { name: '🔗' } },
                                    { label: 'Acesso Total', value: 'all', emoji: { name: '🌐' } },
                                    { label: 'Por Categoria', value: 'category', emoji: { name: '🏷️' } },
                                    { label: 'Por Textura', value: 'texture', emoji: { name: '🎨' } }
                                ]
                            }]
                        },
                        { type: 14 },
                        { type: 1, components: [{ type: 2, style: 2, label: 'Voltar', custom_id: 'group_keys_return' }] }
                    ]
                };
                return await interaction.editReply({ components: [container], flags: 32768 });
            }

            if (value === 'list_keys') return await showKeysList(interaction);
            if (value === 'manage_users') return await showUsersPanel(interaction);
            if (value === 'manage_categories') return await showCategoriesPanel(interaction);
            if (value === 'manage_textures') {
                const { data: textures } = await supabase.from('textures').select('*');
                return await interaction.editReply({ ...createTexturePanel(interaction.guild, textures || []), flags: 32768 });
            }
            if (value === 'manage_original_links') {
                const config = await getVersionCached();
                const modal = new ModalBuilder().setCustomId('modal_original_links').setTitle('Arquivos Originais');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('orig_p1').setLabel('P1 (Jogo)').setValue(config?.remove_url_part1 || '').setStyle(TextInputStyle.Short).setRequired(false)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('orig_p2').setLabel('P2 (AppData)').setValue(config?.remove_url_part2 || '').setStyle(TextInputStyle.Short).setRequired(false))
                );
                return await interaction.showModal(modal);
            }
        }

        // --- SUBMITS ---
        if (interaction.isStringSelectMenu()) {
            const cid = interaction.customId;
            if (cid === 'gen_key_type_select') {
                const type = interaction.values[0];
                if (type === 'standard' || type === 'all') {
                    const config = await getVersionCached();
                    const modal = new ModalBuilder().setCustomId(`modal_gen_key_duration_${type}_null`).setTitle('Duração da Key');
                    modal.addComponents(new ActionRowBuilder().addComponents(
                        new TextInputBuilder().setCustomId('duration_input').setLabel('Duração (ex: Permanente, 1h, 24h)').setValue(config?.default_access_time || '4h').setStyle(TextInputStyle.Short).setRequired(true)
                    ));
                    return await interaction.showModal(modal);
                }
                if (type === 'category') {
                    const { data: cats } = await supabase.from('categories').select('*');
                    const container = {
                        type: 17, accent_color: 0xc773ff, components: [
                            { type: 9, components: [{ type: 10, content: `## 🏷️ SELECIONE A CATEGORIA\n> Escolha para qual categoria deseja gerar o acesso premium.` }], accessory: { type: 11, media: { url: serverIcon } } },
                            { type: 14 },
                            { type: 1, components: [{ type: 3, custom_id: 'gen_key_category_select', placeholder: 'Selecione uma categoria...', options: (cats || []).map(c => ({ label: c.name, value: c.name })) }] },
                            { type: 14 },
                            { type: 1, components: [{ type: 2, style: 2, label: 'Voltar', custom_id: 'generate_key' }] }
                        ]
                    };
                    return await interaction.editReply({ components: [container], flags: 32768 });
                }
                if (type === 'texture') {
                    const { data: texs } = await supabase.from('textures').select('*');
                    const container = {
                        type: 17, accent_color: 0xc773ff, components: [
                            { type: 9, components: [{ type: 10, content: `## 🎨 SELECIONE A TEXTURA\n> Escolha para qual textura específica deseja gerar o acesso.` }], accessory: { type: 11, media: { url: serverIcon } } },
                            { type: 14 },
                            { type: 1, components: [{ type: 3, custom_id: 'gen_key_texture_select', placeholder: 'Selecione uma textura...', options: (texs || []).slice(0, 25).map(t => ({ label: t.name, value: t.id })) }] },
                            { type: 14 },
                            { type: 1, components: [{ type: 2, style: 2, label: 'Voltar', custom_id: 'generate_key' }] }
                        ]
                    };
                    return await interaction.editReply({ components: [container], flags: 32768 });
                }
            }

            if (cid === 'gen_key_category_select' || cid === 'gen_key_texture_select') {
                const type = cid === 'gen_key_category_select' ? 'category' : 'texture';
                const item = interaction.values[0];
                const config = await getVersionCached();
                const modal = new ModalBuilder().setCustomId(`modal_gen_key_duration_${type}_${item}`).setTitle('Duração da Key');
                modal.addComponents(new ActionRowBuilder().addComponents(
                    new TextInputBuilder().setCustomId('duration_input').setLabel('Duração (ex: Permanente, 1h, 24h)').setValue(config?.default_access_time || '4h').setStyle(TextInputStyle.Short).setRequired(true)
                ));
                return await interaction.showModal(modal);
            }

            if (cid === 'texture_manage_select') {
                const { data: tex } = await supabase.from('textures').select('*').eq('id', interaction.values[0]).single();
                if (!tex) return;
                const modal = new ModalBuilder().setCustomId(`modal_edit_texture_${tex.id}`).setTitle('Editar Textura');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('tex_name').setLabel('Nome').setValue(tex.name).setStyle(TextInputStyle.Short)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('tex_url').setLabel('Download').setValue(tex.download_url).setStyle(TextInputStyle.Short)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('tex_icon').setLabel('Ícone').setValue(tex.icon_url || '').setStyle(TextInputStyle.Short).setRequired(false)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('tex_cat').setLabel('Categoria').setValue(tex.category).setStyle(TextInputStyle.Short))
                );
                return await interaction.showModal(modal);
            }

            if (cid === 'edit_category_select') {
                const { data: cat } = await supabase.from('categories').select('*').eq('id', interaction.values[0]).single();
                if (!cat) return;
                const modal = new ModalBuilder().setCustomId(`modal_edit_category_${cat.id}`).setTitle('Editar Categoria');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('cat_name').setLabel('Nome').setValue(cat.name).setStyle(TextInputStyle.Short)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('cat_icon').setLabel('Ícone').setValue(cat.icon_url || '').setStyle(TextInputStyle.Short).setRequired(false)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('cat_desc').setLabel('Descrição').setValue(cat.description || '').setStyle(TextInputStyle.Paragraph).setRequired(false))
                );
                return await interaction.showModal(modal);
            }

            if (cid === 'remove_texture_select') {
                await supabase.from('textures').delete().eq('id', interaction.values[0]);
                const { data: textures } = await supabase.from('textures').select('*');
                return await interaction.editReply({ ...createTexturePanel(interaction.guild, textures || []), flags: 32768 });
            }

            if (cid === 'remove_category_select') {
                await supabase.from('categories').delete().eq('id', interaction.values[0]);
                return await showCategoriesPanel(interaction);
            }

            if (cid === 'manage_keys_select') {
                const { data: k } = await supabase.from('keys').select('*').eq('id', interaction.values[0]).maybeSingle();
                if (!k) return;

                const createdAt = k.created_at ? `<t:${Math.floor(new Date(k.created_at).getTime() / 1000)}:R>` : '`N/A`';
                const expiresToUse = k.expires_to_use_at ? `<t:${Math.floor(new Date(k.expires_to_use_at).getTime() / 1000)}:R>` : '`N/A`';
                const expiresAt = k.expires_at ? `<t:${Math.floor(new Date(k.expires_at).getTime() / 1000)}:R>` : (k.duration === 'permanente' ? '`Nunca`' : '`N/A`');

                let details = [
                    `## 🔑 DETALHES DA KEY`,
                    `> **Key:** \`${k.key}\``,
                    `> **Tipo:** \`${k.permissions_type || 'standard'}\` (\`${k.permissions_value || 'all'}\`)`,
                    `> **Duração:** \`${k.duration}\``,
                    `> **Status:** ${k.is_used ? '🔴 Resgatada' : '🟢 Disponível'}`,
                    `> **Gerada por:** <@${k.generated_by}> (\`${k.generated_by || 'N/A'}\`)`,
                    `> **Criada em:** ${createdAt}`,
                    k.is_used ? `> **Expira em:** ${expiresAt}` : `> **Prazo para Resgate:** ${expiresToUse}`,
                    k.generated_ip ? `> **IP do Gerador:** \`${k.generated_ip}\`` : ''
                ].filter(line => line !== '').join('\n');

                // Adicionar campo de HWID se estiver usada
                if (k.is_used && k.used_by) {
                    details = details.replace('> **Expira em:', `> **Usada por (HWID):** \`${k.used_by}\` \n> **Expira em:`);
                }

                const container = {
                    type: 17, accent_color: 0xc773ff, components: [
                        { type: 9, components: [{ type: 10, content: details }], accessory: { type: 11, media: { url: serverIcon } } },
                        { type: 14 },
                        { type: 1, components: [{ type: 2, style: 4, label: 'Excluir', custom_id: `delete_key_${k.id}` }, { type: 2, style: 2, label: 'Voltar', custom_id: 'list_keys' }] }
                    ]
                };
                return await interaction.editReply({ components: [container], flags: 32768 });
            }

            if (cid === 'select_user') {
                return await showUserProfile(interaction, interaction.values[0]);
            }
        }

        // --- BUTTONS ---
        if (interaction.isButton()) {
            const cid = interaction.customId;
            if (cid === 'back_to_main' || cid === 'update_panel') {
                const v = await getVersionCached();
                return await interaction.editReply({ ...createMainPanel(interaction.guild, v?.version, v?.key_shortener, v?.default_access_time, v?.key_use_deadline, v?.target_folder_name, v?.stumble_guys_version, v?.stumble_cups_version, v?.update_url, v?.download_shortener), flags: 32768 });
            }
            if (cid === 'exit_panel') {
                try {
                    await interaction.deleteReply();
                } catch (e) {
                    await interaction.editReply({ components: [], flags: 32768 });
                }
                return;
            }
            if (cid === 'create_category') {
                const modal = new ModalBuilder().setCustomId('modal_create_category').setTitle('Nova Categoria');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('cat_name').setLabel('Nome').setStyle(TextInputStyle.Short)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('cat_icon').setLabel('Ícone').setStyle(TextInputStyle.Short).setRequired(false)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('cat_desc').setLabel('Descrição').setStyle(TextInputStyle.Paragraph).setRequired(false))
                );
                return await interaction.showModal(modal);
            }
            if (cid === 'edit_category_btn') {
                const { data: cats } = await supabase.from('categories').select('*');
                return await interaction.editReply({ components: [{ type: 17, accent_color: 0xc773ff, components: [{ type: 9, components: [{ type: 10, content: `## 📝 EDITAR CATEGORIA\n> Selecione a categoria que deseja modificar.` }], accessory: { type: 11, media: { url: serverIcon } } }, { type: 14 }, { type: 1, components: [{ type: 3, custom_id: 'edit_category_select', placeholder: 'Selecione uma categoria...', options: (cats || []).map(c => ({ label: c.name, value: c.id })) }] }, { type: 14 }, { type: 1, components: [{ type: 2, style: 2, label: 'Voltar', custom_id: 'manage_categories' }] }] }], flags: 32768 });
            }
            if (cid === 'create_texture') {
                const modal = new ModalBuilder().setCustomId('modal_create_texture').setTitle('Nova Textura');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('tex_name').setLabel('Nome').setStyle(TextInputStyle.Short)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('tex_url').setLabel('Download').setStyle(TextInputStyle.Short)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('tex_icon').setLabel('Ícone').setStyle(TextInputStyle.Short).setRequired(false)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('tex_cat').setLabel('Categoria').setStyle(TextInputStyle.Short))
                );
                return await interaction.showModal(modal);
            }
            if (cid === 'edit_texture_btn') {
                const { data: texs } = await supabase.from('textures').select('*');
                return await interaction.editReply({ components: [{ type: 17, accent_color: 0xc773ff, components: [{ type: 9, components: [{ type: 10, content: `## 🎨 EDITAR TEXTURA\n> Selecione a textura que deseja modificar.` }], accessory: { type: 11, media: { url: serverIcon } } }, { type: 14 }, { type: 1, components: [{ type: 3, custom_id: 'texture_manage_select', placeholder: 'Selecione uma textura...', options: (texs || []).slice(0, 25).map(t => ({ label: t.name, value: t.id })) }] }, { type: 14 }, { type: 1, components: [{ type: 2, style: 2, label: 'Voltar', custom_id: 'manage_textures' }] }] }], flags: 32768 });
            }
            if (cid === 'remove_texture_btn') {
                const { data: texs } = await supabase.from('textures').select('*');
                return await interaction.editReply({ components: [{ type: 17, accent_color: 0xff4444, components: [{ type: 9, components: [{ type: 10, content: `## 🗑️ REMOVER TEXTURA\n> Cuidado: Esta ação é irreversível!` }], accessory: { type: 11, media: { url: serverIcon } } }, { type: 14 }, { type: 1, components: [{ type: 3, custom_id: 'remove_texture_select', placeholder: 'Selecione uma textura para excluir...', options: (texs || []).slice(0, 25).map(t => ({ label: t.name, value: t.id })) }] }, { type: 14 }, { type: 1, components: [{ type: 2, style: 2, label: 'Voltar', custom_id: 'manage_textures' }] }] }], flags: 32768 });
            }
            if (cid === 'remove_category_btn') {
                const { data: cats } = await supabase.from('categories').select('*');
                return await interaction.editReply({ components: [{ type: 17, accent_color: 0xff4444, components: [{ type: 9, components: [{ type: 10, content: `## 🗑️ REMOVER CATEGORIA\n> Cuidado: Remover uma categoria não apaga as texturas dela, mas elas ficarão sem categoria vinculada.` }], accessory: { type: 11, media: { url: serverIcon } } }, { type: 14 }, { type: 1, components: [{ type: 3, custom_id: 'remove_category_select', placeholder: 'Selecione uma categoria para excluir...', options: (cats || []).map(c => ({ label: c.name, value: c.id })) }] }, { type: 14 }, { type: 1, components: [{ type: 2, style: 2, label: 'Voltar', custom_id: 'manage_categories' }] }] }], flags: 32768 });
            }
            if (cid === 'search_users_btn') {
                const modal = new ModalBuilder().setCustomId('modal_search_users').setTitle('Pesquisar Usuário');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('search_query')
                            .setLabel('ID, Tag, HWID ou IP')
                            .setPlaceholder('Ex: 971163..., bolt, 04ffa..., 127.0...')
                            .setStyle(TextInputStyle.Short)
                            .setRequired(true)
                    )
                );
                return await interaction.showModal(modal);
            }
            if (cid === 'manage_categories') return await showCategoriesPanel(interaction);
            if (cid === 'manage_textures') {
                const { data: textures } = await supabase.from('textures').select('*');
                return await interaction.editReply({ ...createTexturePanel(interaction.guild, textures || []), flags: 32768 });
            }
            if (cid === 'group_content') {
                const { count: catCount } = await supabase.from('categories').select('*', { count: 'exact', head: true });
                const { count: texCount } = await supabase.from('textures').select('*', { count: 'exact', head: true });
                const container = {
                    type: 17, accent_color: 0xc773ff, components: [
                        { type: 12, items: [{ media: { url: 'https://i.imgur.com/YahM0Nf.png' } }] },
                        { type: 10, content: `## GERENCIAR CONTEÚDO\n> **Categorias:** \`${catCount || 0}\` | **Texturas:** \`${texCount || 0}\`` },
                        { type: 14 },
                        { type: 1, components: [{ type: 2, style: 2, label: 'Categorias', custom_id: 'manage_categories' }, { type: 2, style: 2, label: 'Texturas', custom_id: 'manage_textures' }, { type: 2, style: 2, label: 'Voltar', custom_id: 'back_to_main' }] }
                    ]
                };
                return await interaction.editReply({ components: [container], flags: 32768 });
            }
            if (cid === 'group_keys_return' || cid === 'list_keys_back') return await showKeysAndUsersPanel(interaction);
            if (cid.startsWith('toggle_ban_')) {
                const userId = cid.replace('toggle_ban_', '');
                const { data: u } = await supabase.from('users').select('*').eq('id', userId).single();
                if (!u) return;
                await supabase.from('users').update({ is_blacklisted: !u.is_blacklisted }).eq('id', u.id);
                // Em vez de voltar pra lista, mostra o perfil atualizado
                return await showUserProfile(interaction, userId);
            }
            if (cid === 'config_category_select') {
                const catId = interaction.values[0];
                const { data: cat } = await supabase.from('categories').select('*').eq('id', catId).single();
                if (!cat) return;

                const modal = new ModalBuilder().setCustomId(`modal_config_cat_${cat.id}`).setTitle(`Config: ${cat.name}`);
                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('cat_version').setLabel('Versão').setValue(cat.version || '1.0').setStyle(TextInputStyle.Short)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('cat_folder').setLabel('Pasta Alvo').setValue(cat.target_folder || 'StumbleCups').setStyle(TextInputStyle.Short)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('cat_style').setLabel('Estilo (stumble ou cups)').setValue(cat.install_style || 'cups').setStyle(TextInputStyle.Short))
                );
                return await interaction.showModal(modal);
            }

            if (cid.startsWith('delete_key_')) {
                await supabase.from('keys').delete().eq('id', cid.replace('delete_key_', ''));
                return await showKeysAndUsersPanel(interaction);
            }

            if (cid.startsWith('confirm_version_update_')) {
                const newVersion = cid.replace('confirm_version_update_', '');
                const validationId = crypto.randomUUID ? crypto.randomUUID() : require('crypto').randomUUID();

                const { data, error } = await supabase.from('versions').update({
                    version: newVersion,
                    validation_id: validationId
                }).eq('global_id', 'global').select().single();

                if (error) return await interaction.editReply({ content: '❌ Erro ao salvar no banco de dados.', components: [], flags: 64 | 32768 });
                invalidateVersionCache(data);

                const container = {
                    type: 17, accent_color: 0x00ff88, components: [{
                        type: 9, components: [{ type: 10, content: `## ✅ VERSÃO ATUALIZADA\n> **Nova Versão:** \`${newVersion}\`\n> **Novo ID Secreto:** Cole no código do App antes do build!\n\`\`\`\n${validationId}\n\`\`\`\n> -# Guarde este ID! Ele é necessário para o próximo build.` }],
                        accessory: { type: 11, media: { url: serverIcon } }
                    }]
                };
                return await interaction.editReply({ components: [container], flags: 64 | 32768 });
            }

            if (cid === 'cancel_version_update') {
                const container = {
                    type: 17, accent_color: 0xff4444, components: [{
                        type: 9, components: [{ type: 10, content: `## ❌ ATUALIZAÇÃO CANCELADA\n> A versão do aplicativo não foi alterada.\n> O ID de validação permanece o mesmo.` }],
                        accessory: { type: 11, media: { url: serverIcon } }
                    }]
                };
                return await interaction.editReply({ components: [container], flags: 64 | 32768 });
            }
        }

        // --- SUBMIT DE MODAIS ---
        if (interaction.isModalSubmit()) {
            const cid = interaction.customId;

            if (cid === 'modal_search_users') {
                const query = interaction.fields.getTextInputValue('search_query');
                return await showSearchResults(interaction, query);
            }

            if (cid.startsWith('modal_gen_key_duration_')) {
                const parts = cid.split('_');
                const type = parts[4]; // standard, all, category, texture
                const item = parts[5]; // null, catName, or texID
                const duration = interaction.fields.getTextInputValue('duration_input');

                const config = await getVersionCached();
                const key = `BOLT-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;

                const useDeadline = config?.key_use_deadline || '1m';
                let expiresToUseAt = applyDuration(new Date(), useDeadline);

                const data = {
                    key,
                    duration: duration,
                    is_used: false,
                    permissions_type: type === 'standard' ? 'standard' : 'premium',
                    permissions_value: item !== 'null' ? item : 'all',
                    generated_by: interaction.user.id,
                    generated_by_tag: interaction.user.tag,
                    expires_to_use_at: expiresToUseAt.toISOString(),
                    generated_ip: null // No Discord interaction, IP is null or tracker not available directly
                };

                if (type === 'texture') {
                    const { data: tex } = await supabase.from('textures').select('name').eq('id', item).maybeSingle();
                    data.permissions_value = tex?.name || item;
                }

                const { error } = await supabase.from('keys').insert(data);
                if (error) throw error;

                const successContainer = {
                    type: 17, accent_color: 0x00ff88, components: [{
                        type: 9, components: [{ type: 10, content: `## ✅ KEY GERADA\n> **Key:** \`${key}\` \n> **Duração:** \`${duration}\` \n> **Tipo:** \`${type}\`${item !== 'null' ? `\n> **Alvo:** \`${data.permissions_value}\`` : ''}` }],
                        accessory: { type: 11, media: { url: serverIcon } }
                    }]
                };
                await interaction.followUp({ components: [successContainer], flags: 64 | 32768 });
                return await showKeysAndUsersPanel(interaction);
            }

            if (cid === 'modal_group_style') {
                const profileUrl = interaction.fields.getTextInputValue('profile_url_input');
                const bannerUrl = interaction.fields.getTextInputValue('default_banner_input');
                const { data, error } = await supabase.from('versions').update({ profile_url: profileUrl, default_banner_url: bannerUrl }).eq('global_id', 'global').select().single();
                
                if (error) {
                    console.error('Erro ao salvar estilo:', error);
                    return await interaction.followUp({ content: '❌ Erro ao salvar no banco de dados.', flags: 64 | 32768 });
                }

                invalidateVersionCache(data);
                return await interaction.followUp({
                    components: [{ type: 17, accent_color: 0x00ff88, components: [{ type: 9, components: [{ type: 10, content: `## ✅ ESTILO ATUALIZADO\n> **Foto de Perfil (App):** ${profileUrl ? `[ver link](${profileUrl})` : '`Não alterada`'}\n> **Banner Padrão:** ${bannerUrl ? `[ver link](${bannerUrl})` : '`Não alterado`'}\n> -# As mudanças aparecem no App após o próximo login.` }], accessory: { type: 11, media: { url: serverIcon } } }] }],
                    flags: 64 | 32768
                });
            }
            if (cid === 'modal_group_links') {
                const discordUrl = interaction.fields.getTextInputValue('discord_url_input');
                const updateUrl = interaction.fields.getTextInputValue('update_url_input');
                const keySh = interaction.fields.getTextInputValue('key_shortener_input');
                const dlSh = interaction.fields.getTextInputValue('dl_shortener_input');
                const { data, error } = await supabase.from('versions').update({ discord_url: discordUrl, update_url: updateUrl, key_shortener: keySh, download_shortener: dlSh }).eq('global_id', 'global').select().single();
                
                if (error) {
                    console.error('Erro ao salvar links:', error);
                    return await interaction.followUp({ content: '❌ Erro ao salvar no banco de dados.', flags: 64 | 32768 });
                }

                invalidateVersionCache(data);
                return await interaction.followUp({
                    components: [{ type: 17, accent_color: 0x00ff88, components: [{ type: 9, components: [{ type: 10, content: `## ✅ LINKS ATUALIZADOS\n> **Discord:** ${discordUrl ? `[ver link](${discordUrl})` : '`—`'}\n> **Atualização:** ${updateUrl ? `[ver link](${updateUrl})` : '`—`'}\n> **Encurtador KEY:** ${keySh ? `\`${keySh}\`` : '`—`'}\n> **Encurtador Download:** ${dlSh ? `\`${dlSh}\`` : '`—`'}\n> -# Os links são aplicados imediatamente no App.` }], accessory: { type: 11, media: { url: serverIcon } } }] }],
                    flags: 64 | 32768
                });
            }
            if (cid === 'modal_prazos_globais') {
                const rawTime = interaction.fields.getTextInputValue('time_input');
                const [at, ud] = rawTime.split('|').map(p => p.trim());

                const { data, error } = await supabase.from('versions').update({
                    default_access_time: at || '4h',
                    key_use_deadline: ud || '24h'
                }).eq('global_id', 'global').select().single();
                
                if (error) return await interaction.followUp({ content: '❌ Erro ao salvar no banco.', flags: 64 | 32768 });
                invalidateVersionCache(data);
                return await interaction.followUp({ content: '✅ Prazos globais atualizados.', flags: 64 | 32768 });
            }

            if (cid.startsWith('modal_config_cat_')) {
                const catId = cid.replace('modal_config_cat_', '');
                const { error } = await supabase.from('categories').update({
                    version: interaction.fields.getTextInputValue('cat_version'),
                    target_folder: interaction.fields.getTextInputValue('cat_folder'),
                    install_style: interaction.fields.getTextInputValue('cat_style')
                }).eq('id', catId);

                if (error) return await interaction.followUp({ content: '❌ Erro ao salvar categoria.', flags: 64 | 32768 });
                return await interaction.followUp({ content: '✅ Configurações da categoria atualizadas.', flags: 64 | 32768 });
            }

            if (cid === 'modal_version_update') {
                const newVersion = interaction.fields.getTextInputValue('app_version_input');
                const container = {
                    type: 17, accent_color: 0xffaa00, components: [
                        { 
                            type: 9, 
                            components: [{ type: 10, content: `## ⚠️ CUIDADO: ALTERAR VERSÃO\n> Você está prestes a mudar a versão para: \`${newVersion}\`\n\n### 🛑 IMPACTO IMEDIATO:\n> 1. Um novo **ID de Validação** será gerado.\n> 2. O aplicativo atual de todos os usuários **parará de funcionar**.\n> 3. Você precisará buildar o App novamente com o novo ID.\n\n**Deseja prosseguir com a alteração?**` }],
                            accessory: { type: 11, media: { url: serverIcon } } 
                        },
                        { type: 14 },
                        {
                            type: 1, components: [
                                { type: 2, style: 4, label: 'Confirmar Alteração', custom_id: `confirm_version_update_${newVersion}` },
                                { type: 2, style: 2, label: 'Recusar', custom_id: 'cancel_version_update' }
                            ]
                        }
                    ]
                };
                return await interaction.followUp({ components: [container], flags: 64 | 32768 });
            }
            if (cid === 'modal_create_category') {
                await supabase.from('categories').insert({ 
                    name: interaction.fields.getTextInputValue('cat_name'), 
                    icon_url: interaction.fields.getTextInputValue('cat_icon'), 
                    description: interaction.fields.getTextInputValue('cat_desc'),
                    version: '1.0',
                    target_folder: 'StumbleCups',
                    install_style: 'cups'
                });
                return await showCategoriesPanel(interaction);
            }
            if (cid.startsWith('modal_edit_category_')) {
                await supabase.from('categories').update({ 
                    name: interaction.fields.getTextInputValue('cat_name'), 
                    icon_url: interaction.fields.getTextInputValue('cat_icon'), 
                    description: interaction.fields.getTextInputValue('cat_desc') 
                }).eq('id', cid.replace('modal_edit_category_', ''));
                return await showCategoriesPanel(interaction);
            }
            if (cid === 'modal_create_texture') {
                await supabase.from('textures').insert({ name: interaction.fields.getTextInputValue('tex_name'), download_url: interaction.fields.getTextInputValue('tex_url'), icon_url: interaction.fields.getTextInputValue('tex_icon'), category: interaction.fields.getTextInputValue('tex_cat') });
                const { data: textures } = await supabase.from('textures').select('*');
                return await interaction.editReply({ ...createTexturePanel(interaction.guild, textures || []), flags: 32768 });
            }
            if (cid.startsWith('modal_edit_texture_')) {
                await supabase.from('textures').update({ name: interaction.fields.getTextInputValue('tex_name'), download_url: interaction.fields.getTextInputValue('tex_url'), icon_url: interaction.fields.getTextInputValue('tex_icon'), category: interaction.fields.getTextInputValue('tex_cat') }).eq('id', cid.replace('modal_edit_texture_', ''));
                const { data: textures } = await supabase.from('textures').select('*');
                return await interaction.editReply({ ...createTexturePanel(interaction.guild, textures || []), flags: 32768 });
            }
            if (cid === 'modal_original_links') {
                const { data, error } = await supabase.from('versions').update({ 
                    remove_url_part1: interaction.fields.getTextInputValue('orig_p1'), 
                    remove_url_part2: interaction.fields.getTextInputValue('orig_p2') 
                }).eq('global_id', 'global').select().single();
                
                if (!error) invalidateVersionCache(data);
                return await interaction.editReply({ 
                    components: [{ type: 17, accent_color: 0x00ff88, components: [{ type: 9, components: [{ type: 10, content: `## ✅ ARQUIVOS ATUALIZADOS\n> Arquivos base para remoção foram atualizados.` }], accessory: { type: 11, media: { url: serverIcon } } }] }], 
                    flags: 32768 
                });
            }
        }
    } catch (e) {
        console.error('Interaction Error:', e);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: '❌ Ocorreu um erro ao processar sua solicitação.', flags: 64 | 32768 }).catch(() => { });
        } else {
            await interaction.followUp({ content: '❌ Ocorreu um erro ao completar a ação.', flags: 64 | 32768 }).catch(() => { });
        }
    }
}

async function showCategoriesPanel(interaction) {
    const { data: cats } = await supabase.from('categories').select('*');
    const container = {
        type: 17, accent_color: 0xc773ff, components: [
            { type: 12, items: [{ media: { url: 'https://i.imgur.com/YahM0Nf.png' } }] },
            { type: 10, content: `## GESTÃO DE CATEGORIAS\n> **Categorias cadastradas:** \`${cats?.length || 0}\`\n\n${(cats || []).map(c => `• ${c.name}`).join('\n') || '*Nenhuma.*'}` },
            { type: 14 },
            { type: 1, components: [{ type: 2, style: 2, label: 'Criar', custom_id: 'create_category' }, { type: 2, style: 2, label: 'Editar', custom_id: 'edit_category_btn' }, { type: 2, style: 2, label: 'Remover', custom_id: 'remove_category_btn' }, { type: 2, style: 2, label: 'Voltar', custom_id: 'group_content' }] }
        ]
    };
    return await (interaction.deferred || interaction.replied ? interaction.editReply({ components: [container], flags: 32768 }) : interaction.reply({ components: [container], flags: 32768 }));
}

async function showUsersPanel(interaction) {
    const { data: users } = await supabase.from('users').select('*').order('updated_at', { ascending: false }).limit(20);
    const serverIcon = interaction.guild?.iconURL({ dynamic: true, extension: 'png' }) || 'https://cdn.discordapp.com/embed/avatars/0.png';
    const container = {
        type: 17, accent_color: 0xc773ff, components: [
            { type: 9, components: [{ type: 10, content: `## 👤 GESTÃO DE USUÁRIOS\n> Visualize e gerencie os usuários vinculados ao sistema.` }], accessory: { type: 11, media: { url: serverIcon } } },
            { type: 14 },
            { type: 1, components: [{ type: 3, custom_id: 'select_user', placeholder: 'Selecione um usuário para gerenciar...', options: (users || []).map(u => ({ label: `${u.discord_tag || 'Unknown'} (HWID: ${u.hwid.substring(0, 6)}...)`, value: u.id })) }] },
            { type: 14 },
            {
                type: 1, components: [
                    { type: 2, style: 2, label: 'Pesquisar', custom_id: 'search_users_btn' },
                    { type: 2, style: 2, label: 'Voltar', custom_id: 'group_keys_return' }
                ]
            }
        ]
    };
    return await (interaction.deferred || interaction.replied ? interaction.editReply({ components: [container], flags: 32768 }) : interaction.reply({ components: [container], flags: 32768 }));
}

async function showSystemPanel(interaction) {
    const { data: cats } = await supabase.from('categories').select('*').order('name');
    const serverIcon = interaction.guild?.iconURL({ dynamic: true, extension: 'png' }) || 'https://cdn.discordapp.com/embed/avatars/0.png';

    const container = {
        type: 17, accent_color: 0xc773ff, components: [
            { type: 12, items: [{ media: { url: 'https://i.imgur.com/YahM0Nf.png' } }] },
            { type: 9, components: [{ type: 10, content: `## ⚙️ PRAZOS E PASTAS\n> Gerencie os prazos globais de keys ou configure pastas e versões específicas para cada categoria.` }], accessory: { type: 11, media: { url: serverIcon } } },
            { type: 14 },
            { type: 1, components: [{ type: 3, custom_id: 'config_category_select', placeholder: 'Selecione uma categoria para configurar...', options: (cats || []).map(c => ({ label: `Configurar: ${c.name}`, value: c.id, description: `Versão: ${c.version || '1.0'} | Pasta: ${c.target_folder || '—'}` })) }] },
            { type: 14 },
            {
                type: 1, components: [
                    { type: 2, style: 2, label: 'Editar Prazos Globais', custom_id: 'manage_prazos' },
                    { type: 2, style: 2, label: 'Voltar', custom_id: 'back_to_main' }
                ]
            }
        ]
    };
    return await (interaction.deferred || interaction.replied ? interaction.editReply({ components: [container], flags: 32768 }) : interaction.reply({ components: [container], flags: 32768 }));
}

async function showUserProfile(interaction, userId) {
    const { data: u } = await supabase.from('users').select('*').eq('id', userId).maybeSingle();
    if (!u) return;

    const serverIcon = interaction.guild?.iconURL({ dynamic: true, extension: 'png' }) || 'https://cdn.discordapp.com/embed/avatars/0.png';

    // Contagens e histórico paralelos
    const [genRes, usedRes, lastGenRes, lastUsedRes] = await Promise.all([
        supabase.from('keys').select('*', { count: 'exact', head: true }).eq('generated_by', u.discord_id),
        supabase.from('keys').select('*', { count: 'exact', head: true }).eq('used_by', u.hwid),
        supabase.from('keys').select('*').eq('generated_by', u.discord_id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('keys').select('*').eq('used_by', u.hwid).order('updated_at', { ascending: false }).limit(1).maybeSingle()
    ]);

    let inServer = '❓ Desconhecido';
    let userAvatar = serverIcon;
    try {
        const member = await interaction.guild.members.fetch(u.discord_id).catch(() => null);
        if (member) {
            inServer = '✅ Sim';
            userAvatar = member.user.displayAvatarURL({ extension: 'png' });
        } else {
            inServer = '❌ Não';
        }
    } catch (e) { }

    const userDetails = [
        `## 👤 DETALHES DO USUÁRIO`,
        `> **Usuário:** <@${u.discord_id}> (\`${u.discord_id || 'N/A'}\`)`,
        `> **HWID:** \`${u.hwid}\``,
        `> **Último IP:** \`${u.last_ip || 'N/A'}\``,
        `> **Status:** ${u.is_blacklisted ? '🔴 BANIDO' : '🟢 ATIVO'}`,
        `> **No Servidor:** ${inServer}`,
        `\n### 📊 Estatísticas`,
        `> **Keys Geradas:** \`${genRes.count || 0}\``,
        `> **Keys Usadas:** \`${usedRes.count || 0}\``,
        `> **Última Key Gerada:** \`${lastGenRes.data?.key || 'Nenhuma'}\``,
        `> **Última Key Usada:** \`${u.last_key_used || lastUsedRes.data?.key || 'Nenhuma'}\``
    ].join('\n');

    const container = {
        type: 17, accent_color: u.is_blacklisted ? 0xff4444 : 0xc773ff, components: [
            { type: 9, components: [{ type: 10, content: userDetails }], accessory: { type: 11, media: { url: userAvatar } } },
            { type: 14 },
            {
                type: 1, components: [
                    { type: 2, style: u.is_blacklisted ? 3 : 4, label: u.is_blacklisted ? 'Desbanir' : 'Banir', custom_id: `toggle_ban_${u.id}` },
                    { type: 2, style: 2, label: 'Voltar', custom_id: 'manage_users' }
                ]
            }
        ]
    };
    return await interaction.editReply({ components: [container], flags: 32768 });
}

async function showSearchResults(interaction, searchTerm) {
    // Busca inteligente
    const { data: users, error } = await supabase
        .from('users')
        .select('*')
        .or(`discord_id.eq.${searchTerm},discord_id.ilike.%${searchTerm}%,discord_tag.ilike.%${searchTerm}%,hwid.ilike.%${searchTerm}%,last_ip.ilike.%${searchTerm}%`)
        .limit(25);

    const serverIcon = interaction.guild?.iconURL({ dynamic: true, extension: 'png' }) || 'https://cdn.discordapp.com/embed/avatars/0.png';

    if (error || !users || users.length === 0) {
        const errorContainer = {
            type: 17, accent_color: 0xff4444, components: [
                { type: 9, components: [{ type: 10, content: `## 🔍 SEM RESULTADOS\n> Não encontrei nenhum usuário com o termo: \`${searchTerm}\`` }], accessory: { type: 11, media: { url: serverIcon } } },
                { type: 14 },
                { type: 1, components: [{ type: 2, style: 2, label: 'Voltar', custom_id: 'manage_users' }] }
            ]
        };
        return await interaction.editReply({ components: [errorContainer], flags: 32768 });
    }

    const container = {
        type: 17, accent_color: 0xc773ff, components: [
            { type: 9, components: [{ type: 10, content: `## 🔍 RESULTADOS DA PESQUISA\n> Encontrados: \`${users.length}\` usuário(s) para \`${searchTerm}\`` }], accessory: { type: 11, media: { url: serverIcon } } },
            { type: 14 },
            { type: 1, components: [{ type: 3, custom_id: 'select_user', placeholder: 'Selecione o resultado...', options: users.map(u => ({ label: `${u.discord_tag || 'Unknown'} (HWID: ${u.hwid.substring(0, 6)}...)`, value: u.id })) }] },
            { type: 14 },
            { type: 1, components: [{ type: 2, style: 2, label: 'Voltar', custom_id: 'manage_users' }] }
        ]
    };
    return await interaction.editReply({ components: [container], flags: 32768 });
}

async function showKeysList(interaction) {
    const { data: keys } = await supabase.from('keys').select('*').order('created_at', { ascending: false }).limit(24);
    const used = keys?.filter(k => k.is_used).length || 0;
    const fresh = keys?.filter(k => !k.is_used).length || 0;
    const serverIcon = interaction.guild?.iconURL({ dynamic: true, extension: 'png' }) || 'https://cdn.discordapp.com/embed/avatars/0.png';
    const container = {
        type: 17, accent_color: 0xc773ff, components: [
            { type: 9, components: [{ type: 10, content: `## 📋 LISTA DE KEYS\n> **Uso:** 🔴 \`${used}\` Usadas | 🟢 \`${fresh}\` Livres\n> Selecione uma key para ver detalhes completos.` }], accessory: { type: 11, media: { url: serverIcon } } },
            { type: 14 },
            { type: 1, components: [{ type: 3, custom_id: 'manage_keys_select', placeholder: 'Selecione uma key...', options: (keys || []).map(k => ({ label: k.key, value: k.id, emoji: { name: k.is_used ? '🔴' : '🟢' } })) }] },
            { type: 14 },
            { type: 1, components: [{ type: 2, style: 2, label: 'Voltar', custom_id: 'group_keys_return' }] }
        ]
    };
    return await (interaction.deferred || interaction.replied ? interaction.editReply({ components: [container], flags: 32768 }) : interaction.reply({ components: [container], flags: 32768 }));
}

async function showKeysAndUsersPanel(interaction) {
    const { count: k } = await supabase.from('keys').select('*', { count: 'exact', head: true });
    const { count: b } = await supabase.from('users').select('*', { count: 'exact', head: true }).eq('is_blacklisted', true);
    const container = {
        type: 17, accent_color: 0xc773ff, components: [
            { type: 12, items: [{ media: { url: 'https://i.imgur.com/YahM0Nf.png' } }] },
            { type: 10, content: `## KEYS E USUÁRIOS\n> **Keys:** \`${k || 0}\` | **Blacklist:** \`${b || 0}\`` },
            { type: 14 },
            { type: 1, components: [{ type: 2, style: 2, label: 'Gerar Key', custom_id: 'generate_key' }, { type: 2, style: 2, label: 'Lista Keys', custom_id: 'list_keys' }, { type: 2, style: 2, label: 'Usuários', custom_id: 'manage_users' }, { type: 2, style: 2, label: 'Voltar', custom_id: 'back_to_main' }] }
        ]
    };
    return await (interaction.deferred || interaction.replied ? interaction.editReply({ components: [container], flags: 32768 }) : interaction.reply({ components: [container], flags: 32768 }));
}

module.exports = interactionHandler;
module.exports.warmVersionCache = async () => {
    try {
        const { data } = await supabase.from('versions').select('*').eq('global_id', 'global').maybeSingle();
        if (data) _versionCache = { data, ts: Date.now() };
    } catch (_) { }
};
