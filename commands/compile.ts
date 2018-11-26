import vscode = require('vscode');
import fs = require('fs');
import { AtelierAPI } from '../api';
import { currentFile, CurrentFile, outputChannel } from '../utils';

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
        content: file.content.split('\n')
      },
      true
    )
    .then(data => {
      compile(file, flags);
    })
    .catch(console.error);
}

async function loadChanges(file: CurrentFile): Promise<any> {
  return api.getDoc(file.name).then(data => {
    fs.writeFileSync(file.fileName, (data.result.content || []).join('\n'));
  });
}

async function compile(file: CurrentFile, flags: string): Promise<any> {
  return api
    .actionCompile([file.name], flags)
    .then(data => {
      if (data.status && data.status.errors && data.status.errors.length) {
        outputChannel.show();
        vscode.window.showErrorMessage(`${file.name}: Compile error`);
      } else {
        vscode.window.showInformationMessage(`${file.name}: Compile successed`);
        return file;
      }
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
