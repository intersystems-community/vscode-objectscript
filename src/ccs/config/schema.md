# Configuração do módulo CCS

As opções abaixo controlam as integrações específicas para o fork da Consistem.

| Chave                                     | Tipo                      | Padrão         | Descrição                                                                                                         |
| ----------------------------------------- | ------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------- |
| `objectscript.ccs.endpoint`               | `string`                  | `undefined`    | URL base alternativa para a API. Se não definida, a URL é derivada da conexão ativa do Atelier.                 |
| `objectscript.ccs.requestTimeout`         | `number`                  | `5000`         | Tempo limite (ms) aplicado às chamadas HTTP do módulo. Valores menores ou inválidos são normalizados para zero. |
| `objectscript.ccs.debugLogging`           | `boolean`                 | `false`        | Quando verdadeiro, registra mensagens detalhadas no `ObjectScript` Output Channel.                               |
| `objectscript.ccs.flags`                  | `Record<string, boolean>` | `{}`           | Feature flags opcionais que podem ser lidas pelas features do módulo.                                            |
| `consistem.converterItem.autoConvertOnSave`          | `boolean`                 | `true`         | Quando verdadeiro, executa a conversão simples ao salvar arquivos `.mac`.                                        |
| `consistem.converterItem.autoConvertExcludePackages` | `string[]`                | `["cswutil70"]` | Lista de pacotes/pastas excluídos da conversão automática ao salvar.                                              |

> Compatibilidade: as chaves antigas `objectscript.ccs.autoConvertOnSave` e
> `objectscript.ccs.autoConvertExcludePackages` ainda são lidas como fallback.

Essas configurações não exigem reload da janela; toda leitura é feita sob demanda.
