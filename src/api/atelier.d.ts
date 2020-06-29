/**
 * Atelier API
 */

interface ResponseStatus {
  errors: string[];
  summary: string;
}

interface ResponseResult<T> {
  content: T;
}

export interface Response<T = any> {
  status: ResponseStatus;
  console: string[];
  result: ResponseResult<T>;
}

interface ServerInfoFeature {
  name: string;
  enabled: string;
}

export interface ServerInfo {
  version: string;
  id: string;
  api: number;
  features: ServerInfoFeature[];
  namespaces: string[];
}

export interface AtelierSearchMatch {
  text: string;
  line?: number;
  member?: string;
  attr?: string;
  attrline?: number;
}

export interface AtelierSearchResult {
  doc: string;
  matches: AtelierSearchMatch[];
}

export interface AtelierJob {
  pid: number;
  namespace: string;
  routine: string;
  state: string;
  device: string;
}
