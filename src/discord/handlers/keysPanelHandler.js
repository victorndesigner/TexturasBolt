const { REST, Routes, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const crypto = require('crypto');
const KeyRequest = require('../../database/models/KeyRequest');
const Version = require('../../database/models/Version');

// Handler /setup_keys
async function setupKeysPanel(interaction) {
    if (!interaction.member.permissions.has('Administrator')) {
        return interaction.reply({ content: '❌ Apenas administradores.', flags: 64 });
    }

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
        return interaction.reply({ components: [confirmContainer], flags: 64 | MessageFlags.IsComponentsV2 });
    } catch (err) {
        console.error('Erro ao enviar V2:', err);
        return interaction.reply({ content: '❌ Erro ao criar painel. Verifique permissões ou suporte a V2.', flags: 64 });
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

    await KeyRequest.create({
        token: token,
        userId: interaction.user.id,
        userTag: interaction.user.tag
    });

    const config = await Version.findOne({ id: 'global' });
    let shortenerBase = (config?.keyShortener || '').trim() || 'https://referrer.bolttexturas.site';
    // Redeem está em referrer.bolttexturas.site (KeysSite no GitHub)
    const targetUrl = `https://referrer.bolttexturas.site/redeem.html?token=${token}`;

    let finalUrl;
    let useShortener = false;
    if (shortenerBase.includes('url=')) {
        // Encurtador com suporte a URL dinâmica: destino = redeem com token
        finalUrl = `${shortenerBase}${encodeURIComponent(targetUrl)}`;
        useShortener = true;
    } else if (shortenerBase.includes('referrer.bolttexturas.site')) {
        // Shortener é o próprio site de keys: link direto para redeem
        finalUrl = targetUrl;
    } else {
        // Encurtadores fixos (ex: sannerurl) geralmente NÃO repassam ?token= no redirect.
        // Usar link direto para garantir que discordId/userTag seja vinculado.
        finalUrl = targetUrl;
    }

    const guildIcon = interaction.guild.iconURL({ extension: 'png' }) || 'https://cdn.discordapp.com/embed/avatars/0.png';
    const btnLabel = useShortener ? 'Acessar Encurtador' : 'Pegar Key';

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
                        label: btnLabel,
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
