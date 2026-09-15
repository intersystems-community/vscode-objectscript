<p align="center">
  <img alt="Consistem" src="images/logo-consistem-horizontal.png" width="280" />
</p>

# Consistem ObjectScript — extensão para VS Code

[![Release](https://img.shields.io/github/v/release/consistem/vscode-objectscript?include_prereleases&label=release)](https://github.com/consistem/vscode-objectscript/releases)
[![Documentação](https://img.shields.io/badge/Documenta%C3%A7%C3%A3o-Cuka-blue)](https://cuka.consistem.com.br/doc/vs-code-ambiente-de-desenvolvimento-consistem-6rRtIWzvzz)
[![Consistem](https://img.shields.io/badge/Consistem-Website-brightgreen)](https://consistem.com.br/)
[![InterSystems IRIS](https://img.shields.io/badge/InterSystems-IRIS-blue.svg)](https://www.intersystems.com/products/intersystems-iris/)

> **Documentação da extensão:** [VS Code — Ambiente de Desenvolvimento Consistem](https://cuka.consistem.com.br/doc/vs-code-ambiente-de-desenvolvimento-consistem-6rRtIWzvzz) (Cuka).
> Comece por ali: a página reúne a configuração do ambiente, os recursos criados pela Consistem e a resolução dos erros mais comuns.

> **Importante:** esta extensão **não é publicada no Visual Studio Marketplace**. A distribuição é feita por VSIX nas
> [releases do GitHub](https://github.com/consistem/vscode-objectscript/releases). Não instale o pacote público
> `InterSystems ObjectScript Extension Pack` — ele traz a extensão original, que conflita com este fork.

## Sobre

Suporte à linguagem [InterSystems&reg;](http://www.intersystems.com) ObjectScript no Visual Studio Code, com as
integrações e os padrões internos usados no desenvolvimento do Consistem ERP.

### Fork da Consistem

Este repositório é um fork do projeto [`intersystems-community/vscode-objectscript`](https://github.com/intersystems-community/vscode-objectscript),
mantido pela comunidade de desenvolvedores InterSystems.

O fork é mantido pela [Consistem&reg;](https://consistem.com.br/), preserva todos os recursos do projeto original e
acrescenta integrações, ajustes e padrões internos voltados às necessidades do nosso ecossistema de desenvolvimento.
As customizações ficam isoladas em [`src/ccs/`](src/ccs/) para facilitar a sincronização periódica com o upstream.

## Documentação

**Consistem**

- [VS Code — Ambiente de Desenvolvimento Consistem](https://cuka.consistem.com.br/doc/vs-code-ambiente-de-desenvolvimento-consistem-6rRtIWzvzz) — página principal
- [Configuração do ambiente de desenvolvimento](https://cuka.consistem.com.br/doc/configuracao-do-ambiente-de-desenvolvimento-consistem-iqzsJjpwG5)
- [Conheça as funcionalidades implementadas pela Consistem](https://cuka.consistem.com.br/doc/conheca-as-funcionalidades-implementadas-pela-consistem-522jh8dn92)
- [Testes unitários](https://cuka.consistem.com.br/doc/testes-unitarios-9VovcmkULe)
- [Resolução de erros](https://cuka.consistem.com.br/doc/resolucao-de-erros-uFVNgLxrjz)

**InterSystems**

- [Using VS Code with InterSystems Products](https://docs.intersystems.com/components/csp/docbook/DocBook.UI.Page.cls?KEY=GVSCO)
- [Como reportar problemas no projeto original](https://docs.intersystems.com/components/csp/docbook/DocBook.UI.Page.cls?KEY=GVSCO_reporting)

Problemas **deste fork** devem ser reportados nas [issues do repositório](https://github.com/consistem/vscode-objectscript/issues).

## Instalação

Instale antes o [Visual Studio Code](https://code.visualstudio.com/).

A extensão depende de outros dois forks mantidos pela Consistem, que também são distribuídos por VSIX:

| Extensão | Identificador | Releases |
| --- | --- | --- |
| Consistem Server Manager (**obrigatória**) | `consistem-sistemas.consistem-servermanager` | [consistem/intersystems-servermanager](https://github.com/consistem/intersystems-servermanager/releases) |
| Consistem Language Server (recomendada) | `consistem-sistemas.consistem-language-server` | [consistem/language-server](https://github.com/consistem/language-server/releases) |
| Consistem ObjectScript (este repositório) | `consistem-sistemas.consistem-vscode-objectscript` | [consistem/vscode-objectscript](https://github.com/consistem/vscode-objectscript/releases) |

Passo a passo:

1. Baixe o VSIX de cada uma das três extensões na página de releases correspondente.
2. Instale o **Server Manager primeiro** — ele é uma dependência declarada e o VS Code recusa a instalação deste fork sem ele.
3. Instale o Language Server e, por último, o Consistem ObjectScript. Uma forma prática de instalar um VSIX é arrastá-lo
   da pasta de downloads para a lista de extensões na visão **Extensões** (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>X</kbd>).
4. Configure a conexão com o servidor pelo Server Manager e siga a
   [configuração do ambiente](https://cuka.consistem.com.br/doc/configuracao-do-ambiente-de-desenvolvimento-consistem-iqzsJjpwG5).

Como a instalação é por VSIX, **não há atualização automática**: para atualizar, baixe e instale o VSIX mais recente.

## Recursos

### Herdados do projeto original

- Realce de sintaxe para ObjectScript.
- Depuração de código ObjectScript.
- IntelliSense para comandos, funções de sistema e membros de classe.
- Exportação de fontes do servidor para a pasta de trabalho:
  - abra a Paleta de Comandos (<kbd>F1</kbd> ou <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd>)
  - digite `ObjectScript`
  - escolha `ObjectScript: Export Code from Server`
- Salvar e compilar uma classe:
  - <kbd>Ctrl</kbd>+<kbd>F7</kbd> (compilar o arquivo atual) ou <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>F7</kbd> (compilar todos)
  - ou `ObjectScript: Import and Compile Current File` na Paleta de Comandos
- Edição e visualização do código direto no servidor pelo Explorador do VS Code, através dos FileSystemProviders
  `isfs` e `isfs-readonly` (ex.: usando um [workspace multi-raiz](https://code.visualstudio.com/docs/editor/multi-root-workspaces)).
  O controle de fontes do lado do servidor é respeitado.
- Visões **Explorer** e **Projects** (dentro do container do Server Manager), com exportação de itens para a pasta de trabalho.
- Integração com o Server Manager para armazenamento seguro das senhas de conexão.
- Execução de testes unitários integrada à visão **Testing** do VS Code.

### Adicionados pela Consistem

Os comandos abaixo aparecem na Paleta de Comandos sob a categoria **Consistem** e dependem de uma conexão ativa com o
servidor — eles conversam com a API interna de controle de fontes (`/api/sourcecontrol/vscode`), derivada da conexão
Atelier em uso.

| Comando | Atalho | O que faz |
| --- | --- | --- |
| Criar Item | <kbd>Ctrl</kbd>+<kbd>N</kbd> | Cria a classe/rotina no servidor pelo padrão Consistem e abre o arquivo local correspondente. |
| Ir para Definição | <kbd>F12</kbd> | Resolve o símbolo pela lógica interna da Consistem, com retorno ao comportamento nativo do VS Code quando não houver resolução. |
| Ir para Definição (+linha ^Item) | — | Salta para `label+deslocamento` entre rotinas e classes. No Quick Pick, <kbd>Tab</kbd> insere a seleção. |
| Seguir Link de Definição | — | Abre o destino dos links de definição reconhecidos no código. |
| Seguir Link de Análise de Código-Fonte | — | Abre o destino dos links de análise de código-fonte. |
| Ajuda de Contexto | <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>Espaço</kbd> | Resolve a expressão selecionada (ou a da linha), exibe a prévia e pode inserir o texto resultante. |
| Documentação Global | <kbd>Ctrl</kbd>+<kbd>Q</kbd> | Traz a documentação da global em arquivo ou no painel **Saída**, conforme a configuração. |
| Localizar Gatilhos | — | Lista os gatilhos da rotina e abre a posição escolhida. |
| Localizar Gatilhos por Empresa | — | Lista as contas/empresas com gatilho para a rotina e a quantidade em cada uma. |
| Converter Item | — | Executa a conversão padrão do item ativo. |
| Converter Item Customizado | — | Executa a conversão com as opções escolhidas na hora. |
| Versões do Item - Analizar | — | Mostra a análise de versões do item ativo. |
| Atualizar Config. / Gerar Backup | — | Atualiza as configurações no servidor e gera o backup correspondente. |
| Regerar Base de Testes | — | Lista as bases de teste montadas e regera a escolhida. |
| Reativar Conexões de Namespaces (categoria `ObjectScript`) | — | Revalida as conexões dos namespaces configurados no workspace. |

Além dos comandos, o fork acrescenta:

- **Conversão automática ao salvar**, ligada por padrão e com pacotes exclusos configuráveis.
- **Snippets Consistem** em [`snippets/consistem-objectscript.json`](snippets/consistem-objectscript.json).
- **Reativação automática das conexões de namespace** ao abrir o workspace.

### Testes unitários

A execução de testes usa o executor interno da Consistem, acessível pela visão **Testing** do VS Code. O executor
agrupa as classes selecionadas pela base de dados que cada uma exige e roda cada grupo no namespace correspondente;
classes que não dependem de base rodam sem ela. Quando a base exigida não está montada, a extensão oferece gerá-la
antes de executar — e quando mais de um namespace atende à mesma base, pergunta onde executar.

O comando **Consistem: Regerar Base de Testes** lista as bases já montadas e regera a escolhida.
A confirmação é modal porque a operação **exclui e recria o namespace** a partir do checkout: todos os dados atuais
daquela base são perdidos, a operação leva alguns minutos e não há como desfazer.

Detalhes de uso em [Testes Unitários](https://cuka.consistem.com.br/doc/testes-unitarios-9VovcmkULe).

## Configurações

Além de todas as configurações `objectscript.*` do projeto original, o fork acrescenta:

| Configuração | Padrão | Descrição |
| --- | --- | --- |
| `consistem.globalDocumentation.openInFile` | `true` | Abre a documentação global em um arquivo em vez do painel **Saída**. |
| `consistem.globalDocumentation.filePath` | `""` | Arquivo onde a documentação global é gravada. Caminhos relativos são resolvidos a partir do diretório temporário do sistema (`%TEMP%` no Windows). |
| `consistem.converterItem.autoConvertOnSave` | `true` | Converte o item automaticamente ao salvar. |
| `consistem.converterItem.autoConvertExcludePackages` | `["cswutil70", "cswutil80"]` | Pacotes ignorados pela conversão automática ao salvar. |
| `consistem.converterItem.timeout` | `180000` | Tempo limite (ms) das chamadas de conversão. `0` desativa o limite. |
| `objectscript.unitTest.incluirAsserts` | `"somenteFalhas"` | Quais asserts o executor retorna. `somenteFalhas` reduz bastante o volume de dados em classes que passam. |
| `objectscript.unitTest.legacyRequestTimeout` | `600000` | Tempo limite (ms) por classe de teste executada. `0` desativa o limite. |
| `objectscript.unitTest.usarExecutorAntigo` | `false` | Volta ao executor anterior, que sempre executa no namespace `TESTEUNITARIO`. Temporário, apenas para rollback. |

Há ainda configurações avançadas lidas em [`src/ccs/config/settings.ts`](src/ccs/config/settings.ts) que não aparecem
na interface de configurações e normalmente não precisam ser alteradas: `objectscript.ccs.endpoint` (sobrescreve a URL
base da API interna, derivada da conexão Atelier ativa), `objectscript.ccs.requestTimeout`,
`objectscript.ccs.debugLogging` e `objectscript.ccs.flags`.

## Habilitar APIs propostas

A extensão consegue aproveitar algumas APIs do VS Code ainda não finalizadas. Os recursos adicionais (e as APIs usadas) são:

- [Busca entre arquivos](https://code.visualstudio.com/docs/editor/codebasics#_search-across-files) no lado do servidor
  para arquivos acessados via `isfs` (_TextSearchProvider_)
- [Quick Open](https://code.visualstudio.com/docs/getstarted/tips-and-tricks#_quick-open) de arquivos `isfs` (_FileSearchProvider_)

Os VSIX de **release** (tags `vX.Y.Z`) são publicados sem as APIs propostas; as **betas** (tags `vX.Y.Z-beta.N`), geradas
a cada push, mantêm as APIs habilitadas. Para liberar esses recursos (opcional):

1. Baixe a versão beta nas [releases do GitHub](https://github.com/consistem/vscode-objectscript/releases).
   - Localize a beta imediatamente acima da release instalada. Por exemplo, se você instalou a `3.8.3`, procure por `3.8.3-beta.N`.
     Ela é funcionalmente idêntica, exceto por poder usar as APIs propostas.
   - Baixe o VSIX (ex.: `consistem-vscode-objectscript-3.8.3-beta.6.vsix`) e instale-o.
2. Na [Paleta de Comandos](https://code.visualstudio.com/docs/getstarted/tips-and-tricks#_command-palette), escolha
   `Preferences: Configure Runtime Arguments`.
3. No `argv.json` que abrir, acrescente a linha abaixo (necessária tanto no VS Code Stable quanto no Insiders):

```json
"enable-proposed-api": ["consistem-sistemas.consistem-vscode-objectscript"]
```

4. Feche e reabra o VS Code.
5. Confira se o canal **ObjectScript** do painel **Saída** informa:

```
consistem-sistemas.consistem-vscode-objectscript version X.Y.Z-beta.N activating with proposed APIs available.
```

Depois de atualizar a extensão, basta baixar e instalar o novo VSIX beta — os demais passos não precisam ser repetidos.

## Notas e solução de problemas

- As mensagens relacionadas à conexão aparecem na visão **Saída**, no canal **ObjectScript** (selecionado pelo menu
  suspenso na barra de título da visão).

- A aplicação web `/api/atelier/` usada pela extensão normalmente exige que o usuário autenticado tenha permissão de uso
  sobre o recurso `%Development` ([leia mais](https://community.intersystems.com/post/using-atelier-rest-api)). Uma forma
  de conceder isso é atribuir o papel `%Developer` ao usuário.

- Se aparecer `ERROR # 5540: SQLCODE: -99 Message: User xxx is not privileged for the operation` ao obter ou atualizar as
  listas de classes, rotinas ou includes, conceda ao usuário `xxx` (ou a um papel SQL dele) permissão de execução sobre o
  procedimento SQL abaixo, no namespace de destino:

```SQL
GRANT EXECUTE ON %Library.RoutineMgr_StudioOpenDialog TO xxx
```

- Outros erros comuns (conexão com o banco, namespace inativo, troca de senha do Windows, instabilidade de rede) estão
  documentados em [Resolução de Erros](https://cuka.consistem.com.br/doc/resolucao-de-erros-uFVNgLxrjz).

## Desenvolvimento

Pré-requisitos, fluxo de trabalho e padrões de branch e de commit estão em [CONTRIBUTING.md](CONTRIBUTING.md).
Convenções para agentes de IA e organização dos módulos estão em [AGENTS.md](AGENTS.md).

```sh
git clone https://github.com/consistem/vscode-objectscript
cd vscode-objectscript
npm install

npm run compile      # build de produção (webpack + tsc)
npm run webpack-dev  # build em watch
npm run lint         # ESLint em src/**
npm test             # testes de integração (VS Code + Mocha)
npm run package      # gera o .vsix
```

## Licença

[MIT](LICENSE).

Projeto original mantido pela [InterSystems Developer Community](https://community.intersystems.com/) —
veja o [CHANGELOG](CHANGELOG.md) para o histórico de versões deste fork e do upstream.
