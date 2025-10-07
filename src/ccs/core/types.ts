export interface LocationJSON {
  uri?: string;
  line?: number;
}

export type ResolveDefinitionResponse = LocationJSON;

export interface ResolveContextExpressionResponse {
  status?: string;
  textExpression?: string;
  message?: string;
}

export interface SourceControlError {
  message: string;
  cause?: unknown;
}
export interface GlobalDocumentationResponse {
  content?: string | string[] | Record<string, unknown> | null;
  message?: string;
}
