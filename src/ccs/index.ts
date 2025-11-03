export { getCcsSettings, isFlagEnabled, type CcsSettings } from "./config/settings";
export { logDebug, logError, logInfo, logWarn } from "./core/logging";
export { SourceControlApi } from "./sourcecontrol/client";
export { resolveContextExpression } from "./commands/contextHelp";
export { showGlobalDocumentation } from "./commands/globalDocumentation";
export { ContextExpressionClient } from "./sourcecontrol/clients/contextExpressionClient";
export { GlobalDocumentationClient } from "./sourcecontrol/clients/globalDocumentationClient";
export { ResolveDefinitionClient } from "./sourcecontrol/clients/resolveDefinitionClient";
export { lookupCcsDefinition, type LookupOptions } from "./features/definitionLookup/lookup";
export {
  extractDefinitionQuery,
  extractDefinitionQueries,
  type QueryMatch,
  type QueryKind,
} from "./features/definitionLookup/extractQuery";
export { goToDefinitionLocalFirst } from "./commands/goToDefinitionLocalFirst";
export { followDefinitionLink } from "./commands/followDefinitionLink";
export { jumpToTagAndOffsetCrossEntity } from "./commands/jumpToTagOffsetCrossEntity";
export { PrioritizedDefinitionProvider } from "./providers/PrioritizedDefinitionProvider";
export {
  DefinitionDocumentLinkProvider,
  followDefinitionLinkCommand,
} from "./providers/DefinitionDocumentLinkProvider";
export {
  SourceAnalysisLinkProvider,
  type SourceAnalysisLinkArgs,
  followSourceAnalysisLink,
  followSourceAnalysisLinkCommand,
} from "./providers/SourceAnalysisLinkProvider";
export { createItem } from "./commands/createItem";
