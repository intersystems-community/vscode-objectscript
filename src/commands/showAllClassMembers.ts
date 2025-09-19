import * as vscode from "vscode";
import { AtelierAPI } from "../api";
import { clsLangId, lsExtensionId } from "../extension";
import { currentFile, handleError, stripClassMemberNameQuotes } from "../utils";
import { DocumentContentProvider } from "../providers/DocumentContentProvider";

export async function showAllClassMembers(uri: vscode.Uri): Promise<void> {
  try {
    // Determine the name of the class
    const uriString = uri.toString();
    const textDocument = vscode.workspace.textDocuments.find((td) => td.uri.toString() == uriString);
    if (textDocument?.languageId != clsLangId) {
      vscode.window.showErrorMessage("The document in the active text editor is not a class definition.", "Dismiss");
      return;
    }
    const file = currentFile(textDocument);
    if (!file) {
      vscode.window.showErrorMessage("The class definition in the active text editor is malformed.", "Dismiss");
      return;
    }
    const cls = file.name.slice(0, -4);
    const api = new AtelierAPI(file.uri);
    if (!api.active) {
      vscode.window.showErrorMessage("Showing all members of a class requires an active server connection.", "Dismiss");
      return;
    }
    // Get an array of all members
    const members: {
      Name: string;
      Origin: string;
      MemberType: "f" | "i" | "m" | "p" | "j" | "a" | "q" | "s" | "t" | "x";
      Info: string;
    }[] = await api
      .actionQuery(
        `SELECT Name, Origin, MemberType, Info FROM (
SELECT Name, Origin, 'f' AS MemberType, Parent, Internal, NotInheritable, '('||REPLACE(Properties,',',', ')||') References '||ReferencedClass||(CASE WHEN ReferencedKey IS NOT NULL THEN '('||ReferencedKey||')' ELSE '' END) AS Info FROM %Dictionary.CompiledForeignKey UNION
SELECT Name, Origin, 'i' AS MemberType, Parent, Internal, NotInheritable, (CASE WHEN Properties LIKE '%,%' THEN 'On ('||REPLACE(Properties,',',', ')||') ' WHEN Properties IS NOT NULL THEN 'On '||Properties||' ' ELSE '' END)||(CASE WHEN Type IS NOT NULL THEN '[ Type = '||Type||' ]' ELSE '' END) AS Info FROM %Dictionary.CompiledIndex WHERE NOT (Name %STARTSWITH '$') UNION
SELECT Name, Origin, 'm' AS MemberType, Parent, Internal, NotInheritable, '('||(CASE WHEN FormalSpec IS NULL THEN '' ELSE REPLACE(REPLACE(FormalSpec,',',', '),'=',' = ') END)||')'||(CASE WHEN ReturnType IS NOT NULL THEN ' As '||ReturnType||(CASE WHEN ReturnTypeParams IS NOT NULL THEN '('||REPLACE(ReturnTypeParams,'=',' = ')||')' ELSE '' END) ELSE '' END) AS Info FROM %Dictionary.CompiledMethod WHERE Stub IS NULL UNION
SELECT Name, Origin, 'p' AS MemberType, Parent, Internal, NotInheritable, CASE WHEN Expression IS NOT NULL THEN Expression WHEN _Default IS NOT NULL THEN _Default ELSE Type END AS Info FROM %Dictionary.CompiledParameter UNION
SELECT Name, Origin, 'j' AS MemberType, Parent, Internal, NotInheritable, Type AS Info FROM %Dictionary.CompiledProjection UNION
SELECT Name, Origin, 'a' AS MemberType, Parent, Internal, NotInheritable, CASE WHEN Collection IS NOT NULL THEN Collection||' Of '||Type ELSE Type END AS Info FROM %Dictionary.CompiledProperty UNION
SELECT Name, Origin, 'q' AS MemberType, Parent, Internal, NotInheritable, '('||(CASE WHEN FormalSpec IS NULL THEN '' ELSE REPLACE(REPLACE(FormalSpec,',',', '),'=',' = ') END)||') As '||Type AS Info FROM %Dictionary.CompiledQuery UNION
SELECT Name, Origin, 's' AS MemberType, Parent, Internal, NotInheritable, Type AS Info FROM %Dictionary.CompiledStorage UNION
SELECT Name, Origin, 't' AS MemberType, Parent, Internal, NotInheritable, Event||' '||_Time||' '||Foreach AS Info FROM %Dictionary.CompiledTrigger UNION
SELECT Name, Origin, 'x' AS MemberType, Parent, Internal, 0 AS NotInheritable, MimeType||(CASE WHEN SUBSTR(MimeType,-4) = '/xml' AND XMLNamespace IS NOT NULL THEN ' ('||XMLNamespace||')' ELSE '' END) AS Info FROM %Dictionary.CompiledXData
) WHERE Parent = ? AND ((NotInheritable = 0 AND Internal = 0) OR (Origin = Parent)) ORDER BY Name`.replaceAll(
          "\n",
          " "
        ),
        [cls]
      )
      .then((data) => data?.result?.content ?? []);
    if (!members.length) {
      vscode.window.showWarningMessage(
        "The server returned no members for this class. If members are expected, re-compile the class then try again.",
        "Dismiss"
      );
      return;
    }
    // Prompt the user to pick one
    const member = await vscode.window.showQuickPick(
      // Convert the query rows into QuickPickItems
      members.map((m) => {
        const [iconId, memberType] = (() => {
          switch (m.MemberType) {
            case "m":
              return ["method", "Method"];
            case "q":
              return ["function", "Query"];
            case "t":
              return ["event", "Trigger"];
            case "p":
              return ["constant", "Parameter"];
            case "i":
              return ["array", "Index"];
            case "f":
              return ["key", "ForeignKey"];
            case "x":
              return ["struct", "XData"];
            case "s":
              return ["object", "Storage"];
            case "j":
              return ["interface", "Projection"];
            default:
              return ["property", "Property"];
          }
        })();
        let detail = m.Info;
        if ("mq".includes(m.MemberType)) {
          // Need to beautify the argument list
          detail = "";
          let inQuotes = false;
          let braceDepth = 0;
          for (const c of m.Info) {
            if (c == '"') {
              inQuotes = !inQuotes;
              detail += c;
              continue;
            }
            if (!inQuotes) {
              if (c == "{") {
                braceDepth++;
                detail += c;
                continue;
              } else if (c == "}") {
                braceDepth = Math.max(0, braceDepth - 1);
                detail += c;
                continue;
              }
            }
            if (!inQuotes && braceDepth == 0 && ":&*=".includes(c)) {
              detail += c == ":" ? " As " : c == "&" ? "ByRef " : c == "*" ? "Output " : " = ";
            } else {
              detail += c;
            }
          }
        }
        return {
          label: m.Name,
          description: m.Origin,
          detail,
          iconPath: new vscode.ThemeIcon(`symbol-${iconId}`),
          memberType,
        };
      }),
      {
        title: `All members of ${cls}`,
        placeHolder: "Pick a member to show it in the editor",
      }
    );
    if (!member) return;
    // Show the picked member
    const targetUri =
      member.description == cls
        ? uri
        : DocumentContentProvider.getUri(
            `${member.description}.cls`,
            undefined,
            undefined,
            undefined,
            vscode.workspace.getWorkspaceFolder(uri)?.uri
          );
    const symbols = (
      await vscode.commands.executeCommand<vscode.DocumentSymbol[]>("vscode.executeDocumentSymbolProvider", targetUri)
    )[0]?.children;
    // Find the symbol for this member
    const memberType = member.memberType.toLowerCase();
    const symbol = symbols?.find(
      (s) =>
        stripClassMemberNameQuotes(s.name) == member.label &&
        (memberType == "method"
          ? s.detail.toLowerCase().includes(memberType)
          : memberType == "property"
            ? ["property", "relationship"].includes(s.detail.toLowerCase())
            : s.detail.toLowerCase() == memberType)
    );
    if (!symbol) {
      vscode.window.showErrorMessage(
        `Did not find ${member.memberType} '${member.label}' in class '${member.description}'.`,
        "Dismiss"
      );
      return;
    }
    // If Language Server is active, selectionRange is the member name.
    // Else, range is the first line of the member definition excluding description.
    const position = vscode.extensions.getExtension(lsExtensionId)?.isActive
      ? symbol.selectionRange.start
      : symbol.range.start;
    await vscode.window.showTextDocument(targetUri, {
      selection: new vscode.Range(position, position),
      preview: false,
    });
  } catch (error) {
    handleError(error, "Failed to show all class members.");
  }
}
