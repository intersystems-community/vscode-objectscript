/**
 * Atelier API
 */

interface ResponseStatus {
  errors: string[];
  summary: string;
}

interface Content<T> {
  content: T;
}

export interface Response<T = any> {
  status: ResponseStatus;
  console: string[];
  result: T;
  /** Value of the `Retry-After` response header, if present */
  retryafter?: string;
}

interface ServerInfoFeature {
  name: string;
  enabled: string;
}

export interface UserAction {
  action: number;
  target: string;
  message: string;
  reload: boolean;
  doc: any;
  errorText: string;
}

export interface Document {
  name: string;
  db: string;
  ts: string;
  upd: boolean;
  cat: "RTN" | "CLS" | "CSP" | "OTH";
  status: string;
  enc: boolean;
  flags: number;
  content: string[] | Buffer;
  ext?: UserAction | UserAction[];
}

export interface ServerInfo {
  version: string;
  id: string;
  api: number;
  features: ServerInfoFeature[];
  namespaces: string[];
}

export interface SearchMatch {
  text: string;
  line?: string | number;
  member?: string;
  attr?: string;
  attrline?: number;
}

export interface SearchResult {
  doc: string;
  matches: SearchMatch[];
}

export interface DocSearchResult {
  name: string;
  cat: "RTN" | "CLS" | "CSP" | "OTH";
  ts: string;
  db: string;
  gen: boolean;
}

export interface AtelierJob {
  pid: number;
  namespace: string;
  routine: string;
  state: string;
  device: string;
}

export interface DeleteStatus {
  name: string;
  db: string;
  status: string;
}

interface AsyncCompileRequest {
  request: "compile";
  documents: string[];
  source?: boolean;
  flags?: string;
}

interface AsyncSearchRequest {
  request: "search";
  query: string;
  regex?: boolean;
  project?: string;
  word?: boolean;
  case?: boolean;
  wild?: boolean;
  documents?: string;
  system?: boolean;
  generated?: boolean;
  mapped?: boolean;
  max?: number;
  include?: string;
  exclude?: string;
  console: false;
}

interface AsyncUnitTestRequest {
  request: "unittest";
  tests: { class: string; methods?: string[] }[];
  load?: { file: string; content: string[] }[];
  console?: boolean;
  debug?: boolean;
}

export type AsyncRequest = AsyncCompileRequest | AsyncSearchRequest | AsyncUnitTestRequest;
