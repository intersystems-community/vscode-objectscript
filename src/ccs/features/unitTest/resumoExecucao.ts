import * as vscode from "vscode";

/**
 * Resumo consolidado de uma execução de testes unitários.
 *
 * A saída do executor é longa demais para ser lida linha a linha: numa execução de pacote
 * inteiro o que deu errado fica perdido no meio de centenas de linhas de asserts que
 * passaram. Este resumo acumula só o que interessa e é impresso SEMPRE no fim da execução,
 * e também num canal de saída próprio, que só tem resumos.
 */

const ANSI_RESET = "\u001b[0m";
const ANSI_RED = "\u001b[31m";
const ANSI_GREEN = "\u001b[32m";
const ANSI_YELLOW = "\u001b[33m";
const ANSI_BOLD = "\u001b[1m";

const SEPARADOR = "─".repeat(78);

type Cor = "vermelho" | "verde" | "amarelo" | "negrito" | undefined;

interface Linha {
  texto: string;
  cor?: Cor;
}

/** Uma classe que não chegou a executar, com o motivo */
interface Impedimento {
  classe: string;
  motivo: string;
  /** `true` quando o usuário escolheu não executar (recusou gerar a base, por exemplo) */
  porEscolha: boolean;
}

/** Um método que falhou, com a primeira mensagem de falha */
interface Falha {
  classe: string;
  metodo: string;
  detalhe: string;
}

/** Um erro que impediu a classe de produzir resultado */
interface ErroClasse {
  classe: string;
  erro: string;
}

export class ResumoExecucao {
  private readonly falhas: Falha[] = [];
  private readonly impedimentos: Impedimento[] = [];
  private readonly errosClasse: ErroClasse[] = [];
  private metodosPassaram = 0;
  private metodosIgnorados = 0;

  public registrarMetodoPassou(): void {
    this.metodosPassaram++;
  }

  public registrarMetodoIgnorado(): void {
    this.metodosIgnorados++;
  }

  public registrarFalha(classe: string, metodo: string, detalhe: string): void {
    this.falhas.push({ classe, metodo, detalhe });
  }

  /** Classe que não executou por um impedimento do ambiente (base ausente, classe inválida…) */
  public registrarNaoExecutou(classe: string, motivo: string, porEscolha = false): void {
    this.impedimentos.push({ classe, motivo, porEscolha });
  }

  public registrarErroClasse(classe: string, erro: string): void {
    this.errosClasse.push({ classe, erro });
  }

  /** Não há nada para resumir — execução abortada antes de qualquer resultado */
  public get vazio(): boolean {
    return (
      !this.falhas.length &&
      !this.impedimentos.length &&
      !this.errosClasse.length &&
      !this.metodosPassaram &&
      !this.metodosIgnorados
    );
  }

  /** Houve problema que a árvore de testes não mostra sozinha (classe que nem rodou) */
  public get temImpedimento(): boolean {
    return this.impedimentos.some((i) => !i.porEscolha) || this.errosClasse.length > 0;
  }

  public get qtdeNaoExecutaram(): number {
    return this.impedimentos.length + this.errosClasse.length;
  }

  public get qtdeFalhas(): number {
    return this.falhas.length;
  }

  private linhas(): Linha[] {
    const linhas: Linha[] = [];
    const total = this.metodosPassaram + this.falhas.length + this.metodosIgnorados;

    linhas.push({ texto: SEPARADOR });
    linhas.push({ texto: "RESUMO DA EXECUÇÃO", cor: "negrito" });

    // Contagens como substantivo, não como verbo: "1 falharam" fica torto no singular
    const contagens = [`${this.metodosPassaram} com sucesso`];
    if (this.falhas.length) contagens.push(`${this.falhas.length} com falha`);
    if (this.metodosIgnorados) contagens.push(`${this.metodosIgnorados} ignorado(s)`);
    linhas.push({
      texto: `  ${total} método(s) de teste: ${contagens.join(" · ")}`,
      cor: this.falhas.length ? "vermelho" : "verde",
    });

    if (this.qtdeNaoExecutaram) {
      linhas.push({ texto: `  ${this.qtdeNaoExecutaram} classe(s) NÃO executada(s)`, cor: "amarelo" });
    }

    if (this.falhas.length) {
      linhas.push({ texto: "" });
      linhas.push({ texto: `FALHAS (${this.falhas.length})`, cor: "vermelho" });
      for (const falha of this.falhas) {
        linhas.push({ texto: `  ${falha.classe} :: ${falha.metodo}`, cor: "vermelho" });
        linhas.push({ texto: `      ${primeiraLinha(falha.detalhe)}` });
      }
    }

    if (this.errosClasse.length) {
      linhas.push({ texto: "" });
      linhas.push({ texto: `ERROS DE EXECUÇÃO (${this.errosClasse.length})`, cor: "vermelho" });
      for (const erro of this.errosClasse) {
        linhas.push({ texto: `  ${erro.classe}`, cor: "vermelho" });
        linhas.push({ texto: `      ${primeiraLinha(erro.erro)}` });
      }
    }

    if (this.impedimentos.length) {
      linhas.push({ texto: "" });
      linhas.push({ texto: `NÃO EXECUTADAS (${this.impedimentos.length})`, cor: "amarelo" });
      for (const impedimento of this.impedimentos) {
        linhas.push({ texto: `  ${impedimento.classe}`, cor: "amarelo" });
        linhas.push({ texto: `      ${primeiraLinha(impedimento.motivo)}` });
      }
    }

    if (!this.falhas.length && !this.qtdeNaoExecutaram) {
      linhas.push({ texto: "  Nenhuma falha e nenhuma classe pendente.", cor: "verde" });
    }

    linhas.push({ texto: SEPARADOR });
    return linhas;
  }

  /** Bloco colorido para o terminal "Test Results" (exige CRLF) */
  public paraTerminal(): string {
    return this.linhas()
      .map((l) => `${corAnsi(l.cor)}${l.texto}${l.cor ? ANSI_RESET : ""}\r\n`)
      .join("");
  }

  /** Mesmo conteúdo sem ANSI, para o canal de saída */
  public paraTexto(cabecalho: string): string {
    return [cabecalho, ...this.linhas().map((l) => l.texto)].join("\n");
  }
}

function corAnsi(cor: Cor): string {
  switch (cor) {
    case "vermelho":
      return ANSI_RED;
    case "verde":
      return ANSI_GREEN;
    case "amarelo":
      return ANSI_YELLOW;
    case "negrito":
      return ANSI_BOLD;
    default:
      return "";
  }
}

/** Mensagens de assert podem ter várias linhas; no resumo só cabe a primeira */
function primeiraLinha(texto: string): string {
  const limpo = texto.replace(/\r/g, "").split("\n")[0].trim();
  if (!limpo) return "(sem detalhe)";
  return limpo.length > 160 ? `${limpo.slice(0, 157)}…` : limpo;
}

let canal: vscode.OutputChannel | undefined;
let temResumo = false;

/** Canal que guarda SÓ os resumos, para consulta depois que a saída da execução já rolou */
function canalResumo(): vscode.OutputChannel {
  if (!canal) canal = vscode.window.createOutputChannel("Consistem: Resumo dos Testes");
  return canal;
}

/** Publica o resumo no canal de saída. Chamado ao fim de cada execução. */
export function publicarResumo(resumo: ResumoExecucao, escopo: string): void {
  const quando = new Date().toLocaleString("pt-BR");
  const saida = canalResumo();
  saida.appendLine("");
  saida.appendLine(resumo.paraTexto(`${quando} · ${escopo}`));
  temResumo = true;
}

/**
 * Deixa à vista o que deu errado na última execução: colapsa a árvore, ordena por situação
 * (erro e falha primeiro) e abre o canal com o resumo.
 */
export async function mostrarResumoTestes(): Promise<void> {
  // As ações de colapsar/ordenar são `ViewAction`: só rodam com a view de testes aberta
  const executar = (comando: string) =>
    Promise.resolve(vscode.commands.executeCommand(comando)).then(undefined, () => undefined);
  await executar("workbench.view.testing");
  await executar("testing.collapseAll");
  await executar("testing.sortByStatus");

  if (!temResumo) {
    vscode.window.showInformationMessage(
      "Nenhuma execução de testes registrada nesta sessão. A árvore foi colapsada e ordenada por situação.",
      "Dismiss"
    );
    return;
  }
  canalResumo().show(true);
}

export function descartarCanalResumo(): void {
  canal?.dispose();
  canal = undefined;
  temResumo = false;
}
