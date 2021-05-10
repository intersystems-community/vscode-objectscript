import { AtelierAPI } from "../api";

const allTokens = new Map<string, Map<string, string>>();

// Get or extend CSP token that will give current connected user access to webapp at path
export async function getCSPToken(api: AtelierAPI, path: string): Promise<string> {
  // Ignore any queryparams, and null out any page name
  const parts = path.split("?")[0].split("/");
  parts.pop();
  parts.push("");
  path = parts.join("/");

  // The first key in map-of-maps where we record tokens represents the connection target
  const { https, host, port, pathPrefix, username } = api.config;
  const connKey = JSON.stringify({ https, host, port, pathPrefix, username });

  const myTokens = allTokens.get(connKey) || new Map<string, string>();
  const previousToken = myTokens.get(path) || "";
  let token = "";
  return api
    .actionQuery("select %Atelier_v1_Utils.General_GetCSPToken(?, ?) token", [path, previousToken])
    .then((tokenObj) => {
      token = tokenObj.result.content[0].token;
      myTokens.set(path, token);
      allTokens.set(connKey, myTokens);
      return token;
    });
}
