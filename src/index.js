const logger = require('./utils/logger');
require('dotenv').config({ quiet: true }); // Carrega uma única vez e sem poluir o log

const { REST, Routes, SlashCommandBuilder, Events, MessageFlags } = require('discord.js');
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const Key = require('./database/models/Key');
const Texture = require('./database/models/Texture');
const Version = require('./database/models/Version');
const User = require('./database/models/User');

// Carregar Client e Banco DEPOIS do dotenv
const client = require('./discord/client');
const connectDB = require('./database/connect');

const app = express();

// Desativar buffering global para evitar que comandos fiquem "presos" se o banco demorar
const mongoose = require('mongoose');
mongoose.set('bufferCommands', false);

// Conectar ao Banco e pré-aquecer cache (evita Unknown interaction em cold start)
connectDB().then(async () => {
    try {
        const { warmVersionCache } = require('./discord/handlers/interactionHandler');
        await warmVersionCache();
        console.log('📦 Cache Version pré-aquecido.');
    } catch (_) {}
}).catch(() => {});

// Configuração CORS para permitir acesso dos sites externos
app.use(cors({
    origin: [
        'https://referrer.bolttexturas.site',
        'https://bolttexturas.site',
        'https://download.bolttexturas.site', // Domínio do site de confirmação
        'http://localhost:3000',
        'http://127.0.0.1:3000'
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
}));

app.use(bodyParser.json());
app.set('trust proxy', 1); // Confiar no proxy (Discloud/Heroku) para pegar IP real

// --- CONTROLE DE DOWNLOADS MONETIZADOS (Memory Store) ---
const pendingDownloads = new Map(); // hwid_textureId -> { status, timestamp, ip }

// Helper para pegar IP limpo
const getClientIp = (req) => {
    return (req.headers['x-forwarded-for'] || req.connection.remoteAddress || '').split(',')[0].trim();
};

// Iniciar processo de download (App pede)
app.post(['/api/download/start', '/download/start'], async (req, res) => {
    const { hwid, textureId } = req.body;
    if (!hwid || !textureId) return res.status(400).json({ error: 'Faltam dados.' });

    const clientIp = getClientIp(req);

    // SEGURANÇA: Limpa qualquer outra sessão pendente deste HWID para garantir que cada download seja único
    for (const k of pendingDownloads.keys()) {
        if (k.startsWith(`${hwid}_`)) pendingDownloads.delete(k);
    }

    // Salva na memória que este HWID (e IP) está autorizado
    pendingDownloads.set(`${hwid}_${textureId}`, {
        status: 'pending',
        timestamp: Date.now(),
        ip: clientIp
    });
    res.json({ success: true });
});

// Confirmar processo de download (Site chama)
app.get(['/api/download/confirm', '/download/confirm'], async (req, res) => {
    let { hwid, textureId } = req.query;
    const clientIp = getClientIp(req);



    // MODO 1: Confirmação Direta (Params)
    if (hwid && textureId) {
        const key = `${hwid}_${textureId}`;
        const entry = pendingDownloads.get(key);

        if (!entry) {
            return res.status(410).json({ error: 'Sessão expirada ou já utilizada. Reinicie o download no App.' });
        }

        entry.status = 'ready';
        entry.timestamp = Date.now();
        pendingDownloads.set(key, entry);

        return res.json({ success: true, method: 'params' });
    }

    // MODO 2: Confirmação por IP (Fallback se encurtador removeu params)
    // Procura o download PENDENTE mais recente deste IP
    let foundKey = null;
    let limitTime = Date.now() - 600000; // 10 min atrás máximo

    for (const [key, data] of pendingDownloads.entries()) {
        // Verifica IP e se está recente
        if (data.ip === clientIp && data.timestamp > limitTime) {
            // Se tiver mais de um, pega o último (mas map itera em ordem de inserção geralmente)
            // Vamos assumir o primeiro match recente serve
            foundKey = key;
        }
    }

    if (foundKey) {
        const data = pendingDownloads.get(foundKey);
        data.status = 'ready'; // Marca como pronto
        pendingDownloads.set(foundKey, data);
        return res.json({ success: true, method: 'ip_match' });
    }

    return res.status(400).json({ error: 'Dados não encontrados. Tente reiniciar o download no App.' });
});

// Checar status do download (App polla aqui)
app.get(['/api/download/status', '/download/status'], async (req, res) => {
    const { hwid, textureId } = req.query;
    const key = `${hwid}_${textureId}`;
    const data = pendingDownloads.get(key);

    if (data?.status === 'ready') {
        // CONSUMO ÚNICO
        pendingDownloads.delete(key);
        return res.json({ status: 'ready' });
    }

    res.json({ status: data?.status || 'none' });
});

// Rota para o site externo gerar uma key após o encurtador
app.get('/api/generate-key', async (req, res) => {
    try {
        const versionData = await Version.findOne({ id: 'global' });
        const duration = versionData?.defaultAccessTime || '4h';
        const deadline = versionData?.keyUseDeadline || '24h';

        const keyCode = `TEXTURE-B-${require('crypto').randomBytes(6).toString('hex').toUpperCase()}`;

        // Calcular Prazo de Resgate
        let useDeadlineDate = new Date();
        const dValue = parseInt(deadline);
        const dUnit = deadline.slice(-1);
        if (dUnit === 'h') useDeadlineDate.setHours(useDeadlineDate.getHours() + dValue);
        else if (dUnit === 'm') useDeadlineDate.setMinutes(useDeadlineDate.getMinutes() + dValue);
        else if (dUnit === 's') useDeadlineDate.setSeconds(useDeadlineDate.getSeconds() + dValue);
        else useDeadlineDate.setHours(useDeadlineDate.getHours() + 24);

        const newKey = await Key.create({
            key: keyCode,
            duration: duration,
            expiresToUseAt: useDeadlineDate,
            permissions: { type: 'standard', value: null } // Garante que keys do site NÃO pulem encurtador
        });

        res.json({ success: true, key: newKey.key, duration: newKey.duration });
    } catch (error) {
        res.status(500).json({ error: 'Erro ao gerar key via site.' });
    }
});

const KeyRequest = require('./database/models/KeyRequest');

app.post('/api/redeem-key', async (req, res) => {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Token inválido.' });

    try {
        // ATOMICO: Busca e deleta imediatamente para evitar Replay/F5
        const request = await KeyRequest.findOneAndDelete({ token });

        if (!request) return res.status(404).json({ error: 'Solicitação expirada ou inválida. Gere um novo botão no Discord.' });

        const crypto = require('crypto');
        const newKeyCode = `TEXTURE-B-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
        const versionConfig = await Version.findOne({ id: 'global' });

        const duration = versionConfig?.defaultAccessTime || '4h'; // Duração da sessão

        let expiresToUseAt = new Date();
        expiresToUseAt.setHours(expiresToUseAt.getHours() + 24);

        const newKey = await Key.create({
            key: newKeyCode,
            duration: duration,
            generatedBy: request.userId,
            generatedByTag: request.userTag || null,
            createdAt: new Date(),
            expiresToUseAt: expiresToUseAt,
            permissions: { type: 'standard', value: null } // Keys do bot devem ser 'standard', não 'all'
        });


        res.json({ success: true, key: newKey.key, duration: newKey.duration, user: request.userTag });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Erro interno ao gerar key.' });
    }
});

// Login / Validar Key
app.post('/api/validate', async (req, res) => {
    const { key, hwid } = req.body;
    if (!key) return res.status(400).json({ error: 'Key é obrigatória.' });

    const mongoose = require('mongoose');
    if (mongoose.connection.readyState !== 1) {
        return res.status(503).json({ error: 'Servidor iniciando conexão com banco de dados. Tente novamente em segundos.' });
    }

    try {
        const keyData = await Key.findOne({ key });
        if (!keyData) return res.status(404).json({ error: 'Key inválida.' });

        // --- VERIFICAÇÃO DE BLACKLIST ---
        let userData = await User.findOne({ hwid });
        if (userData && userData.isBlacklisted) {
            return res.status(403).json({
                error: 'Você foi banido! Vazou textura ou fez algo proibido.'
            });
        }

        // --- VINCULAÇÃO/ATUALIZAÇÃO DE USUÁRIO (Multi-Conta Support) ---
        if (keyData.generatedBy) {
            try {
                const resolvedTag = keyData.generatedByTag || (await client.users.fetch(keyData.generatedBy).catch(() => null))?.tag || null;
                if (!userData) {
                    userData = new User({
                        hwid,
                        discordId: keyData.generatedBy,
                        discordTag: resolvedTag || 'Unknown',
                        lastIp: req.headers['x-forwarded-for'] || req.socket.remoteAddress
                    });
                    await userData.save();
                } else if (userData.discordId !== keyData.generatedBy) {
                    userData.discordId = keyData.generatedBy;
                    userData.discordTag = resolvedTag || userData.discordTag || 'Unknown';
                    await userData.save();
                } else if (!userData.discordTag && resolvedTag) {
                    userData.discordTag = resolvedTag;
                    await userData.save();
                }
            } catch (updateErr) {
                console.error('Erro ao atualizar usuário:', updateErr);
            }
        }

        // --- TRAVA DE SERVIDOR (STRICT) ---
        // Só exige servidor quando a key tem generatedBy (foi gerada pelo bot no Discord). Keys do site (/api/generate-key) não têm e podem ser usadas sem checagem.
        try {
            const config = await Version.findOne({ id: 'global' });
            if (config && config.requiredServerId && (keyData.generatedBy || userData?.discordId)) {
                let isMember = false;
                const discordIdToCheck = (userData?.discordId) || keyData.generatedBy;
                const guildId = config.requiredServerId.trim();

                if (discordIdToCheck && guildId) {
                    try {
                        await client.rest.get(Routes.guildMember(guildId, discordIdToCheck));
                        isMember = true;
                    } catch (memberErr) {
                        if (memberErr?.code === 10007) {
                            console.log(`[SERVER_CHECK] Usuário ${discordIdToCheck} não está no servidor ${guildId}`);
                        }
                        isMember = false;
                    }
                }

                if (!isMember) {
                    let serverName = (config.requiredServerName || '').trim() || 'Servidor Oficial';

                    // Se o bot estiver no servidor, conseguimos pegar o nome real
                    try {
                        const cachedGuild = client.guilds.cache.get(guildId);
                        if (cachedGuild) {
                            serverName = cachedGuild.name;
                        }
                    } catch (err) {
                        console.log(`[SERVER_CHECK] Não foi possível ler cache do servidor ${guildId}:`, err.message);
                    }

                    return res.status(403).json({
                        error: `Você precisa estar no servidor ${serverName} acessar!`,
                        serverName: serverName,
                        inviteUrl: config.requiredServerInvite || ''
                    });
                }
            }
        } catch (serverCheckErr) {
            console.error('Erro na verificação de servidor:', serverCheckErr);
        }

        const now = new Date();
        const clientIp = getClientIp(req);
        const permissions = keyData.permissions || { type: 'all', value: null };

        // Se a key já foi usada
        if (keyData.isUsed) {
            // Verificar trava de dispositivo (HWID)
            if (keyData.usedBy && keyData.usedBy !== hwid) {
                return res.status(403).json({ error: 'Esta key já está vinculada a outro computador.' });
            }

            // Verificar se expirou (se não for permanente)
            if (keyData.duration !== 'permanente' && keyData.expiresAt && now > keyData.expiresAt) {
                return res.status(403).json({ error: 'Sua licença expirou.' });
            }

            // --- ATUALIZAÇÃO DE USUÁRIO (Keys já usadas) ---
            if (!userData) {
                const tag = keyData.generatedByTag || (keyData.generatedBy && (await client.users.fetch(keyData.generatedBy).catch(() => null))?.tag) || null;
                userData = await User.create({
                    hwid,
                    discordId: keyData.generatedBy || null,
                    discordTag: tag || null,
                    lastIp: clientIp,
                    lastKeyUsed: key,
                    totalInstalls: 0
                });
                console.log(`\n🚀 [NOVO USUÁRIO]\nHWID: ${hwid}\nIP: ${clientIp}\nDiscord: ${userData.discordTag || userData.discordId || 'Não vinculado'}\n`);
            } else {
                userData.lastIp = clientIp;
                userData.lastKeyUsed = key;
                if (!userData.discordId && keyData.generatedBy) {
                    userData.discordId = keyData.generatedBy;
                    userData.discordTag = keyData.generatedByTag || (await client.users.fetch(keyData.generatedBy).catch(() => null))?.tag || null;
                }
                userData.updatedAt = new Date();
                await userData.save();
            }

            return res.json({
                success: true,
                duration: keyData.duration,
                expiresAt: keyData.expiresAt,
                permissions: permissions
            });
        }

        // Primeira vez usando a key (Resgate)
        const { applyDuration } = require('./utils/durationParser');
        const expirationDate = applyDuration(new Date(), keyData.duration);

        keyData.isUsed = true;
        keyData.usedBy = hwid;
        keyData.expiresAt = expirationDate;
        await keyData.save();

        // --- ATUALIZAÇÃO / CRIAÇÃO DE USUÁRIO (Primeiro uso) ---
        if (!userData) {
            const tag = keyData.generatedByTag || (keyData.generatedBy && (await client.users.fetch(keyData.generatedBy).catch(() => null))?.tag) || null;
            userData = await User.create({
                hwid,
                discordId: keyData.generatedBy || null,
                discordTag: tag || null,
                lastIp: clientIp,
                lastKeyUsed: key,
                totalInstalls: 0
            });
            console.log(`\n🚀 [NOVO USUÁRIO]\nHWID: ${hwid}\nIP: ${clientIp}\nDiscord: ${userData.discordTag || userData.discordId || 'Não vinculado'}\n`);
        } else {
            userData.lastIp = clientIp;
            userData.lastKeyUsed = key;
            if (!userData.discordId && keyData.generatedBy) {
                userData.discordId = keyData.generatedBy;
                userData.discordTag = keyData.generatedByTag || (await client.users.fetch(keyData.generatedBy).catch(() => null))?.tag || null;
            }
            userData.updatedAt = new Date();
            await userData.save();
        }

        res.json({
            success: true,
            duration: keyData.duration,
            expiresAt: expirationDate,
            permissions: permissions
        });
    } catch (error) {
        console.error('Erro na validação:', error);
        res.status(500).json({ error: 'Erro interno no servidor.' });
    }
});

// Listar Texturas (Protegido)
app.post('/api/textures', async (req, res) => {
    const { key, hwid } = req.body;

    const mongoose = require('mongoose');
    if (mongoose.connection.readyState !== 1 && key !== 'get_shortener') {
        return res.status(503).json({ error: 'Banco de dados desconectado. Tente novamente.' });
    }

    try {
        const config = await Version.findOne({ id: 'global' });

        // Atalho para pegar encurtador e VERSAO no login
        if (key === 'get_shortener') {
            return res.json({
                keyShortener: config?.keyShortener,
                version: config?.version || '1.0',
                keysChannelUrl: config?.keysChannelUrl // Novo campo para o botão do App
            });
        }

        const keyData = await Key.findOne({ key });
        if (!keyData || !keyData.isUsed) return res.status(403).json({ error: 'Acesso negado.' });

        // Segurança: Verificar HWID em cada chamada de texturas
        if (keyData.usedBy && keyData.usedBy !== hwid) {
            return res.status(403).json({ error: 'Acesso bloqueado. Esta key pertence a outro dispositivo.' });
        }

        // Validação de tempo se não for permanente
        if (keyData.duration !== 'permanente' && keyData.expiresAt && new Date() > keyData.expiresAt) {
            return res.status(403).json({ error: 'Sua licença expirou.' });
        }

        const permissions = keyData.permissions || { type: 'all', value: null };

        // Retornamos sempre TODAS as texturas para que o usuário veja o catálogo completo.
        // A lógica de "Bypass" (ignorar encurtador) é tratada pelo aplicativo usando o objeto 'permissions'.
        const textures = await Texture.find();

        res.json({
            textures,
            permissions,
            version: config?.version || '1.0',
            keyShortener: config?.keyShortener,
            profileImage: config?.profileImage || 'https://i.imgur.com/YahM0Nf.png',
            targetFolderName: config?.targetFolderName || 'StumbleCups',
            removeUrlPart1: config?.removeUrlPart1 || '',
            removeUrlPart2: config?.removeUrlPart2 || ''
        });
    } catch (error) {
        console.error('Erro ao buscar texturas:', error);
        res.status(500).json({ error: 'Erro ao buscar texturas.' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`📡 API para o Aplicativo rodando na porta ${PORT}`);
});

app.get('/', (req, res) => res.send('API Online 💜'));

// --- TAREFA DE LIMPEZA AUTOMÁTICA EM SEGUNDO PLANO ---
setInterval(async () => {
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState !== 1) return;

    try {
        const now = new Date();
        const [deletedUnused, deletedUsed] = await Promise.all([
            Key.deleteMany({ isUsed: false, expiresToUseAt: { $lt: now } }).catch(() => ({ deletedCount: 0 })),
            Key.deleteMany({ isUsed: true, expiresAt: { $lt: now, $ne: null } }).catch(() => ({ deletedCount: 0 }))
        ]);

        for (const [key, value] of pendingDownloads.entries()) {
            if (now - value.timestamp > 600000) {
                pendingDownloads.delete(key);
            }
        }

        const u = deletedUnused?.deletedCount || 0;
        const s = deletedUsed?.deletedCount || 0;
        if (u + s > 0) {
            console.log(`🧹 [Limpeza] Foram removidas ${u + s} chaves (Resgate: ${u} | Sessão: ${s})`);
        }
    } catch (e) { }
}, 60000);

// Evento Ready
client.once(Events.ClientReady, async () => {
    const mongoose = require('mongoose');

    if (mongoose.connection.readyState !== 1) {
        const timeout = new Promise(resolve => setTimeout(resolve, 10000));
        const connection = new Promise(resolve => {
            if (mongoose.connection.readyState === 1) resolve();
            else mongoose.connection.once('connected', resolve);
        });
        await Promise.race([timeout, connection]);
    }

    const guild = client.guilds.cache.first();
    const serverName = guild ? guild.name : 'Nenhum servidor encontrado';
    const memberCount = guild ? guild.memberCount : 0;
    const mongoStatus = mongoose.connection.readyState === 1 ? 'Sim' : 'Não';

    console.log(`\n💜 ########## STATUS DO BOT ##########`);
    console.log(`💜 Servidor: ${serverName}`);
    console.log(`   💜 Quantas pessoas no servidor: ${memberCount}`);
    console.log(`      💜 MongoDB conectado: ${mongoStatus}`);
    console.log(`          💜 Criador By: bolttexturas\n`);

    // Registrar comandos
    const commands = [
        new SlashCommandBuilder()
            .setName('painel')
            .setDescription('💜 Abre o painel administrativo (Apenas Admins).'),
        new SlashCommandBuilder()
            .setName('keys')
            .setDescription('💜 Cria o painel público de geração de keys (Apenas Admins).')
    ].map(command => command.toJSON());

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

    try {
        console.log('⏳ Registrando comandos globais...');
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands },
        );
        console.log('✅ Comandos registrados com sucesso!');
    } catch (error) {
        console.error('❌ Erro ao registrar comandos:', error);
    }
});

// Evita processar a mesma interação duas vezes (Discord às vezes envia duplicata)
const processedInteractions = new Set();
const PROCESSED_MAX = 500;
const PROCESSED_TTL = 60 * 60 * 1000; // 1h
let lastCleanup = Date.now();

// Cooldown /keys por usuário (evita double-click / duplicata)
const keysCommandCooldown = new Map();
const KEYS_COOLDOWN_MS = 5000;

// Interaction Create (Router para o Painel)
client.on(Events.InteractionCreate, async (interaction) => {
    const iid = interaction.id;
    if (processedInteractions.has(iid)) {
        return; // Já processado (duplicata)
    }
    processedInteractions.add(iid);
    if (processedInteractions.size > PROCESSED_MAX || Date.now() - lastCleanup > PROCESSED_TTL) {
        processedInteractions.clear();
        lastCleanup = Date.now();
    }

    // Log apenas de comandos principais para não poluir (após dedupe)
    if (interaction.isChatInputCommand()) {
        console.log(`[Interaction] Comando: /${interaction.commandName} | Usuário: ${interaction.user.tag}`);
    }

    try {
        if (interaction.isChatInputCommand()) {
            if (interaction.commandName === 'painel') {
                const painelHandler = require('./discord/handlers/painelHandler');
                return await painelHandler(interaction);
            }
            if (interaction.commandName === 'keys' || interaction.commandName === 'setup_keys') {
                const uid = interaction.user.id;
                const now = Date.now();
                if (keysCommandCooldown.has(uid) && (now - keysCommandCooldown.get(uid)) < KEYS_COOLDOWN_MS) {
                    return interaction.reply({ content: '⏳ Aguarde alguns segundos antes de usar novamente.', flags: 64 });
                }
                keysCommandCooldown.set(uid, now);
                const { setupKeysPanel } = require('./discord/handlers/keysPanelHandler');
                return await setupKeysPanel(interaction);
            }
        }

        // Botões e interações de componentes (processados apenas uma vez)
        if (interaction.isButton() && interaction.customId === 'public_gen_key') {
            const { handleKeyGeneration } = require('./discord/handlers/keysPanelHandler');
            return await handleKeyGeneration(interaction);
        }

        if (interaction.isButton() || interaction.isStringSelectMenu() || interaction.isModalSubmit()) {
            const interactionHandler = require('./discord/handlers/interactionHandler');
            return await interactionHandler(interaction);
        }
    } catch (error) {
        logger.error(`Erro na interação: ${error.message}`);
        try {
            if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: '❌ Erro interno ao processar ação.', flags: 64 });
            }
        } catch (e) { }
    }
});

console.log('🤖 Tentando conectar ao Discord Gateway...');
client.login(process.env.DISCORD_TOKEN)
    .then(() => console.log('✅ Conexão estabelecida!'))
    .catch(err => {
        console.error('\n❌ ERRO CRÍTICO NO LOGIN DO DISCORD:');
        console.error(`> Código/Mensagem: ${err.message}`);
        console.error('> Verifique se o DISCORD_TOKEN no Render é VÁLIDO e as INTENTS estão ligadas no Portal Developer.\n');
    });
