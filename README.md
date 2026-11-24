# Dashboard de indicadores de suporte

Painel em React, TypeScript e TanStack Start para acompanhar chamados, volume por horário e produtividade da equipe. O painel inclui filtro de período, ranking de atendentes e evolução individual.

## Executar localmente

```sh
bun install --frozen-lockfile
bun run dev
```

## Build

```sh
bun run build
```

O build usa dados simulados, identificados na interface como **Modo demonstração**. A integração direta com a Digisac em desenvolvimento é legada. Para usar dados reais em um ambiente publicado, a integração precisa executar no servidor, com credenciais privadas e autenticação para acessar o painel.
