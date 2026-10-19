# Restaura App

Gestão do Estúdio Restaura num app só: funil de negócios (Kanban), leads e contatos,
agenda sincronizável e financeiro.

```bash
npm install
npx vercel@latest env pull .env.local   # credenciais do Neon e segredos
npm run db:push                          # aplica o schema
npm run db:seed                          # etapas do funil + admin inicial
npm run dev                              # http://localhost:3021
```

Detalhes de arquitetura e regras em [CLAUDE.md](CLAUDE.md).
