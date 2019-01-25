import vscode = require('vscode');
import fs = require('fs');
import { AtelierAPI } from '../api';
import { currentFile, CurrentFile, outputChannel } from '../utils';
import { documentContentProvider, config } from '../extension';
import { DocumentContentProvider } from '../providers/DocumentContentProvider';

async function compileFlags(): Promise<string> {
  const defaultFlags = config().compileFlags;
  return vscode.window.showInputBox({
    prompt: 'Compilation flags',
    value: defaultFlags
  });
}

async function importFile(file: CurrentFile, flags: string): Promise<any> {
  const api = new AtelierAPI();
  return api
    .putDoc(
      file.name,
      {
        enc: false,
        content: file.content.split(/\r?\n/)
      },
      true
    )
    .then(data => compile(file, flags))
    .catch((error: Error) => {
      outputChannel.appendLine(error.message);
      outputChannel.show(true);
      vscode.window.showErrorMessage(error.message);
    });
}

function updateOthers(others: string[]) {
  others.forEach(item => {
    const uri = DocumentContentProvider.getUri(item);
    documentContentProvider.update(uri);
  });
}

async function loadChanges(file: CurrentFile): Promise<any> {
  const api = new AtelierAPI();
  return api.getDoc(file.name).then(data => {
    fs.writeFileSync(file.fileName, (data.result.content || []).join('\n'));
    api
      .actionIndex([file.name])
      .then(data => data.result.content[0].others)
      .then(updateOthers);
  });
}

async function compile(file: CurrentFile, flags: string): Promise<any> {
  const api = new AtelierAPI();
  return api
    .actionCompile([file.name], flags)
    .then(data => {
      if (data.status && data.status.errors && data.status.errors.length) {
        throw new Error(`${file.name}: Compile error`);
      } else {
        vscode.window.showInformationMessage(`${file.name}: Compile successed`);
      }
      return file;
    })
    .then(loadChanges);
}

export async function importAndCompile(askFLags = false): Promise<any> {
  const file = currentFile();
  if (!file) {
    return;
  }
  if (!config('conn').active) {
    return;
  }
  const defaultFlags = config().compileFlags;
  const flags = askFLags ? await compileFlags() : defaultFlags;
  return importFile(file, flags).catch(error => {
    console.error(error);
  });
}
