# rubinot-monitor

Bot que monitora o level dos membros da guild no RubinOT e notifica no Discord via webhook.

## Como fazer deploy no Railway

### 1. Sobe o projeto no GitHub

```bash
git init
git add .
git commit -m "first commit"
git remote add origin https://github.com/SEU_USUARIO/rubinot-monitor.git
git push -u origin main
```

### 2. Cria o projeto no Railway

- Acesse [railway.app](https://railway.app) e faça login
- Clique em **New Project → Deploy from GitHub repo**
- Selecione o repositório `rubinot-monitor`
- O Railway detecta o `Dockerfile` automaticamente

### 3. Configura a variável de ambiente

No painel do Railway, vá em **Variables** e adicione:

```
WEBHOOK_URL=https://discord.com/api/webhooks/SEU_WEBHOOK_AQUI
```

### 4. Deploy

O Railway faz o build e sobe automaticamente. Pronto!

## Variáveis de ambiente

| Variável | Descrição |
|---|---|
| `WEBHOOK_URL` | URL do webhook do Discord |

## Funcionamento

- Verifica o level de cada personagem a cada **5 minutos**
- Envia embed verde no Discord em caso de **level up**
- Envia embed vermelho no Discord em caso de **morte** (perda de level)
- Os levels são persistidos em `levels.json`
