const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const crypto = require('crypto');
const KeyRequest = require('../../database/models/KeyRequest');
const Version = require('../../database/models/Version');

// Handler para criar o painel público
async function setupKeysPanel(interaction) {
    if (!interaction.member.permissions.has('Administrator')) {
        return interaction.reply({ content: '❌ Apenas administradores podem usar isso.', flags: 64 });
    }

    const embed = new EmbedBuilder()
        .setTitle('Key Textura')
        .setDescription('> Para continuar, clique no botão abaixo e gere seu acesso às texturas.\n\n-# Esse processo é necessário para a chave de acesso ao sistema.')
        .setColor('#5865F2')
        .setThumbnail('https://cdn-icons-png.flaticon.com/512/8050/8050935.png') // Um icone de chave genérico ou do servidor
        .setFooter({ text: 'Sistema Bolt Texturas', iconURL: interaction.guild.iconURL() });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('public_gen_key') // Botão fixo
            .setLabel('Gerar Key 🔑')
            .setStyle(ButtonStyle.Success)
    );

    await interaction.channel.send({ embeds: [embed], components: [row] });
    return interaction.reply({ content: '✅ Painel de Keys criado com sucesso!', flags: 64 });
}

// Handler para o clique no botão
async function handleKeyGeneration(interaction) {
    // Verificação de Dispositivo (Mobile vs Desktop)
    const presence = interaction.member?.presence;
    const isMobile = presence?.clientStatus?.mobile;
    const isDesktop = presence?.clientStatus?.desktop;

    // Se estiver APENAS no mobile (sem desktop logado), redireciona
    if (isMobile && !isDesktop) {
        const rowMobile = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel('Acessar Site (Mobile)')
                .setStyle(ButtonStyle.Link)
                .setURL('https://bolttexturas.site/')
        );
        return interaction.reply({
            content: `## 📱 Acesso Mobile Detectado\nEste gerador de keys é destinado para **PC**.\n\nPara baixar texturas no celular, utilize nosso site oficial clicando abaixo.`,
            components: [rowMobile],
            flags: 64
        });
    }

    await interaction.deferReply({ flags: 64 }); // Ephemeral

    const token = crypto.randomBytes(16).toString('hex');

    // Cria o request vinculado a este usuário
    await KeyRequest.create({
        token: token,
        userId: interaction.user.id,
        userTag: interaction.user.tag
    });

    const config = await Version.findOne({ id: 'global' });
    let shortenerBase = config?.keyShortener || 'https://google.com';

    // Montar a URL de destino (onde a key será exibida)
    // O site deve ler ?token=XYZ, validar na API e exibir a Key
    // Suponho que o site seja https://bolttexturas.site/resgate (precisa ser criado ou existir)
    // Se não existir, user o endpoint da API direto? Não, user a página HTML.
    const targetUrl = `https://bolttexturas.site/redeem.html?token=${token}`;

    // Combinação com Encurtador (Lógica Simples de Append)
    // Se o encurtador for do tipo "Linkvertise Dynamic", a estrutura varia.
    // Vamos assumir um padrão genérico: URL_ENCURTADOR + URL_DESTINO
    // Se o admin configurou "https://encurta.net/st?api=xxxxx&url=", nós concatenamos.
    // Se ele configurou um link FIXO, nós não conseguimos passar o parametro.

    // Como fallback, se o link não parecer um encurtador de API, usamos um parametro de hash ou query
    // Esperando que o encurtador repasse.

    let finalUrl;
    if (shortenerBase.includes('url=')) {
        finalUrl = `${shortenerBase}${encodeURIComponent(targetUrl)}`;
    } else {
        // Tenta passar como query string se não tiver parametro explícito
        // Ex: https://meusite.com/short?dest=...
        finalUrl = shortenerBase; // Se for fixo, o sistema quebra. O usuário precisa configurar direito.
        // Vamos avisar o usuário no botão?

        // Melhor: Vamos salvar o token e pedir para o usuário COPIAR o token? Não, péssima UX.
        // Vamos tentar anexar o token na URL do encurtador como Fallback, igual fizemos no App.
        if (finalUrl.includes('?')) finalUrl += `&token=${token}`;
        else finalUrl += `?token=${token}`;
    }

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setLabel('Acessar Encurtador')
            .setStyle(ButtonStyle.Link)
            .setURL(finalUrl)
    );

    await interaction.editReply({
        content: `## 🔐 Próxima Etapa\nClique no link abaixo para validar seu acesso.\nVocê será redirecionado para pegar sua Key exclusiva vinculada a **@${interaction.user.username}**.\n\n-# Token: ${token.substring(0, 6)}...`,
        components: [row]
    });
}

module.exports = { setupKeysPanel, handleKeyGeneration };
