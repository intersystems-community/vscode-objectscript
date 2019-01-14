import vscode = require('vscode');
import fs = require('fs');
import { AtelierAPI } from '../api';
import { currentFile, CurrentFile, outputChannel } from '../utils';
import { OBJECTSCRIPT_FILE_SCHEMA, documentContentProvider } from '../extension';

const defaultFlags: string = vscode.workspace.getConfiguration('objectscript').get('compileFlags');
const api = new AtelierAPI();

async function compileFlags(): Promise<string> {
  return vscode.window.showInputBox({
    prompt: 'Compilation flags',
    value: defaultFlags
  });
}

async function importFile(file: CurrentFile, flags: string): Promise<any> {
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
      outputChannel.show();
      vscode.window.showErrorMessage(error.message);
    });
}

function updateOthers(others: string[]) {
  others.forEach(item => {
    const uri = vscode.Uri.parse(encodeURI(`${OBJECTSCRIPT_FILE_SCHEMA}:///${item}`));
    documentContentProvider.update(uri);
  });
}

async function loadChanges(file: CurrentFile): Promise<any> {
  return api.getDoc(file.name).then(data => {
    fs.writeFileSync(file.fileName, (data.result.content || []).join('\n'));
    api
      .actionIndex([file.name])
      .then(data => data.result.content[0].others)
      .then(updateOthers);
  });
}

async function compile(file: CurrentFile, flags: string): Promise<any> {
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
  const flags = askFLags ? await compileFlags() : defaultFlags;
  return importFile(file, flags).catch(error => {
    console.error(error);
  });
}
