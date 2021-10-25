// Script run within the webview itself.
(function () {
  // Get a reference to the VS Code webview api.
  // We use this API to post messages back to our extension.
  const vscode = acquireVsCodeApi();

  const header = document.getElementById("header");
  const showText = document.getElementById("showText");

  const memberregex = new RegExp(
    "(?:<method>([^<>/]*)</method>)|(?:<property>([^<>/]*)</property>)|(?:<query>([^<>/]*)</query>)",
    "gi"
  );
  let classUri;

  // Handle messages sent from the extension to the webview
  window.addEventListener("message", (event) => {
    const message = event.data; // The json data that the extension sent

    // Update the header to reflect what we're previewing
    header.innerText = message.element;

    // Update the uri of the class that we're previewing
    classUri = message.uri;

    // Modify the Documatic HTML for previewing and show it
    let modifiedDesc = message.desc;
    let matcharr;
    while ((matcharr = memberregex.exec(message.desc)) !== null) {
      let commandArgs = [classUri];
      if (matcharr[1] !== undefined) {
        // This is a <METHOD> HTML tag
        commandArgs[1] = "method";
        commandArgs[2] = matcharr[1];
      } else if (matcharr[2] !== undefined) {
        // This is a <PROPERTY> HTML tag
        commandArgs[1] = "property";
        commandArgs[2] = matcharr[2];
      } else {
        // This is a <QUERY> HTML tag
        commandArgs[1] = "query";
        commandArgs[2] = matcharr[3];
      }
      const href = `command:intersystems.language-server.showSymbolInClass?${encodeURIComponent(
        JSON.stringify(commandArgs)
      )}`;
      const title = `Go to this ${commandArgs[1]} definition`;
      modifiedDesc = modifiedDesc.replace(matcharr[0], `<a href="${href}" title="${title}">${commandArgs[2]}</a>`);
    }
    showText.innerHTML = modifiedDesc
      .replace(/<class>|<parameter>/gi, "<b><i>")
      .replace(/<\/class>|<\/parameter>/gi, "</i></b>")
      .replace(/<pre>/gi, "<code><pre>")
      .replace(/<\/pre>/gi, "</pre></code>")
      .replace(/<example(?: +language *= *"?[a-z]+"?)? *>/gi, "<br/><code><pre>")
      .replace(/<\/example>/gi, "</pre></code>");

    // Then persist state information.
    // This state is returned in the call to `vscode.getState` below when a webview is reloaded.
    vscode.setState({
      header: header.innerText,
      showText: showText.innerHTML,
      uri: classUri,
    });
  });

  // Webviews are normally torn down when not visible and re-created when they become visible again.
  // State lets us save information across these re-loads
  const state = vscode.getState();
  if (state) {
    // Fill in webview from the cache
    header.innerText = state.header;
    showText.innerHTML = state.showText;
    classUri = state.uri;
  }
})();
