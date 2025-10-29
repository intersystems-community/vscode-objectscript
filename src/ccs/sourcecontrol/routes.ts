export const BASE_PATH = "/api/sourcecontrol/vscode" as const;

export const ROUTES = {
  resolveContextExpression: () => `/resolveContextExpression`,
  getGlobalDocumentation: () => `/getGlobalDocumentation`,
  resolveDefinition: (namespace: string) => `/namespaces/${encodeURIComponent(namespace)}/resolveDefinition`,
  createItem: (namespace: string) => `/namespaces/${encodeURIComponent(namespace)}/createItem`,
} as const;

export type RouteKey = keyof typeof ROUTES;
