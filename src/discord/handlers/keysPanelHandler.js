const { REST, Routes, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const crypto = require('crypto');
const supabase = require('../../database/supabase');

// Handler /setup_keys e /keys
async function setupKeysPanel(interaction) {
    if (!interaction.member.permissions.has('Administrator')) {
        return interaction.reply({ content: '❌ Apenas administradores.', flags: 64 });
    }

    await interaction.deferReply({ flags: 64 });

    const guildIcon = interaction.guild.iconURL({ extension: 'png' }) || 'https://cdn-icons-png.flaticon.com/512/8050/8050935.png';

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
                                content: `## 🔑 Key Textura\n> Para continuar, clique no botão abaixo e gere seu acesso às texturas.\n> -# Esse processo é necessário para a chave de acesso ao sistema.`
                            }
                        ],
                        accessory: {
                            type: 11, // MEDIA
                            media: { url: guildIcon }
                        }
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
            accent_color: 0xc773ff,
            components: [{
                type: 9,
                components: [{ type: 10, content: `## ✅ Painel de Key criado.\n> O painel foi configurado neste canal com sucesso.` }],
                accessory: { type: 11, media: { url: guildIcon } }
            }]
        };
        return interaction.editReply({ components: [confirmContainer], flags: 64 | MessageFlags.IsComponentsV2 });
    } catch (err) {
        console.error('Erro ao enviar V2:', err);
        return interaction.editReply({ content: '❌ Erro ao criar painel. Verifique permissões ou suporte a V2.', flags: 64 });
    }
}

// Handler Botão Gerar Key
async function handleKeyGeneration(interaction) {
    await interaction.deferReply({ flags: 64 });

    // Verificação Mobile
    const presence = interaction.member?.presence;
    const isMobile = presence?.clientStatus?.mobile;
    const isDesktop = presence?.clientStatus?.desktop;

    if (isMobile && !isDesktop) {
        return interaction.editReply({
            content: '📱 **Acesso Mobile:** Utilize nosso site oficial para baixar texturas no celular.'
        });
    }

    const token = crypto.randomBytes(16).toString('hex');

    const { error: requestError } = await supabase.from('key_requests').insert({
        token: token,
        user_id: interaction.user.id,
        user_tag: interaction.user.tag
    });

    if (requestError) {
        console.error('Erro ao salvar KeyRequest:', requestError);
        return interaction.editReply({ content: '❌ Erro ao solicitar key. Tente novamente.', flags: 64 });
    }

    const { data: config } = await supabase.from('versions').select('*').eq('global_id', 'global').maybeSingle();
    let shortenerBase = (config?.key_shortener || '').trim() || 'https://referrer.bolttexturas.site';
    const keysSiteUrl = 'https://referrer.bolttexturas.site';

    // Encurtadores em cadeia (sannerurl->caminhodesperto) não repassam ?token= nem url=.
    // Usar go.html: salva token no sessionStorage, redireciona pro encurtador. Ao voltar, index pega o token.
    const shortenerClean = shortenerBase.replace(/\?url=.*$/, '').replace(/\&url=.*$/, '');
    const finalUrl = `${keysSiteUrl}/go.html?t=${token}&s=${encodeURIComponent(shortenerClean)}`;

    const guildIcon = interaction.guild.iconURL({ extension: 'png' }) || 'https://cdn.discordapp.com/embed/avatars/0.png';

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
                accessory: {
                    type: 11,
                    media: { url: guildIcon }
                }
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
}

module.exports = { setupKeysPanel, handleKeyGeneration };
