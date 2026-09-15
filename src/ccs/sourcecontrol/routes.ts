export const BASE_PATH = "/api/sourcecontrol/vscode" as const;

export const ROUTES = {
  resolveContextExpression: () => `/resolveContextExpression`,
  getGlobalDocumentation: () => `/getGlobalDocumentation`,
  resolveDefinition: (namespace: string) => `/namespaces/${encodeURIComponent(namespace)}/resolveDefinition`,
  createItem: (namespace: string) => `/namespaces/${encodeURIComponent(namespace)}/createItem`,
  runUnitTests: (namespace: string) => `/namespaces/${encodeURIComponent(namespace)}/unitTests/runUnitTests`,
  locateTriggers: (namespace: string) => `/namespaces/${encodeURIComponent(namespace)}/localizarGatilhos`,
  getTriggerCompanies: (namespace: string) => `/namespaces/${encodeURIComponent(namespace)}/obterGatilhosPorEmpresa`,
  converterArquivo: (namespace: string) => `/namespaces/${encodeURIComponent(namespace)}/converterArquivo`,
  converterArquivoCustomizado: (namespace: string) =>
    `/namespaces/${encodeURIComponent(namespace)}/converterArquivoCustomizado`,
  analizarVersaoItem: (namespace: string) => `/namespaces/${encodeURIComponent(namespace)}/analizarVersaoItem`,
  atualizarConfig: (namespace: string) => `/namespaces/${encodeURIComponent(namespace)}/atualizarConfig`,
  resolveUnitTests: (namespace: string) => `/namespaces/${encodeURIComponent(namespace)}/unitTests/resolve`,
  executarClasseTeste: (namespace: string) => `/namespaces/${encodeURIComponent(namespace)}/unitTests/executarClasse`,
  situacaoExecucaoTeste: (namespace: string, idExecucao: string) =>
    `/namespaces/${encodeURIComponent(namespace)}/unitTests/execucao/${encodeURIComponent(idExecucao)}`,
  paginaResultadoTeste: (namespace: string, idExecucao: string) =>
    `/namespaces/${encodeURIComponent(namespace)}/unitTests/resultado/${encodeURIComponent(idExecucao)}`,
  gerarBaseTeste: (namespace: string) => `/namespaces/${encodeURIComponent(namespace)}/unitTests/gerarBase`,
  listarBasesTeste: (namespace: string) => `/namespaces/${encodeURIComponent(namespace)}/unitTests/bases`,
  regerarBaseTeste: (namespace: string) => `/namespaces/${encodeURIComponent(namespace)}/unitTests/bases/regerar`,
  prepararAmbienteTeste: (namespace: string) =>
    `/namespaces/${encodeURIComponent(namespace)}/unitTests/prepararAmbiente`,
  situacaoGeracaoBase: (namespace: string, idGeracao: string) =>
    `/namespaces/${encodeURIComponent(namespace)}/unitTests/gerarBase/${encodeURIComponent(idGeracao)}`,
} as const;

export type RouteKey = keyof typeof ROUTES;
