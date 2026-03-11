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

const _recentComponentActions = new Map();
const COMPONENT_DEDUPE_MS = 2000;
function componentFingerprint(interaction) {
    return `${interaction.type}:${interaction.customId || ''}:${interaction.message?.id || ''}:${interaction.user?.id || ''}:${interaction.values?.join(',') || ''}`;
}

async function interactionHandler(interaction) {
    const OWNER_ID = '971163830887514132';
    const isAdmin = !!interaction.member?.permissions?.has?.('Administrator');
    if (!isAdmin && interaction.user?.id !== OWNER_ID) {
        const noPermissionContainer = { type: 17, accent_color: 0xff0000, components: [{ type: 9, components: [{ type: 10, content: `## 🚫 ACESSO NEGADO\n> Apenas administradores podem interagir com o painel.` }], accessory: { type: 11, media: { url: interaction.guild?.iconURL() || 'https://cdn.discordapp.com/embed/avatars/0.png' } } }] };
        if (interaction.isRepliable()) {
            if (interaction.deferred || interaction.replied) return await interaction.followUp({ components: [noPermissionContainer], flags: 32768 });
            else return await interaction.reply({ components: [noPermissionContainer], flags: 32768 });
        }
        return;
    }

    if (interaction.isButton() || interaction.isStringSelectMenu() || interaction.isModalSubmit()) {
        const fp = componentFingerprint(interaction);
        const last = _recentComponentActions.get(fp) || 0;
        if (Date.now() - last < COMPONENT_DEDUPE_MS) return;
        _recentComponentActions.set(fp, Date.now());
    }

    const serverIcon = interaction.guild?.iconURL({ dynamic: true, extension: 'png' }) || 'https://cdn.discordapp.com/embed/avatars/0.png';

    // DEFER LOGIC
    if (!interaction.deferred && !interaction.replied) {
        if (interaction.isModalSubmit()) {
            await interaction.deferUpdate();
        } else if (interaction.isButton() || interaction.isStringSelectMenu()) {
            const cid = interaction.customId || '';
            const val = interaction.values?.[0];
            const trigger = val || cid;
            
            const modalTriggers = ['group_style', 'group_links', 'group_system', 'manage_original_links', 'create_category', 'edit_category_select', 'create_texture', 'texture_manage_select', 'manage_time', 'manage_use_deadline', 'manage_folder', 'manage_profile_global'];
            const isModal = modalTriggers.some(mt => trigger === mt || trigger.startsWith(mt));
            
            if (!isModal) {
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

            if (value === 'group_system') {
                const config = await getVersionCached();
                const modal = new ModalBuilder().setCustomId('modal_group_system').setTitle('Configurações do Sistema');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('app_version_input').setLabel('Versão App').setValue(config?.version || '1.0').setStyle(TextInputStyle.Short)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('sg_version_input').setLabel('Versão SG').setValue(config?.stumble_guys_version || '1.0').setStyle(TextInputStyle.Short)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('sc_version_input').setLabel('Versão SC').setValue(config?.stumble_cups_version || '1.0').setStyle(TextInputStyle.Short)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('folder_input').setLabel('Pasta Alvo').setValue(config?.target_folder_name || 'StumbleCups').setStyle(TextInputStyle.Short)),
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
                        { type: 9, components: [{ type: 10, content: `## GERENCIAR CONTEÚDO\n> Escolha o que deseja gerenciar:\n> **Categorias:** \`${catCount || 0}\` | **Texturas:** \`${texCount || 0}\`` }], accessory: { type: 11, media: { url: serverIcon } } },
                        { type: 14 },
                        { type: 1, components: [
                            { type: 2, style: 2, label: 'Categorias', custom_id: 'manage_categories' },
                            { type: 2, style: 2, label: 'Texturas', custom_id: 'manage_textures' },
                            { type: 2, style: 2, label: 'Voltar', custom_id: 'back_to_main' }
                        ]}
                    ]
                };
                return await interaction.editReply({ components: [container], flags: 32768 });
            }

            if (value === 'group_keys') return await showKeysAndUsersPanel(interaction);

            if (value === 'generate_key') {
                const container = {
                    type: 17, accent_color: 0xc773ff, components: [
                        { type: 12, items: [{ media: { url: 'https://i.imgur.com/YahM0Nf.png' } }] },
                        { type: 9, components: [{ type: 10, content: `## 🔑 GERAR KEY\n> Selecione o tipo de permissão para a nova chave:\n\n### 📝 Tipos Disponíveis:\n> - **Padrão:** Todas as texturas + Encurtador Obrigatório.\n> - **Acesso Total:** Todas as texturas + Download Direto.\n> - **Por Categoria:** Apenas uma categoria + Download Direto.\n> - **Por Textura:** Apenas uma textura + Download Direto.` }], accessory: { type: 11, media: { url: serverIcon } } },
                        { type: 14 },
                        { type: 1, components: [{
                            type: 3, custom_id: 'gen_key_type_select', placeholder: 'Selecione o tipo de acesso...',
                            options: [
                                { label: 'Padrão', value: 'standard', emoji: { name: '🔗' } },
                                { label: 'Acesso Total', value: 'all', emoji: { name: '🌐' } },
                                { label: 'Por Categoria', value: 'category', emoji: { name: '🏷️' } },
                                { label: 'Por Textura', value: 'texture', emoji: { name: '🎨' } }
                            ]
                        }]},
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
        if (interaction.isModalSubmit()) {
            const cid = interaction.customId;
            if (cid === 'modal_group_style') {
                const { data, error } = await supabase.from('versions').upsert({ global_id: 'global', profile_url: interaction.fields.getTextInputValue('profile_url_input'), default_banner_url: interaction.fields.getTextInputValue('default_banner_input') }).select().single();
                if (!error) invalidateVersionCache(data);
                return await interaction.editReply({ components: [{ type: 17, accent_color: 0x00ff88, components: [{ type: 9, components: [{ type: 10, content: `## ✅ ESTILO ATUALIZADO` }], accessory: { type: 11, media: { url: serverIcon } } }] }], flags: 32768 });
            }

            if (cid === 'modal_group_links') {
                const { data, error } = await supabase.from('versions').upsert({ global_id: 'global', discord_url: interaction.fields.getTextInputValue('discord_url_input'), update_url: interaction.fields.getTextInputValue('update_url_input'), key_shortener: interaction.fields.getTextInputValue('key_shortener_input'), download_shortener: interaction.fields.getTextInputValue('dl_shortener_input') }).select().single();
                if (!error) invalidateVersionCache(data);
                return await interaction.editReply({ components: [{ type: 17, accent_color: 0x00ff88, components: [{ type: 9, components: [{ type: 10, content: `## ✅ LINKS ATUALIZADOS` }], accessory: { type: 11, media: { url: serverIcon } } }] }], flags: 32768 });
            }

            if (cid === 'modal_group_system') {
                const rawTime = interaction.fields.getTextInputValue('time_input');
                const parts = rawTime.split('|').map(p => p.trim());
                const { data, error } = await supabase.from('versions').upsert({
                    global_id: 'global', version: interaction.fields.getTextInputValue('app_version_input'), stumble_guys_version: interaction.fields.getTextInputValue('sg_version_input'), stumble_cups_version: interaction.fields.getTextInputValue('sc_version_input'), target_folder_name: interaction.fields.getTextInputValue('folder_input'), default_access_time: parts[0] || '4h', key_use_deadline: parts[1] || '24h'
                }).select().single();
                if (!error) invalidateVersionCache(data);
                return await interaction.editReply({ components: [{ type: 17, accent_color: 0x00ff88, components: [{ type: 9, components: [{ type: 10, content: `## ✅ SISTEMA ATUALIZADO` }], accessory: { type: 11, media: { url: serverIcon } } }] }], flags: 32768 });
            }

            if (cid === 'modal_create_category') {
                await supabase.from('categories').insert({ name: interaction.fields.getTextInputValue('cat_name'), icon_url: interaction.fields.getTextInputValue('cat_icon'), description: interaction.fields.getTextInputValue('cat_desc') });
                return await showCategoriesPanel(interaction);
            }

            if (cid.startsWith('modal_edit_category_')) {
                await supabase.from('categories').update({ name: interaction.fields.getTextInputValue('cat_name'), icon_url: interaction.fields.getTextInputValue('cat_icon'), description: interaction.fields.getTextInputValue('cat_desc') }).eq('id', cid.replace('modal_edit_category_', ''));
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
        }

        // --- SELECTS ---
        if (interaction.isStringSelectMenu()) {
            const cid = interaction.customId;
            if (cid === 'gen_key_type_select') {
                const type = interaction.values[0];
                if (type === 'standard' || type === 'all') {
                    const v = await getVersionCached();
                    const dMs = parseDuration(v?.default_access_time || '4h');
                    const exp = dMs > 0 ? new Date(Date.now() + dMs).toISOString() : null;
                    const key = `BOLT-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
                    await supabase.from('keys').insert({ key, type: type === 'all' ? 'premium' : 'free', expires_at: exp, use_deadline: new Date(Date.now() + parseDuration(v?.key_use_deadline || '24h')).toISOString(), max_uses: 1, current_uses: 0, is_active: true });
                    return await interaction.editReply({ components: [{ type: 17, accent_color: 0x00ff88, components: [{ type: 9, components: [{ type: 10, content: `## ✅ KEY GERADA\n> **Key:** \`${key}\`\n> **Tipo:** \`${type === 'all' ? 'Acesso Total' : 'Padrão'}\`` }], accessory: { type: 11, media: { url: serverIcon } } }] }], flags: 32768 });
                }
                if (type === 'category') {
                    const { data: cats } = await supabase.from('categories').select('*');
                    return await interaction.editReply({ components: [{ type: 17, accent_color: 0xc773ff, components: [{ type: 9, components: [{ type: 10, content: `## 🏷️ SELECIONE A CATEGORIA` }], accessory: { type: 11, media: { url: serverIcon } } }, { type: 1, components: [{ type: 3, custom_id: 'gen_key_category_select', options: (cats || []).map(c => ({ label: c.name, value: c.name })) }] }] }], flags: 32768 });
                }
                if (type === 'texture') {
                    const { data: texs } = await supabase.from('textures').select('*');
                    return await interaction.editReply({ components: [{ type: 17, accent_color: 0xc773ff, components: [{ type: 9, components: [{ type: 10, content: `## 🎨 SELECIONE A TEXTURA` }], accessory: { type: 11, media: { url: serverIcon } } }, { type: 1, components: [{ type: 3, custom_id: 'gen_key_texture_select', options: (texs || []).map(t => ({ label: t.name, value: t.name })) }] }] }], flags: 32768 });
                }
            }

            if (cid === 'gen_key_category_select' || cid === 'gen_key_texture_select') {
                const v = await getVersionCached();
                const key = `BOLT-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
                const data = { key, type: 'premium', expires_at: new Date(Date.now() + parseDuration(v?.default_access_time || '4h')).toISOString(), use_deadline: new Date(Date.now() + parseDuration(v?.key_use_deadline || '24h')).toISOString(), max_uses: 1, current_uses: 0, is_active: true };
                if (cid === 'gen_key_category_select') data.allowed_category = interaction.values[0];
                else data.allowed_texture = interaction.values[0];
                await supabase.from('keys').insert(data);
                return await interaction.editReply({ components: [{ type: 17, accent_color: 0x00ff88, components: [{ type: 9, components: [{ type: 10, content: `## ✅ KEY GERADA\n> **Key:** \`${key}\`` }], accessory: { type: 11, media: { url: serverIcon } } }] }], flags: 32768 });
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
                const container = { type: 17, accent_color: 0xc773ff, components: [
                    { type: 9, components: [{ type: 10, content: `## 🔑 DETALHES DA KEY\n> **Key:** \`${k.key}\`\n> **Expira:** \`${k.expires_at ? new Date(k.expires_at).toLocaleString() : 'Permanente'}\`` }], accessory: { type: 11, media: { url: serverIcon } } },
                    { type: 1, components: [{ type: 2, style: 4, label: 'Excluir', custom_id: `delete_key_${k.id}` }, { type: 2, style: 2, label: 'Voltar', custom_id: 'list_keys' }] }
                ]};
                return await interaction.editReply({ components: [container], flags: 32768 });
            }

            if (cid === 'select_user') {
                const { data: u } = await supabase.from('users').select('*').eq('id', interaction.values[0]).maybeSingle();
                if (!u) return;
                const container = { type: 17, accent_color: 0xc773ff, components: [
                    { type: 9, components: [{ type: 10, content: `## 👤 USUÁRIO\n> **HWID:** \`${u.hwid}\` \n> **Status:** ${u.is_blacklisted ? '🔴 BAN' : '🟢 OK'}` }], accessory: { type: 11, media: { url: serverIcon } } },
                    { type: 1, components: [{ type: 2, style: u.is_blacklisted ? 3 : 4, label: u.is_blacklisted ? 'Desbanir' : 'Banir', custom_id: `toggle_ban_${u.id}` }, { type: 2, style: 2, label: 'Voltar', custom_id: 'manage_users' }] }
                ]};
                return await interaction.editReply({ components: [container], flags: 32768 });
            }
        }

        // --- BUTTONS ---
        if (interaction.isButton()) {
            const cid = interaction.customId;
            if (cid === 'back_to_main' || cid === 'update_panel') {
                const { count: c } = await supabase.from('categories').select('*', { count: 'exact', head: true });
                const { count: t } = await supabase.from('textures').select('*', { count: 'exact', head: true });
                const v = await getVersionCached();
                return await interaction.editReply({ ...createMainPanel(interaction.guild, v?.version, v?.key_shortener, v?.default_access_time, v?.key_use_deadline, v?.target_folder_name, v?.stumble_guys_version, v?.stumble_cups_version, v?.update_url, v?.download_shortener), flags: 32768 });
            }
            if (cid === 'exit_panel') {
                try {
                    await interaction.deleteReply();
                } catch (e) {
                    // Se não puder deletar o original, tenta apenas esconder os botões
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
                return await interaction.editReply({ components: [{ type: 17, accent_color: 0xc773ff, components: [{ type: 9, components: [{ type: 10, content: `## 📝 EDITAR CATEGORIA` }], accessory: { type: 11, media: { url: serverIcon } } }, { type: 1, components: [{ type: 3, custom_id: 'edit_category_select', options: (cats || []).map(c => ({ label: c.name, value: c.id })) }] }, { type: 1, components: [{ type: 2, style: 2, label: 'Voltar', custom_id: 'manage_categories' }] }] }], flags: 32768 });
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
                return await interaction.editReply({ components: [{ type: 17, accent_color: 0xc773ff, components: [{ type: 9, components: [{ type: 10, content: `## 🎨 EDITAR TEXTURA` }], accessory: { type: 11, media: { url: serverIcon } } }, { type: 1, components: [{ type: 3, custom_id: 'texture_manage_select', options: (texs || []).map(t => ({ label: t.name, value: t.id })) }] }, { type: 1, components: [{ type: 2, style: 2, label: 'Voltar', custom_id: 'manage_textures' }] }] }], flags: 32768 });
            }
            if (cid === 'remove_texture_btn') {
                const { data: texs } = await supabase.from('textures').select('*');
                return await interaction.editReply({ components: [{ type: 17, accent_color: 0xff4444, components: [{ type: 9, components: [{ type: 10, content: `## 🗑️ REMOVER TEXTURA` }], accessory: { type: 11, media: { url: serverIcon } } }, { type: 1, components: [{ type: 3, custom_id: 'remove_texture_select', options: (texs || []).map(t => ({ label: t.name, value: t.id })) }] }, { type: 1, components: [{ type: 2, style: 2, label: 'Voltar', custom_id: 'manage_textures' }] }] }], flags: 32768 });
            }
            if (cid === 'remove_category_btn') {
                const { data: cats } = await supabase.from('categories').select('*');
                return await interaction.editReply({ components: [{ type: 17, accent_color: 0xff4444, components: [{ type: 9, components: [{ type: 10, content: `## 🗑️ REMOVER CATEGORIA` }], accessory: { type: 11, media: { url: serverIcon } } }, { type: 1, components: [{ type: 3, custom_id: 'remove_category_select', options: (cats || []).map(c => ({ label: c.name, value: c.id })) }] }, { type: 1, components: [{ type: 2, style: 2, label: 'Voltar', custom_id: 'manage_categories' }] }] }], flags: 32768 });
            }
            if (cid === 'manage_categories') return await showCategoriesPanel(interaction);
            if (cid === 'manage_textures') {
                const { data: textures } = await supabase.from('textures').select('*');
                return await interaction.editReply({ ...createTexturePanel(interaction.guild, textures || []), flags: 32768 });
            }
            if (cid === 'group_content') {
                const { count: catCount } = await supabase.from('categories').select('*', { count: 'exact', head: true });
                const { count: texCount } = await supabase.from('textures').select('*', { count: 'exact', head: true });
                const container = { type: 17, accent_color: 0xc773ff, components: [
                    { type: 12, items: [{ media: { url: 'https://i.imgur.com/YahM0Nf.png' } }] },
                    { type: 9, components: [{ type: 10, content: `## GERENCIAR CONTEÚDO\n> **Categorias:** \`${catCount || 0}\` | **Texturas:** \`${texCount || 0}\`` }] },
                    { type: 14 },
                    { type: 1, components: [{ type: 2, style: 2, label: 'Categorias', custom_id: 'manage_categories' }, { type: 2, style: 2, label: 'Texturas', custom_id: 'manage_textures' }, { type: 2, style: 2, label: 'Voltar', custom_id: 'back_to_main' }] }
                ]};
                return await interaction.editReply({ components: [container], flags: 32768 });
            }
            if (cid === 'group_keys_return' || cid === 'list_keys_back') return await showKeysAndUsersPanel(interaction);
            if (cid.startsWith('toggle_ban_')) {
                const { data: u } = await supabase.from('users').select('*').eq('id', cid.replace('toggle_ban_', '')).single();
                await supabase.from('users').update({ is_blacklisted: !u.is_blacklisted }).eq('id', u.id);
                return await showUsersPanel(interaction);
            }
            if (cid.startsWith('delete_key_')) {
                await supabase.from('keys').delete().eq('id', cid.replace('delete_key_', ''));
                return await showKeysAndUsersPanel(interaction);
            }
        }
    } catch (e) { console.error(e); }
}

async function showCategoriesPanel(interaction) {
    const { data: cats } = await supabase.from('categories').select('*');
    const container = { type: 17, accent_color: 0xc773ff, components: [
        { type: 12, items: [{ media: { url: 'https://i.imgur.com/YahM0Nf.png' } }] },
        { type: 9, components: [{ type: 10, content: `## GESTÃO DE CATEGORIAS\n> **Categorias cadastradas:** \`${cats?.length || 0}\`\n\n${(cats || []).map(c => `• ${c.name}`).join('\n') || '*Nenhuma.*'}` }] },
        { type: 14 },
        { type: 1, components: [{ type: 2, style: 2, label: 'Criar', custom_id: 'create_category' }, { type: 2, style: 2, label: 'Editar', custom_id: 'edit_category_btn' }, { type: 2, style: 2, label: 'Remover', custom_id: 'remove_category_btn' }, { type: 2, style: 2, label: 'Voltar', custom_id: 'group_content' }] }
    ]};
    return await (interaction.deferred || interaction.replied ? interaction.editReply({ components: [container], flags: 32768 }) : interaction.reply({ components: [container], flags: 32768 }));
}

async function showUsersPanel(interaction) {
    const { data: users } = await supabase.from('users').select('*').limit(20);
    const container = { type: 17, accent_color: 0xc773ff, components: [
        { type: 9, components: [{ type: 10, content: `## GESTÃO DE USUÁRIOS` }] },
        { type: 14 },
        { type: 1, components: [{ type: 3, custom_id: 'select_user', options: (users || []).map(u => ({ label: `HWID: ${u.hwid.substring(0,10)}...`, value: u.id })) }] },
        { type: 14 },
        { type: 1, components: [{ type: 2, style: 2, label: 'Voltar', custom_id: 'group_keys_return' }] }
    ]};
    return await (interaction.deferred || interaction.replied ? interaction.editReply({ components: [container], flags: 32768 }) : interaction.reply({ components: [container], flags: 32768 }));
}

async function showKeysList(interaction) {
    const { data: keys } = await supabase.from('keys').select('*').limit(24);
    const used = keys?.filter(k => k.current_uses > 0).length || 0;
    const fresh = keys?.filter(k => k.current_uses === 0).length || 0;
    const container = { type: 17, accent_color: 0xc773ff, components: [
        { type: 9, components: [{ type: 10, content: `## LISTA DE KEYS\n> **Uso:** 🔴 \`${used}\` Usadas | 🟢 \`${fresh}\` Livres` }] },
        { type: 14 },
        { type: 1, components: [{ type: 3, custom_id: 'manage_keys_select', options: (keys || []).map(k => ({ label: k.key, value: k.id, emoji: { name: k.current_uses > 0 ? '🔴' : '🟢' } })) }] },
        { type: 14 },
        { type: 1, components: [{ type: 2, style: 2, label: 'Voltar', custom_id: 'group_keys_return' }] }
    ]};
    return await (interaction.deferred || interaction.replied ? interaction.editReply({ components: [container], flags: 32768 }) : interaction.reply({ components: [container], flags: 32768 }));
}

async function showKeysAndUsersPanel(interaction) {
    const { count: k } = await supabase.from('keys').select('*', { count: 'exact', head: true });
    const { count: b } = await supabase.from('users').select('*', { count: 'exact', head: true }).eq('is_blacklisted', true);
    const container = { type: 17, accent_color: 0xc773ff, components: [
        { type: 12, items: [{ media: { url: 'https://i.imgur.com/YahM0Nf.png' } }] },
        { type: 9, components: [{ type: 10, content: `## KEYS E USUÁRIOS\n> **Keys:** \`${k || 0}\` | **Blacklist:** \`${b || 0}\`` }] },
        { type: 14 },
        { type: 1, components: [{ type: 2, style: 2, label: 'Gerar Key', custom_id: 'generate_key' }, { type: 2, style: 2, label: 'Lista Keys', custom_id: 'list_keys' }, { type: 2, style: 2, label: 'Usuários', custom_id: 'manage_users' }, { type: 2, style: 2, label: 'Voltar', custom_id: 'back_to_main' }] }
    ]};
    return await (interaction.deferred || interaction.replied ? interaction.editReply({ components: [container], flags: 32768 }) : interaction.reply({ components: [container], flags: 32768 }));
}

module.exports = interactionHandler;
module.exports.warmVersionCache = async () => {
    try {
        const { data } = await supabase.from('versions').select('*').eq('global_id', 'global').maybeSingle();
        if (data) _versionCache = { data, ts: Date.now() };
    } catch (_) {}
};
