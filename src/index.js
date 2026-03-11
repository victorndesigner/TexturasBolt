const logger = require('./utils/logger');
require('dotenv').config({ quiet: true }); // Carrega uma única vez e sem poluir o log
const dns = require('node:dns');
dns.setDefaultResultOrder('ipv4first'); // FIX: Prevenir que o node 22 trave no IPv6 do Discord Gateway

const RUN_MODE = process.env.RUN_MODE || 'ALL'; // Configuração para separar render e discloud
console.log(`🚀 Iniciando em modo: ${RUN_MODE}`);

const { REST, Routes, SlashCommandBuilder, Events, MessageFlags } = require('discord.js');
const express = require('express');
const cors = require('cors');

// Carregar Supabase
const supabase = require('./database/supabase');

// Carregar Client e Banco DEPOIS do dotenv
const client = require('./discord/client');
const painelHandler = require('./discord/handlers/painelHandler');
const interactionHandler = require('./discord/handlers/interactionHandler');
const keysPanelHandler = require('./discord/handlers/keysPanelHandler');

const app = express();

// Cache Version pré-aquecido (Agora via Supabase)
(async () => {
    try {
        await interactionHandler.warmVersionCache();
        console.log('📦 Cache Version pré-aquecido.');
    } catch (_) {}
})();

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

app.use(express.json());
app.set('trust proxy', 1); // Confiar no proxy (Discloud/Heroku) para pegar IP real

// --- CONTROLE DE DOWNLOADS E KEYS (Memory Store) ---
const pendingDownloads = new Map(); // hwid_textureId -> { status, timestamp, ip }
const keyCooldowns = new Map();    // ip -> timestamp
const downloadTickets = new Map(); // token -> { texture_id, hwid, ip, timestamp }

// Helper para pegar IP limpo
const getClientIp = (req) => {
    if (req.ip) return req.ip.split(':').pop(); // Simplifica pra IPv4 se vier no formato IPv6
    const forwarded = req.headers['x-forwarded-for'];
    const ip = forwarded ? forwarded.split(',')[0] : (req.socket?.remoteAddress || req.connection?.remoteAddress || '');
    return ip.trim();
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
    if (!hwid || !textureId) return res.status(400).json({ error: 'Faltam dados.' });

    const key = `${hwid}_${textureId}`;
    const data = pendingDownloads.get(key);

    if (data?.status === 'ready') {
        // Validação extra por IP para evitar burlas de rede
        const currentIp = getClientIp(req);
        if (data.ip !== currentIp) {
            return res.json({ status: 'waiting_verification', detail: 'Aguardando validação de rede segura.' });
        }

        // CONSUMO ÚNICO
        pendingDownloads.delete(key);
        return res.json({ status: 'ready' });
    }

    res.json({ status: data?.status || 'none' });
});

// --- FIM DA GERAÇÃO DE KEYS ---

app.post('/api/redeem-key', async (req, res) => {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Token inválido.' });

    try {
        // ATOMICO EM SQL: Busca e deleta imediatamente para evitar Replay/F5
        const { data: request, error: fetchError } = await supabase
            .from('key_requests')
            .delete()
            .eq('token', token)
            .select()
            .maybeSingle();

        if (fetchError || !request) return res.status(404).json({ error: 'Solicitação expirada ou inválida. Gere um novo botão no Discord.' });

        const crypto = require('crypto');
        const newKeyCode = `BOLT-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
        const { data: versionConfig } = await supabase.from('versions').select('*').eq('global_id', 'global').maybeSingle();

        const duration = versionConfig?.default_access_time || '4h'; // Duração da sessão

        let expiresToUseAt = new Date();
        expiresToUseAt.setHours(expiresToUseAt.getHours() + 24);

        const { data: newKey, error: insertError } = await supabase
            .from('keys')
            .insert({
                key: newKeyCode,
                duration: duration,
                generated_by: request.user_id,
                generated_by_tag: request.user_tag || null,
                generated_ip: request.ip || getClientIp(req),
                expires_to_use_at: expiresToUseAt.toISOString(),
                permissions_type: 'standard',
                permissions_value: null
            })
            .select()
            .single();

        if (insertError) throw insertError;

        res.json({ success: true, key: newKey.key, duration: newKey.duration, user: request.user_tag });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Erro interno ao gerar key.' });
    }
});

// Helper para verificar cooldown de IP antes de gerar key
app.use(['/api/generate-key', '/api/redeem-key'], (req, res, next) => {
    const ip = getClientIp(req);
    const now = Date.now();
    const lastGen = keyCooldowns.get(ip);

    // Cooldown de 60 segundos entre gerações do mesmo IP
    if (lastGen && (now - lastGen < 60000)) {
        const remaining = Math.ceil((60000 - (now - lastGen)) / 1000);
        return res.status(429).json({ error: `Aguarde ${remaining}s para gerar uma nova chave.` });
    }

    keyCooldowns.set(ip, now);
    next();
});

// Login / Validar Key
app.post('/api/validate', async (req, res) => {
    const { key, hwid } = req.body;
    if (!key) return res.status(400).json({ error: 'Key é obrigatória.' });

    try {
        const { data: keyData, error: keyError } = await supabase
            .from('keys')
            .select('*')
            .eq('key', key)
            .maybeSingle();

        if (keyError || !keyData) return res.status(404).json({ error: 'Key inválida.' });

        // --- VERIFICAÇÃO DE BLACKLIST ---
        const { data: userData } = await supabase
            .from('users')
            .select('*')
            .eq('hwid', hwid)
            .maybeSingle();

        if (userData && userData.is_blacklisted) {
            return res.status(403).json({
                error: 'Você foi banido! Vazou textura ou fez algo proibido.'
            });
        }

        const now = new Date();
        const clientIp = getClientIp(req);
        const permissions = { 
            type: keyData.permissions_type || 'standard', 
            value: keyData.permissions_value || 'all' 
        };

        // --- VINCULAÇÃO DE USUÁRIO (Opcional) ---
        if (keyData.generated_by) {
            try {
                // Se o usuário já tem um discord_id diferente, e o gerador não é o mesmo, 
                // pode ser uma key dada por um admin. Nesse caso, não sobrescrevemos o discord_id do usuário do HWID
                // a menos que o usuário atual no DB seja 'Unknown' ou nulo.
                
                const userPayload = {
                    hwid,
                    last_ip: clientIp,
                    updated_at: now.toISOString()
                };

                // Só vincula o Discord ID se o usuário ainda não tiver um ou se for o mesmo que gerou a key
                if (!userData?.discord_id || userData.discord_id === keyData.generated_by) {
                    userPayload.discord_id = keyData.generated_by;
                    userPayload.discord_tag = keyData.generated_by_tag || userData?.discord_tag || 'Unknown';
                }

                await supabase.from('users').upsert(userPayload, { onConflict: 'hwid' });
            } catch (updateErr) {
                console.error('Erro ao atualizar usuário:', updateErr);
            }
        }

        // --- TRAVA DE SERVIDOR REMOVIDA A PEDIDO DO CRIADOR ---

        // Se a key já foi usada
        if (keyData.is_used) {
            // Verificar trava de dispositivo (HWID)
            if (keyData.used_by && keyData.used_by !== hwid) {
                return res.status(403).json({ error: 'Esta key já está vinculada a outro computador.' });
            }

            // Verificar se expirou (se não for permanente)
            if (keyData.duration !== 'permanente' && keyData.expires_at && now > new Date(keyData.expires_at)) {
                return res.status(403).json({ error: 'Sua licença expirou.' });
            }

            // Atualizar last_ip e last_key_used
            await supabase.from('users').upsert({
                hwid,
                last_ip: clientIp,
                last_key_used: key,
                updated_at: now.toISOString()
            }, { onConflict: 'hwid' });

            return res.json({
                success: true,
                duration: keyData.duration,
                expiresAt: keyData.expires_at,
                permissions: permissions
            });
        }

        // Primeira vez usando a key (Resgate)
        const { applyDuration } = require('./utils/durationParser');
        const expirationDate = applyDuration(now, keyData.duration);

        const { error: updateKeyError } = await supabase
            .from('keys')
            .update({
                is_used: true,
                used_by: hwid,
                expires_at: expirationDate ? expirationDate.toISOString() : null
            })
            .eq('key', key);

        if (updateKeyError) throw updateKeyError;

        // Atualizar/Criar usuário no primeiro uso
        await supabase.from('users').upsert({
            hwid,
            discord_id: keyData.generated_by || null,
            discord_tag: keyData.generated_by_tag || null,
            last_ip: clientIp,
            last_key_used: key,
            updated_at: now.toISOString()
        }, { onConflict: 'hwid' });

        res.json({
            success: true,
            duration: keyData.duration,
            expiresAt: expirationDate ? expirationDate.toISOString() : null,
            permissions: permissions
        });
    } catch (error) {
        console.error('❌ [API] Erro na validação:', error);
        res.status(500).json({ error: `Erro interno: ${error.message || 'Desconhecido'}` });
    }
});

// Listar Texturas (Protegido)
app.post('/api/textures', async (req, res) => {
    const { key, hwid } = req.body;

    try {
        const { data: config } = await supabase.from('versions').select('*').eq('global_id', 'global').maybeSingle();

        // Atalho para pegar encurtador e VERSAO no login
        if (key === 'get_shortener') {
            return res.json({
                keyShortener: config?.key_shortener,
                version: config?.version || '1.0',
                stumbleGuysVersion: config?.stumble_guys_version || '1.0',
                stumbleCupsVersion: config?.stumble_cups_version || '1.0',
                keysChannelUrl: config?.keys_channel_url
            });
        }

        const { data: keyData, error: keyError } = await supabase.from('keys').select('*').eq('key', key).maybeSingle();
        if (keyError || !keyData || !keyData.is_used) return res.status(403).json({ error: 'Acesso negado.' });

        // Segurança: Verificar HWID em cada chamada de texturas
        if (keyData.used_by && keyData.used_by !== hwid) {
            return res.status(403).json({ error: 'Acesso bloqueado. Esta key pertence a outro dispositivo.' });
        }

        // Validação de tempo se não for permanente
        if (keyData.duration !== 'permanente' && keyData.expires_at && new Date() > new Date(keyData.expires_at)) {
            return res.status(403).json({ error: 'Sua licença expirou.' });
        }

        const permissions = { type: keyData.permissions_type || 'all', value: keyData.permissions_value || null };

        // Retornamos sempre TODAS as texturas
        const { data: textures } = await supabase.from('textures').select('*');

        // Mapear snake_case para o formato que o App espera (camelCase se necessário, ou manter conforme o App já lia)
        // O App lia as propriedades do Mongoose: profileImage, downloadUrl, etc.
        const mappedTextures = textures.map(t => ({
            ...t,
            _id: t.id.toString(), // Compatibilidade com o App
            profileImage: t.profile_image,
            downloadUrl: t.download_url,
            downloadUrlPart2: t.download_url_part2,
            shortenerUrl: t.shortener_url,
            removeUrlPart1: t.remove_url_part1,
            removeUrlPart2: t.remove_url_part2,
            isUpdated: t.is_updated
        }));

        res.json({
            textures: mappedTextures,
            permissions,
            version: config?.version || '1.0',
            stumbleGuysVersion: config?.stumble_guys_version || '1.0',
            stumbleCupsVersion: config?.stumble_cups_version || '1.0',
            keyShortener: config?.key_shortener,
            profileImage: config?.profile_image || 'https://i.imgur.com/YahM0Nf.png',
            targetFolderName: config?.target_folder_name || 'StumbleCups',
            removeUrlPart1: config?.remove_url_part1 || '',
            removeUrlPart2: config?.remove_url_part2 || '',
            downloadShortener: config?.download_shortener,
            keysChannelUrl: config?.keys_channel_url
        });
    } catch (error) {
        console.error('Erro ao buscar texturas:', error);
        res.status(500).json({ error: 'Erro ao buscar texturas.' });
    }
});

const PORT = process.env.PORT || 3000;
if (RUN_MODE === 'API' || RUN_MODE === 'ALL') {
    app.listen(PORT, () => {
        console.log(`📡 API para o Aplicativo rodando na porta ${PORT}`);
    });
}

app.get('/', (req, res) => res.send('API Online 💜'));

// --- SISTEMA DE DOWNLOAD SEGURO (TICKET ÚNICO) ---
app.get('/api/request-download-token', async (req, res) => {
    try {
        const { texture_id, hwid } = req.query;
        if (!texture_id || !hwid) return res.status(400).json({ error: 'Faltam parâmetros.' });

        const crypto = require('crypto');
        const token = crypto.randomBytes(16).toString('hex');
        const ip = getClientIp(req);

        // ANTI-BYPASS: Invalida tickets anteriores para esta textura no mesmo PC
        await supabase.from('download_tickets').delete().eq('hwid', hwid).eq('texture_id', texture_id);

        // Salva ticket no banco para segurança (persistência)
        await supabase.from('download_tickets').insert({
            token: token,
            texture_id: texture_id,
            hwid: hwid,
            ip: ip
        });

        res.json({ success: true, token });
    } catch (e) {
        res.status(500).json({ error: 'Erro ao preparar download.' });
    }
});

app.get('/api/verify-download', async (req, res) => {
    try {
        const { token, hwid } = req.query;
        if (!token) return res.status(400).json({ error: 'Token obrigatório.' });

        // 1. Verifica e consome o ticket imediatamente
        const { data: ticket, error } = await supabase
            .from('download_tickets')
            .delete()
            .eq('token', token)
            .select()
            .maybeSingle();

        if (error || !ticket) {
            return res.status(403).json({ error: 'Ticket de download expirado ou inválido.' });
        }

        console.log(`[Verify] Consumindo ticket para HWID: ${ticket.hwid}`);

        // 2. Registra o histórico no Supabase
        await supabase.from('download_history').insert({
            hwid: ticket.hwid,
            texture_id: ticket.texture_id,
            ip: getClientIp(req)
        });

        // 3. Autoriza no App (Mapa em memória)
        pendingDownloads.set(`${ticket.hwid}_${ticket.texture_id}`, {
            status: 'ready',
            timestamp: Date.now(),
            ip: getClientIp(req)
        });

        // 4. Busca a textura para retornar p1 e p2
        const { data: texture } = await supabase.from('textures').select('*').eq('id', ticket.texture_id).maybeSingle();
        
        console.log(`[Verify] Sucesso! Liberando textura: ${texture?.name || 'ID ' + ticket.texture_id}`);

        res.json({
            success: true,
            p1: texture?.download_url,
            p2: texture?.download_url_part2
        });
    } catch (e) {
        console.error('[Verify] Erro crítico:', e);
        res.status(500).json({ error: 'Erro ao processar download.' });
    }
});

// --- TAREFA DE LIMPEZA AUTOMÁTICA EM SEGUNDO PLANO ---
setInterval(async () => {
        try {
            const now = new Date().toISOString();
            
            // Limpar keys não usadas expiradas
            const { data: unusedDeleted } = await supabase
                .from('keys')
                .delete()
                .eq('is_used', false)
                .lt('expires_to_use_at', now)
                .select();

            // Limpar keys usadas expiradas
            const { data: usedDeleted } = await supabase
                .from('keys')
                .delete()
                .eq('is_used', true)
                .not('expires_at', 'is', null)
                .lt('expires_at', now)
                .select();

            // Limpar chaves que não expiram via tempo (se você quiser deletar as 'permanente' após meses, faria aqui)
            // Por enquanto, o sistema foca em chaves com prazo.

            // 1. Limpar tickets de download antigos (ex: mais de 1 hora)
            const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
            await supabase.from('download_tickets').delete().lt('created_at', oneHourAgo);

            // 2. Limpar solicitações de key antigas (tickets do site de keys)
            await supabase.from('key_requests').delete().lt('created_at', oneHourAgo);

            // 3. Limpar downloads pendentes na memória
            const nowMs = Date.now();
            for (const [key, value] of pendingDownloads.entries()) {
                if (nowMs - value.timestamp > 600000) {
                    pendingDownloads.delete(key);
                }
            }

            const u = unusedDeleted?.length || 0;
            const s = usedDeleted?.length || 0;
            if (u + s > 0) {
                console.log(`🧹 [Limpeza] Foram removidas ${u + s} chaves (Resgate: ${u} | Sessão: ${s})`);
            }
        } catch (e) { }
    }, 60000);

// Evento Ready
client.once(Events.ClientReady, async () => {
    try {
        console.log('🔄 Evento ClientReady disparado, iniciando setup...');

        const guild = client.guilds.cache.first();
        const serverName = guild ? guild.name : 'Nenhum servidor encontrado';
        const memberCount = guild ? guild.memberCount : 0;

        console.log(`\n💜 ########## STATUS DO BOT ##########`);
        console.log(`💜 Servidor: ${serverName}`);
        console.log(`   💜 Quantas pessoas no servidor: ${memberCount}`);
        console.log(`      💜 Database: Supabase (Online)`);
        console.log(`          💜 Criador By: bolttexturas\n`);

        if (RUN_MODE === 'BOT' || RUN_MODE === 'ALL') {
            // Registrar comandos apenas no modo BOT
            const commands = [
                new SlashCommandBuilder()
                    .setName('painel')
                    .setDescription('💜 Abre o painel administrativo (Apenas Admins).'),
                new SlashCommandBuilder()
                    .setName('keys')
                    .setDescription('💜 Cria o painel público de geração de keys (Apenas Admins).')
            ].map(command => command.toJSON());

            const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

            console.log('⏳ Registrando comandos globais...');
            await rest.put(
                Routes.applicationCommands(client.user.id),
                { body: commands },
            );
            console.log('✅ Comandos registrados com sucesso!');
        } else {
            console.log('ℹ️ Registro de comandos ignorado (Modo API).');
        }
    } catch (error) {
        console.error('❌ ERRO CRÍTICO no ClientReady:', error);
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
if (RUN_MODE === 'BOT' || RUN_MODE === 'ALL') {
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
                    return await painelHandler(interaction);
                }
                if (interaction.commandName === 'keys' || interaction.commandName === 'setup_keys') {
                    const uid = interaction.user.id;
                    const now = Date.now();
                    if (keysCommandCooldown.has(uid) && (now - keysCommandCooldown.get(uid)) < KEYS_COOLDOWN_MS) {
                        return interaction.reply({ content: '⏳ Aguarde alguns segundos antes de usar novamente.', flags: 64 });
                    }
                    keysCommandCooldown.set(uid, now);
                    return await keysPanelHandler.setupKeysPanel(interaction);
                }
            }

            // Botões e interações de componentes (processados apenas uma vez)
            if (interaction.isButton() && interaction.customId === 'public_gen_key') {
                return await keysPanelHandler.handleKeyGeneration(interaction);
            }

            if (interaction.isButton() || interaction.isStringSelectMenu() || interaction.isModalSubmit()) {
                return await interactionHandler(interaction);
            }
        } catch (error) {
            logger.error(`Erro na interação: ${error.message}`);
            if (error?.stack) {
                console.error(error.stack);
            }
            try {
                if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
                    const guildIcon = interaction.guild?.iconURL({ extension: 'png' }) || 'https://cdn.discordapp.com/embed/avatars/0.png';
                    const errorContainer = {
                        type: 17,
                        accent_color: 0xff0000,
                        components: [{
                            type: 9,
                            components: [{ type: 10, content: '## ❌ ERRO INTERNO\n> Ocorreu um erro ao processar esta ação.\n> -# Tente novamente em alguns segundos.' }],
                            accessory: { type: 11, media: { url: guildIcon } }
                        }]
                    };
                    await interaction.reply({ components: [errorContainer], flags: 64 | MessageFlags.IsComponentsV2 });
                }
            } catch (e) { }
        }
    });
}

// Debugar o que está acontecendo no Client do Discord (útil para ver problemas no Gateway)
client.on('debug', console.log);
client.on('warn', console.warn);
client.on('error', console.error);

if (RUN_MODE === 'BOT' || RUN_MODE === 'ALL') {
    console.log('🤖 Realizando pré-teste de conexão com o Discord (fetch puro)...');
    const ac = new AbortController();
    setTimeout(() => ac.abort(), 10000);
    fetch('https://discord.com/api/v10/gateway/bot', {
        headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` },
        signal: ac.signal
    }).then(res => {
        console.log('✅ Status do Discord:', res.status, res.statusText);
        return res.json().catch(() => null);
    }).then(data => {
        console.log('✅ Dados do Gateway:', data ? JSON.stringify(data) : 'Nenhum');
        console.log('🤖 Tentando conectar ao Discord Gateway via Client...');
        return client.login(process.env.DISCORD_TOKEN);
    }).then(() => {
        console.log('✅ Conexão estabelecida pelo Client.login!');
    }).catch(err => {
        console.error('\n❌ Falha na conexão (Pré-teste ou Client.login):');
        console.error(`> ${err.name}: ${err.message}`);
        if (err.cause) console.error('> Causa interna:', err.cause);
    });
}

