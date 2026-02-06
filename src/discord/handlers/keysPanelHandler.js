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
                accent_color: 0x5865F2, // Blurple
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
                                style: 3, // SUCCESS (Green)
                                label: 'Gerar Key',
                                emoji: { name: '🔑' },
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
        return interaction.reply({ content: '✅ Painel criado no layout V2.', flags: 64 });
    } catch (err) {
        console.error('Erro ao enviar V2:', err);
        return interaction.reply({ content: '❌ Erro ao criar painel. Verifique permissões ou suporte a V2.', flags: 64 });
    }
}

// Handler Botão Gerar Key
async function handleKeyGeneration(interaction) {
    // Verificação Mobile
    const presence = interaction.member?.presence;
    const isMobile = presence?.clientStatus?.mobile;
    const isDesktop = presence?.clientStatus?.desktop;

    if (isMobile && !isDesktop) {
        return interaction.reply({
            content: '📱 **Acesso Mobile:** Utilize nosso site oficial para baixar texturas no celular.',
            flags: 64
        });
    }

    const token = crypto.randomBytes(16).toString('hex');

    await KeyRequest.create({
        token: token,
        userId: interaction.user.id,
        userTag: interaction.user.tag
    });

    const config = await Version.findOne({ id: 'global' });
    let shortenerBase = config?.keyShortener || 'https://google.com';
    const targetUrl = `https://bolttexturas.site/redeem.html?token=${token}`;

    let finalUrl;
    if (shortenerBase.includes('url=')) {
        finalUrl = `${shortenerBase}${encodeURIComponent(targetUrl)}`;
    } else {
        finalUrl = shortenerBase;
        if (finalUrl.includes('?')) finalUrl += `&token=${token}`;
        else finalUrl += `?token=${token}`;
    }

    // Resposta V2 Limpa (Sem token visível)
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
                    media: { url: 'https://cdn-icons-png.flaticon.com/512/10692/10692659.png' } // Ícone de Link/Cadeado
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

    // Usar reply com componentes crus
    // Precisamos enganar o DJS ou usar API direta se ele reclamar.
    // DJS 14.x aceita api raw em 'components'? As vezes sim.
    // Se não, usamos REST.reply

    try {
        await interaction.client.rest.post(Routes.interactionCallback(interaction.id, interaction.token), {
            body: {
                type: 4, // ChannelMessageWithSource
                data: {
                    components: [responseContainer],
                    flags: 64 | MessageFlags.IsComponentsV2 // Ephemeral + Components V2
                }
            }
        });
    } catch (e) {
        console.error('Erro ao responder interação V2:', e);
        // Fallback
        await interaction.reply({ content: 'Erro ao gerar key visual. Tente novamente.', flags: 64 });
    }
}

module.exports = { setupKeysPanel, handleKeyGeneration };
