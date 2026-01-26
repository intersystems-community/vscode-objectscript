# Contribuindo para o `vscode-objectscript` (fork Consistem)

Este repositório é um fork do `intersystems-community/vscode-objectscript`. As customizações da Consistem devem, sempre que possível, ficar isoladas em `src/ccs/` para reduzir conflitos quando atualizarmos o upstream.

## Pré-requisitos

1. [Node.js](https://nodejs.org/) 18.x
2. Windows, macOS ou Linux
3. [Visual Studio Code](https://code.visualstudio.com/)
4. Extensões do VS Code:
   - [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint)
   - [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)
   - [EditorConfig for VS Code](https://marketplace.visualstudio.com/items?itemName=EditorConfig.EditorConfig)

## Setup

```sh
git clone https://github.com/consistem/vscode-objectscript
cd vscode-objectscript
npm install
```

## Fluxo de Desenvolvimento

- Abra a pasta do projeto no VS Code.
- Use `Run and Debug` → `Launch Extension` (ou `Launch Extension Alone`) para abrir um `[Extension Development Host]` e validar as mudanças.
- Erros/avisos TypeScript aparecem no painel `PROBLEMS`.

Comandos úteis:

```sh
npm run compile     # build de produção (webpack + tsc)
npm run webpack-dev # build em watch (webpack)
npm run watch       # typecheck em watch (tsc)
npm run lint        # ESLint em src/**
npm test            # testes de integração (VS Code + Mocha)
```

## Snippets

Os snippets ficam em `snippets/`:

- `snippets/objectscript-class.json`: contexto de definição de classes
- `snippets/objectscript.json`: ObjectScript (geral)
- `snippets/consistem-objectscript.json`: snippets específicos do fork Consistem

Referência de sintaxe: https://code.visualstudio.com/docs/editor/userdefinedsnippets

## Customizações Consistem (src/ccs)

- Implementações específicas devem morar em `src/ccs/` (comandos, providers e integrações internas).
- Conexões internas são derivadas da conexão ativa do Atelier, com override opcional por `objectscript.ccs.endpoint`.
- Quando uma feature “substitui” comportamento padrão (ex.: F12/Ctrl+Click), mantenha fallback para o comportamento nativo do VS Code quando a resolução interna falhar.

## Branches, Commits e Pull Requests

- Trabalhe em uma branch (não faça commit direto em `master`).
- Branches principais:
  - `master`: linha principal (CI e releases).
  - `prerelease`: linha de pré-release (quando aplicável).
- Commits: siga o padrão do histórico do repositório (assunto imperativo; muitas vezes com referência `(#NN)`).
- PRs devem incluir: descrição objetiva, motivação, como testar (passos), e screenshots para alterações visuais (webview/UI).
- O CI precisa estar verde; PRs geram artefatos `.vsix` nos workflows do GitHub Actions para teste manual.

## Build Local (VSIX)

```sh
npm install -g vsce
npm install
npm run package
```

Isso gera um arquivo `vscode-objectscript-$VERSION.vsix` na raiz do projeto.
