export interface LocationJSON {
  uri?: string;
  line?: number;
}

export type ResolveDefinitionResponse = LocationJSON;

export interface GlobalDocumentationResponse {
  content?: string | string[] | Record<string, unknown> | null;
  message?: string;
}

export interface ResolveContextExpressionResponse {
  status?: string;
  textExpression?: string;
  message?: string;
}

export type ResolveContextExpressionResult = ResolveContextExpressionResponse | GlobalDocumentationResponse | string;

export interface SourceControlError {
  message: string;
  cause?: unknown;
}
export interface CreateItemResponse {
  item?: Record<string, unknown>;
  name?: string;
  documentName?: string;
  namespace?: string;
  module?: string;
  message?: string;
  path?: string;
  uri?: string;
}
