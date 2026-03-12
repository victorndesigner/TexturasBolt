const { REST, Routes, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const crypto = require('crypto');
const supabase = require('../../database/supabase');

// Handler /setup_keys e /keys
async function setupKeysPanel(interaction) {
    const OWNER_ID = '971163830887514132';
    const isAdmin = !!interaction.member?.permissions.has('Administrator');
    
    const serverIcon = interaction.guild?.iconURL({ dynamic: true, extension: 'png' }) || 'https://i.imgur.com/bLKgTww.png';

    if (!isAdmin && interaction.user.id !== OWNER_ID) {
        const { data: config } = await supabase.from('versions').select('key_shortener', 'update_url').eq('global_id', 'global').maybeSingle();
        const publicLink = config?.key_shortener || 'https://linkvertise.com/4171462/Phfl89HIrpV5?o=sharing';

        const noPermissionContainer = {
            type: 17,
            accent_color: 0xff0044, // Vermelho
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

    await interaction.deferReply({ flags: 64 });

    const messagePayload = {
        flags: MessageFlags.IsComponentsV2,
        components: [
            {
                type: 17, // CONTAINER
                accent_color: 0xc773ff, // BOT_COLOR
                components: [
                    {
                        type: 9, // SECTION
                        components: [
                            {
                                type: 10, // TEXT DISPLAY
                                content: `## 🔑 Key Textura [v1.0]\n> Para continuar, clique no botão abaixo e gere seu acesso às texturas.\n> -# Esse processo é necessário para a chave de acesso ao sistema.`,
                            }
                        ],
                        accessory: { type: 11, media: { url: serverIcon } }
                    },
                    { type: 14 }, // SEPARATOR
                    {
                        type: 1, // ACTION ROW
                        components: [
                            {
                                type: 2, // BUTTON
                                style: 2, // SECONDARY (Cinza)
                                label: 'Gerar Key',
                                custom_id: 'public_gen_key'
                            }
                        ]
                    }
                ]
            }
        ]
    };

    try {
        await interaction.client.rest.post(Routes.channelMessages(interaction.channelId), { body: messagePayload });
        const confirmContainer = {
            type: 17,
            accent_color: 0x00ff88,
            components: [{
                type: 9,
                components: [{ type: 10, content: `## ✅ Painel de Key criado.\n> O painel foi configurado neste canal com sucesso.` }],
                accessory: { type: 11, media: { url: serverIcon } }
            }]
        };
        return interaction.editReply({ components: [confirmContainer], flags: 64 | MessageFlags.IsComponentsV2 });
    } catch (err) {
        console.error('Erro ao enviar V2:', err);
        const errorContainer = {
            type: 17,
            accent_color: 0xff0044,
            components: [{
                type: 9,
                components: [{ type: 10, content: `## ❌ ERRO DE CONFIGURAÇÃO\n> Não foi possível criar o painel. Verifique minhas permissões no canal ou suporte a V2.` }],
                accessory: { type: 11, media: { url: serverIcon } }
            }]
        };
        return interaction.editReply({ components: [errorContainer], flags: 64 | MessageFlags.IsComponentsV2 });
    }
}

// Handler Botão Gerar Key
async function handleKeyGeneration(interaction) {
    await interaction.deferReply({ flags: 64 });

    // Verificação Mobile
    const presence = interaction.member?.presence;
    const isMobile = presence?.clientStatus?.mobile;
    const isDesktop = presence?.clientStatus?.desktop;

    const serverIcon = interaction.guild?.iconURL({ dynamic: true, extension: 'png' }) || 'https://i.imgur.com/bLKgTww.png';

    if (isMobile && !isDesktop) {
        const mobileContainer = {
            type: 17,
            accent_color: 0xffaa00, // Laranja
            components: [{
                type: 9,
                components: [{ type: 10, content: `## 📱 ACESSO MOBILE\n> Utilize nosso site oficial para baixar texturas no celular.\n> O bot no Discord é otimizado para Desktop.` }],
                accessory: { type: 11, media: { url: serverIcon } }
            }]
        };
        return interaction.editReply({
            components: [mobileContainer],
            flags: 64 | MessageFlags.IsComponentsV2
        });
    }

    try {
        // ANTI-BYPASS: Invalida solicitações anteriores do mesmo usuário
        await supabase.from('key_requests').delete().eq('user_id', interaction.user.id);

        const token = crypto.randomBytes(16).toString('hex');

        const { error: requestError } = await supabase.from('key_requests').insert({
            token: token,
            user_id: interaction.user.id,
            user_tag: interaction.user.tag
        });

        if (requestError) {
            console.error('Erro ao salvar KeyRequest:', requestError);
            const errorContainer = {
                type: 17,
                accent_color: 0xff0044,
                components: [{
                    type: 9,
                    components: [{ type: 10, content: `## ❌ ERRO NA SOLICITAÇÃO\n> Ocorreu um problema ao processar sua key. Tente novamente em instantes.` }],
                    accessory: { type: 11, media: { url: serverIcon } }
                }]
            };
            return interaction.editReply({ components: [errorContainer], flags: 64 | MessageFlags.IsComponentsV2 });
        }

        const { data: config } = await supabase.from('versions').select('*').eq('global_id', 'global').maybeSingle();
        // Prioritiza o link do Linkvertise fornecido pelo usuário
        let shortenerBase = (config?.key_shortener || '').trim() || 'https://linkvertise.com/4171462/Phfl89HIrpV5?o=sharing';
        const keysSiteUrl = 'https://referrer.bolttexturas.site';

        // Anti-bypass: Redireciona via go.html para salvar o token ANTES do encurtador
        const shortenerClean = shortenerBase.replace(/\?url=.*$/, '').replace(/\&url=.*$/, '');
        const finalUrl = `${keysSiteUrl}/go.html?t=${token}&s=${encodeURIComponent(shortenerClean)}`;

        // Resposta V2 Limpa (Sem token visível) - ícone do servidor como no painel principal
        const responseContainer = {
            type: 17,
            accent_color: 0x00FF88, // Verde Sucesso
            components: [
                {
                    type: 9,
                    components: [
                        {
                            type: 10,
                            content: `## 🔐 Próxima Etapa\n> Clique no link abaixo para validar seu acesso.\n> Você será redirecionado para pegar sua Key exclusiva vinculada a **${interaction.user.tag}**.`
                        }
                    ],
                    accessory: { type: 11, media: { url: serverIcon } }
                },
                { type: 14 },
                {
                    type: 1,
                    components: [
                        {
                            type: 2, // BUTTON
                            style: 5, // LINK
                            label: 'Acessar Encurtador',
                            url: finalUrl
                        }
                    ]
                }
            ]
        };

        await interaction.editReply({
            components: [responseContainer],
            flags: 64 | MessageFlags.IsComponentsV2
        });
    } catch (err) {
        console.error('Erro ao gerar key:', err);
        const errorContainer = {
            type: 17,
            accent_color: 0xff0044,
            components: [{
                type: 9,
                components: [{ type: 10, content: `## ❌ ERRO NA SOLICITAÇÃO\n> Ocorreu um problema ao processar sua key. Tente novamente em instantes.` }],
                accessory: { type: 11, media: { url: serverIcon } }
            }]
        };
        return interaction.editReply({ components: [errorContainer], flags: 64 | MessageFlags.IsComponentsV2 });
    }
}

module.exports = { setupKeysPanel, handleKeyGeneration };
