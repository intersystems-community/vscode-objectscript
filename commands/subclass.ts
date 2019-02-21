import * as vscode from 'vscode';
import { config } from '../extension';
import { AtelierAPI } from '../api';
import { currentFile } from '../utils';
import { DocumentContentProvider } from '../providers/DocumentContentProvider';
import { ClassDefinition } from '../utils/classDefinition';

export async function subclass(): Promise<void> {
  const file = currentFile();
  if (!file || !file.name.toLowerCase().endsWith('.cls')) {
    return;
  }
  let className = file.name
    .split('.')
    .slice(0, -1)
    .join('.');
  if (!config('conn').active) {
    return;
  }

  const open = item => {
    let uri = DocumentContentProvider.getUri(ClassDefinition.normalizeClassName(item, true));
    vscode.window.showTextDocument(uri);
  };

  const api = new AtelierAPI();
  return api
    .actionQuery('CALL %Dictionary.ClassDefinitionQuery_SubclassOf(?)', [className])
    .then(data => {
      const list = data.result.content.slice(0, 100) || [];
      if (!list.length) {
        return;
      }
      vscode.window.showQuickPick(list.map(el => el.Name)).then(item => {
        open(item);
      });
    })
    .catch(err => console.error(err));
}
