export const BASE_PATH = "/api/sourcecontrol/vscode" as const;

export const ROUTES = {
  resolveContextExpression: () => `/resolveContextExpression`,
  getGlobalDocumentation: () => `/getGlobalDocumentation`,
  resolveDefinition: (namespace: string) => `/namespaces/${encodeURIComponent(namespace)}/resolveDefinition`,
  createItem: (namespace: string) => `/namespaces/${encodeURIComponent(namespace)}/createItem`,
  runUnitTests: (namespace: string) => `/namespaces/${encodeURIComponent(namespace)}/unitTests/runUnitTests`,
  locateTriggers: (namespace: string) => `/namespaces/${encodeURIComponent(namespace)}/localizarGatilhos`,
  getTriggerCompanies: (namespace: string) => `/namespaces/${encodeURIComponent(namespace)}/obterGatilhosPorEmpresa`,
} as const;

export type RouteKey = keyof typeof ROUTES;
