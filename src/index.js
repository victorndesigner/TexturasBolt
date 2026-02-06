const client = require('./discord/client');
const connectDB = require('./database/connect');
const logger = require('./utils/logger');
require('dotenv').config();


const { REST, Routes, SlashCommandBuilder, Events, MessageFlags } = require('discord.js');
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const Key = require('./database/models/Key');
const Texture = require('./database/models/Texture');
const Version = require('./database/models/Version');

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.set('trust proxy', 1); // Confiar no proxy (Discloud/Heroku) para pegar IP real

// --- CONTROLE DE DOWNLOADS MONETIZADOS (Memory Store) ---
const pendingDownloads = new Map(); // hwid_textureId -> { status, timestamp, ip }

// Helper para pegar IP limpo
const getClientIp = (req) => {
    return (req.headers['x-forwarded-for'] || req.connection.remoteAddress || '').split(',')[0].trim();
};

// Iniciar processo de download (App pede)
app.post('/api/download/start', async (req, res) => {
    const { hwid, textureId } = req.body;
    if (!hwid || !textureId) return res.status(400).json({ error: 'Faltam dados.' });

    const clientIp = getClientIp(req);

    // Salva na memória que este HWID (e IP) está autorizado
    pendingDownloads.set(`${hwid}_${textureId}`, {
        status: 'pending',
        timestamp: Date.now(),
        ip: clientIp
    });
    console.log(`[API] Download iniciado. HWID: ${hwid} | IP: ${clientIp} | Tex: ${textureId}`);
    res.json({ success: true });
});

// Confirmar processo de download
app.get('/api/download/confirm', async (req, res) => {
    let { hwid, textureId } = req.query;
    const clientIp = getClientIp(req);

    console.log(`[API] Tentativa de confirmação. IP: ${clientIp} | Params:`, req.query);

    // MODO 1: Confirmação Direta (Params)
    if (hwid && textureId) {
        const key = `${hwid}_${textureId}`;
        const entry = pendingDownloads.get(key);

        // Atualiza ou cria (fallback forçado)
        pendingDownloads.set(key, {
            status: 'ready',
            timestamp: Date.now(),
            ip: entry?.ip || clientIp
        });
        console.log(`[API] Download CONFIRMADO (Via Params) para ${key}`);
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
        console.log(`[API] Download CONFIRMADO (Via IP Match) para ${foundKey}`);
        return res.json({ success: true, method: 'ip_match' });
    }

    return res.status(400).json({ error: 'Dados não encontrados. Tente reiniciar o download no App.' });
});

// Checar status do download (App polla aqui)
app.get('/api/download/status', async (req, res) => {
    const { hwid, textureId } = req.query;
    const key = `${hwid}_${textureId}`;
    const data = pendingDownloads.get(key);

    if (data?.status === 'ready') {
        // NÃO deleta imediatamente, espera o App baixar de fato ou deleta no timeout
        // Se deletar agora, o próximo poll pode falhar se houver delay
        // Vamos manter como ready
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
            expiresToUseAt: useDeadlineDate
        });

        res.json({ success: true, key: newKey.key, duration: newKey.duration });
    } catch (error) {
        res.status(500).json({ error: 'Erro ao gerar key via site.' });
    }
});

// Login / Validar Key
app.post('/api/validate', async (req, res) => {
    const { key, hwid } = req.body;
    if (!key) return res.status(400).json({ error: 'Key é obrigatória.' });

    try {
        const keyData = await Key.findOne({ key });
        if (!keyData) return res.status(404).json({ error: 'Key inválida.' });

        const now = new Date();

        // Se a key já foi usada
        if (keyData.isUsed) {
            // Se for key permanente, permite uso contínuo (opcional: travar por HWID)
            if (keyData.duration === 'permanente') {
                return res.json({ success: true, duration: 'permanente' });
            }

            // Verificar se expirou
            if (keyData.expiresAt && now > keyData.expiresAt) {
                return res.status(403).json({ error: 'Key expirada.' });
            }

            // Se ainda está no tempo mas é outro HWID (trava básica)
            if (keyData.usedBy && keyData.usedBy !== hwid) {
                return res.status(403).json({ error: 'Esta key já está em uso em outro dispositivo.' });
            }

            return res.json({
                success: true,
                duration: keyData.duration,
                expiresAt: keyData.expiresAt
            });
        }

        // Primeira vez usando a key
        let expirationDate = null;
        if (keyData.duration !== 'permanente') {
            const timeValue = parseInt(keyData.duration);
            const unit = keyData.duration.slice(-1);
            expirationDate = new Date();

            if (unit === 'h') expirationDate.setHours(expirationDate.getHours() + timeValue);
            else if (unit === 'm') expirationDate.setMinutes(expirationDate.getMinutes() + timeValue);
            else expirationDate.setHours(expirationDate.getHours() + 4); // Default 4h
        }

        keyData.isUsed = true;
        keyData.usedBy = hwid;
        keyData.expiresAt = expirationDate;
        await keyData.save();

        res.json({
            success: true,
            duration: keyData.duration,
            expiresAt: expirationDate
        });
    } catch (error) {
        res.status(500).json({ error: 'Erro interno no servidor.' });
    }
});

// Listar Texturas (Protegido)
app.post('/api/textures', async (req, res) => {
    const { key, hwid } = req.body;
    try {
        const config = await Version.findOne({ id: 'global' });

        // Atalho para pegar encurtador e VERSAO no login
        if (key === 'get_shortener') {
            return res.json({
                keyShortener: config?.keyShortener,
                version: config?.version || '1.0'
            });
        }

        const keyData = await Key.findOne({ key });
        if (!keyData || !keyData.isUsed) return res.status(403).json({ error: 'Acesso negado.' });

        // Validação de tempo se não for permanente
        if (keyData.duration !== 'permanente' && keyData.expiresAt && new Date() > keyData.expiresAt) {
            return res.status(403).json({ error: 'Sessão expirada.' });
        }

        const textures = await Texture.find();

        res.json({
            textures,
            version: config?.version || '1.0',
            keyShortener: config?.keyShortener,
            profileImage: config?.profileImage || 'https://i.imgur.com/YahM0Nf.png',
            targetFolderName: config?.targetFolderName || 'StumbleCups',
            removeUrlPart1: config?.removeUrlPart1 || '',
            removeUrlPart2: config?.removeUrlPart2 || ''
        });
    } catch (error) {
        res.status(500).json({ error: 'Erro ao buscar texturas.' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`📡 API para o Aplicativo rodando na porta ${PORT}`);
});

// --- TAREFA DE LIMPEZA AUTOMÁTICA EM SEGUNDO PLANO ---
// Limpa keys que expiraram do prazo de resgate ou sessões que já acabaram
setInterval(async () => {
    try {
        const now = new Date();
        // 1. Deletar keys não usadas que passaram do prazo de resgate
        const deletedUnused = await Key.deleteMany({ isUsed: false, expiresToUseAt: { $lt: now } });

        // 2. Deletar keys usadas cujas sessões (ex: 4h) já expiraram
        const deletedUsed = await Key.deleteMany({ isUsed: true, expiresAt: { $lt: now, $ne: null } });

        // 3. Limpar downloads pendentes há mais de 10 minutos (Evita memória cheia)
        for (const [key, value] of pendingDownloads.entries()) {
            if (now - value.timestamp > 600000) { // 10 minutos
                pendingDownloads.delete(key);
            }
        }

        const total = deletedUnused.deletedCount + deletedUsed.deletedCount;
        if (total > 0) {
            console.log(`🧹 [Limpeza] Foram removidas ${total} chaves (Resgate: ${deletedUnused.deletedCount} | Sessão: ${deletedUsed.deletedCount})`);
        }
    } catch (error) {
        console.error('Erro na limpeza automática:', error);
    }
}, 60000); // Executa a cada 60 segundos

// Evento Ready
client.once(Events.ClientReady, async () => {
    // Aguardar conexão com o banco caso ainda não tenha terminado
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState !== 1) {
        await connectDB();
    }

    console.clear();

    const guild = client.guilds.cache.first();
    const serverName = guild ? guild.name : 'Nenhum servidor encontrado';
    const memberCount = guild ? guild.memberCount : 0;
    const mongoStatus = mongoose.connection.readyState === 1 ? 'Sim' : 'Não';

    console.log(`💜 Servidor: ${serverName}`);
    console.log(`   💜 Quantas pessoas no servidor: ${memberCount}`);
    console.log(`      💜 MongoDB conectado: ${mongoStatus}`);
    console.log(`          💜 Criador By: bolttexturas\n`);

    // Registrar comandos
    const commands = [
        new SlashCommandBuilder()
            .setName('painel')
            .setDescription('Abre o painel administrativo de texturas e versões.')
    ].map(command => command.toJSON());

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

    try {
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands },
        );
    } catch (error) {
        // Silencioso se der erro no registro
    }
});

// Interaction Create (Router para o Painel)
client.on(Events.InteractionCreate, async (interaction) => {
    try {
        if (interaction.isChatInputCommand()) {
            if (interaction.commandName === 'painel') {
                const painelHandler = require('./discord/handlers/painelHandler');
                return await painelHandler(interaction);
            }
        }

        if (interaction.isButton() || interaction.isStringSelectMenu() || interaction.isModalSubmit()) {
            const interactionHandler = require('./discord/handlers/interactionHandler');
            return await interactionHandler(interaction);
        }
    } catch (error) {
        logger.error(`Erro na interação: ${error.message}`);

        // Tentar avisar o usuário se algo deu muito errado e a interação ainda for válida
        try {
            if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: '❌ Ocorreu um erro interno ao processar esta ação.',
                    flags: [MessageFlags.Ephemeral]
                });
            }
        } catch (e) {
            // Ignora erro ao tentar avisar
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
