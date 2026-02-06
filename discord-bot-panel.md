# Plano: Discord Bot TexturasBolt - Painel Administrativo v2

> Sistema de gerenciamento de texturas e versões via Discord interagindo com MongoDB, utilizando o novo padrão de componentes v2 do Discord.

## 📋 Visão Geral
Este projeto consiste em um Bot de Discord modularizado focado em uma experiência de usuário (UX) premium ("Components v2"). O bot gerenciará versões de um aplicativo futuro e o inventário de texturas (links de download e encurtadores) armazenados em um banco de dados MongoDB.

## 🏗️ Tipo de Projeto: BACKEND + DISCORD BOT
- **Linguagem:** JavaScript (Node.js)
- **Biblioteca:** `discord.js` (v14+)
- **Banco de Dados:** MongoDB (Mongoose)

## 🎯 Critérios de Sucesso
- [ ] Painel principal renderizado com Components v2 (Banners, Select Menus integrados).
- [ ] Sistema de atualização de versão via Modal.
- [ ] CRUD completo de texturas (Criar, Listar/Gerenciar, Remover).
- [ ] Integração segura com MongoDB Atlas via `.env`.
- [ ] Interface visual respeitando a cor `#c773ff` e design premium.
- [ ] Log de segurança: Token e URI do DB ocultos do código fonte.

## 🛠️ Tech Stack
- **discord.js**: Principal para interações com o Discord.
- **mongoose**: Modelagem e conexão com MongoDB.
- **dotenv**: Gerenciamento de segredos.
- **nodemon**: Desenvolvimento contínuo.

## 📁 Estrutura de Arquivos Proposta
```plaintext
TexturasBolt/
├── .env                # Segredos (Token, Mongo URI)
├── .gitignore          # Ignorar node_modules e .env
├── package.json        # Dependências
├── src/
│   ├── index.js        # Ponto de entrada
│   ├── database/
│   │   ├── connect.js  # Conexão Mongo
│   │   └── models/
│   │       ├── Version.js # Schema de Versão
│   │       └── Texture.js # Schema de Textura
│   ├── discord/
│   │   ├── client.js   # Configuração do bot
│   │   ├── commands/   # Slash commands (/painel)
│   │   ├── handlers/   # Handlers de interações (botões, menus, modals)
│   │   └── components/ # Templates de componentes v2
│   └── utils/
│       └── logger.js   # Logs formatados
```

## 📝 Divisão de Tarefas

### Fase 1: Fundação & Banco de Dados (P0)
- **Tarefa 1.1:** Inicializar projeto Node.js e instalar dependências (`discord.js`, `mongoose`, `dotenv`).
  - **Agente:** `backend-specialist`
  - **Skill:** `nodejs-best-practices`
- **Tarefa 1.2:** Configurar arquivo `.env` com as credenciais fornecidas pelo usuário.
  - **Agente:** `security-auditor`
  - **Skill:** `vulnerability-scanner`
- **Tarefa 1.3:** Implementar conexão com MongoDB e Schemas (`Version` e `Texture`).
  - **Agente:** `database-architect`
  - **Skill:** `database-design`

### Fase 2: Estrutura do Bot & Slash Command (P1)
- **Tarefa 2.1:** Configurar cliente Discord e registro do comando `/painel`.
  - **Agente:** `backend-specialist`
  - **Skill:** `api-patterns`
- **Tarefa 2.2:** Desenvolver o "Painel Principal" (Components v2) com Select Menu (Versão, Texturas, Gerenciar).
  - **Agente:** `frontend-specialist` (para lógica de UI de componentes)
  - **Skill:** `frontend-design`

### Fase 3: Lógica de Negócio & Modais (P2)
- **Tarefa 3.1:** Implementar fluxo de Gerenciamento de Versão (Modal -> Banco de Dados -> Update Painel).
  - **Agente:** `backend-specialist`
  - **Skill:** `clean-code`
- **Tarefa 3.2:** Implementar Criação de Texturas (Modal com Nome, Download e Encurtador).
  - **Agente:** `backend-specialist`
  - **Skill:** `nodejs-best-practices`
- **Tarefa 3.3:** Implementar Remoção de Texturas (Efémera com Select Menu).
  - **Agente:** `backend-specialist`
  - **Skill:** `clean-code`

### Fase 4: Polimento & UX (P3)
- **Tarefa 4.1:** Estilização final (cores `#c773ff`, banners dinâmicos, separadores).
  - **Agente:** `frontend-specialist`
  - **Skill:** `ui-ux-pro-max`
- **Tarefa 4.2:** Tratamento de erros global e mensagens de feedback (Sucesso/Erro).
  - **Agente:** `test-engineer`
  - **Skill:** `systematic-debugging`

## 🏁 Phase X: Verificação Final
- [ ] Executar `security_scan.py` para validar `.env`.
- [ ] Testar todas as interações do painel.
- [ ] Verificar persistência no MongoDB.
- [ ] Auditoria de design (Componentes v2).

---
**Autor:** Antigravity AI
**Status:** Pronto para iniciar Fase 1.
