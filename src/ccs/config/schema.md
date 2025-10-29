# Configuração do módulo CCS

As opções abaixo ficam no escopo `objectscript.ccs` e controlam as integrações específicas
para o fork da Consistem.

| Chave            | Tipo                      | Padrão      | Descrição                                                                                                       |
| ---------------- | ------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------- |
| `endpoint`       | `string`                  | `undefined` | URL base alternativa para a API. Se não definida, a URL é derivada da conexão ativa do Atelier.                 |
| `requestTimeout` | `number`                  | `5000`       | Tempo limite (ms) aplicado às chamadas HTTP do módulo. Valores menores ou inválidos são normalizados para zero. |
| `debugLogging`   | `boolean`                 | `false`     | Quando verdadeiro, registra mensagens detalhadas no `ObjectScript` Output Channel.                              |
| `flags`          | `Record<string, boolean>` | `{}`        | Feature flags opcionais que podem ser lidas pelas features do módulo.                                           |

Essas configurações não exigem reload da janela; toda leitura é feita sob demanda.
