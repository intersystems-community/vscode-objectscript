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
