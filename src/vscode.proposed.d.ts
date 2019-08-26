/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// This is the place for API experiments and proposal.

declare module "vscode" {
  //#region Rob: search provider

  /**
   * The parameters of a query for text search.
   */
  export interface TextSearchQuery {
    /**
     * The text pattern to search for.
     */
    pattern: string;

    /**
     * Whether or not `pattern` should match multiple lines of text.
     */
    isMultiline?: boolean;

    /**
     * Whether or not `pattern` should be interpreted as a regular expression.
     */
    isRegExp?: boolean;

    /**
     * Whether or not the search should be case-sensitive.
     */
    isCaseSensitive?: boolean;

    /**
     * Whether or not to search for whole word matches only.
     */
    isWordMatch?: boolean;
  }

  /**
   * A file glob pattern to match file paths against.
   * TODO@roblou - merge this with the GlobPattern docs/definition in vscode.d.ts.
   * @see [GlobPattern](#GlobPattern)
   */
  export type GlobString = string;

  /**
   * Options common to file and text search
   */
  export interface SearchOptions {
    /**
     * The root folder to search within.
     */
    folder: Uri;

    /**
     * Files that match an `includes` glob pattern should be included in the search.
     */
    includes: GlobString[];

    /**
     * Files that match an `excludes` glob pattern should be excluded from the search.
     */
    excludes: GlobString[];

    /**
     * Whether external files that exclude files, like .gitignore, should be respected.
     * See the vscode setting `"search.useIgnoreFiles"`.
     */
    useIgnoreFiles: boolean;

    /**
     * Whether symlinks should be followed while searching.
     * See the vscode setting `"search.followSymlinks"`.
     */
    followSymlinks: boolean;

    /**
     * Whether global files that exclude files, like .gitignore, should be respected.
     * See the vscode setting `"search.useGlobalIgnoreFiles"`.
     */
    useGlobalIgnoreFiles: boolean;
  }

  /**
   * Options to specify the size of the result text preview.
   * These options don't affect the size of the match itself, just the amount of preview text.
   */
  export interface TextSearchPreviewOptions {
    /**
     * The maximum number of lines in the preview.
     * Only search providers that support multiline search will ever return more than one line in the match.
     */
    matchLines: number;

    /**
     * The maximum number of characters included per line.
     */
    charsPerLine: number;
  }

  /**
   * Options that apply to text search.
   */
  export interface TextSearchOptions extends SearchOptions {
    /**
     * The maximum number of results to be returned.
     */
    maxResults: number;

    /**
     * Options to specify the size of the result text preview.
     */
    previewOptions?: TextSearchPreviewOptions;

    /**
     * Exclude files larger than `maxFileSize` in bytes.
     */
    maxFileSize?: number;

    /**
     * Interpret files using this encoding.
     * See the vscode setting `"files.encoding"`
     */
    encoding?: string;

    /**
     * Number of lines of context to include before each match.
     */
    beforeContext?: number;

    /**
     * Number of lines of context to include after each match.
     */
    afterContext?: number;
  }

  /**
   * Information collected when text search is complete.
   */
  export interface TextSearchComplete {
    /**
     * Whether the search hit the limit on the maximum number of search results.
     * `maxResults` on [`TextSearchOptions`](#TextSearchOptions) specifies the max number of results.
     * - If exactly that number of matches exist, this should be false.
     * - If `maxResults` matches are returned and more exist, this should be true.
     * - If search hits an internal limit which is less than `maxResults`, this should be true.
     */
    limitHit?: boolean;
  }

  /**
   * The parameters of a query for file search.
   */
  export interface FileSearchQuery {
    /**
     * The search pattern to match against file paths.
     */
    pattern: string;
  }

  /**
   * Options that apply to file search.
   */
  export interface FileSearchOptions extends SearchOptions {
    /**
     * The maximum number of results to be returned.
     */
    maxResults?: number;

    /**
     * A CancellationToken that represents the session for this search query. If the provider chooses to, this object can be used as the key for a cache,
     * and searches with the same session object can search the same cache. When the token is cancelled, the session is complete and the cache can be cleared.
     */
    session?: CancellationToken;
  }

  /**
   * A preview of the text result.
   */
  export interface TextSearchMatchPreview {
    /**
     * The matching lines of text, or a portion of the matching line that contains the match.
     */
    text: string;

    /**
     * The Range within `text` corresponding to the text of the match.
     * The number of matches must match the TextSearchMatch's range property.
     */
    matches: Range | Range[];
  }

  /**
   * A match from a text search
   */
  export interface TextSearchMatch {
    /**
     * The uri for the matching document.
     */
    uri: Uri;

    /**
     * The range of the match within the document, or multiple ranges for multiple matches.
     */
    ranges: Range | Range[];

    /**
     * A preview of the text match.
     */
    preview: TextSearchMatchPreview;
  }

  /**
   * A line of context surrounding a TextSearchMatch.
   */
  export interface TextSearchContext {
    /**
     * The uri for the matching document.
     */
    uri: Uri;

    /**
     * One line of text.
     * previewOptions.charsPerLine applies to this
     */
    text: string;

    /**
     * The line number of this line of context.
     */
    lineNumber: number;
  }

  export type TextSearchResult = TextSearchMatch | TextSearchContext;

  /**
   * A FileSearchProvider provides search results for files in the given folder that match a query string. It can be invoked by quickopen or other extensions.
   *
   * A FileSearchProvider is the more powerful of two ways to implement file search in VS Code. Use a FileSearchProvider if you wish to search within a folder for
   * all files that match the user's query.
   *
   * The FileSearchProvider will be invoked on every keypress in quickopen. When `workspace.findFiles` is called, it will be invoked with an empty query string,
   * and in that case, every file in the folder should be returned.
   */
  export interface FileSearchProvider {
    /**
     * Provide the set of files that match a certain file path pattern.
     * @param query The parameters for this query.
     * @param options A set of options to consider while searching files.
     * @param token A cancellation token.
     */
    provideFileSearchResults(
      query: FileSearchQuery,
      options: FileSearchOptions,
      token: CancellationToken
    ): ProviderResult<Uri[]>;
  }

  /**
   * A TextSearchProvider provides search results for text results inside files in the workspace.
   */
  export interface TextSearchProvider {
    /**
     * Provide results that match the given text pattern.
     * @param query The parameters for this query.
     * @param options A set of options to consider while searching.
     * @param progress A progress callback that must be invoked for all results.
     * @param token A cancellation token.
     */
    provideTextSearchResults(
      query: TextSearchQuery,
      options: TextSearchOptions,
      progress: Progress<TextSearchResult>,
      token: CancellationToken
    ): ProviderResult<TextSearchComplete>;
  }

  /**
   * Options that can be set on a findTextInFiles search.
   */
  export interface FindTextInFilesOptions {
    /**
     * A [glob pattern](#GlobPattern) that defines the files to search for. The glob pattern
     * will be matched against the file paths of files relative to their workspace. Use a [relative pattern](#RelativePattern)
     * to restrict the search results to a [workspace folder](#WorkspaceFolder).
     */
    include?: GlobPattern;

    /**
     * A [glob pattern](#GlobPattern) that defines files and folders to exclude. The glob pattern
     * will be matched against the file paths of resulting matches relative to their workspace. When `undefined` only default excludes will
     * apply, when `null` no excludes will apply.
     */
    exclude?: GlobPattern | null;

    /**
     * The maximum number of results to search for
     */
    maxResults?: number;

    /**
     * Whether external files that exclude files, like .gitignore, should be respected.
     * See the vscode setting `"search.useIgnoreFiles"`.
     */
    useIgnoreFiles?: boolean;

    /**
     * Whether global files that exclude files, like .gitignore, should be respected.
     * See the vscode setting `"search.useGlobalIgnoreFiles"`.
     */
    useGlobalIgnoreFiles?: boolean;

    /**
     * Whether symlinks should be followed while searching.
     * See the vscode setting `"search.followSymlinks"`.
     */
    followSymlinks?: boolean;

    /**
     * Interpret files using this encoding.
     * See the vscode setting `"files.encoding"`
     */
    encoding?: string;

    /**
     * Options to specify the size of the result text preview.
     */
    previewOptions?: TextSearchPreviewOptions;

    /**
     * Number of lines of context to include before each match.
     */
    beforeContext?: number;

    /**
     * Number of lines of context to include after each match.
     */
    afterContext?: number;
  }

  export namespace workspace {
    /**
     * Register a search provider.
     *
     * Only one provider can be registered per scheme.
     *
     * @param scheme The provider will be invoked for workspace folders that have this file scheme.
     * @param provider The provider.
     * @return A [disposable](#Disposable) that unregisters this provider when being disposed.
     */
    export function registerFileSearchProvider(scheme: string, provider: FileSearchProvider): Disposable;

    /**
     * Register a text search provider.
     *
     * Only one provider can be registered per scheme.
     *
     * @param scheme The provider will be invoked for workspace folders that have this file scheme.
     * @param provider The provider.
     * @return A [disposable](#Disposable) that unregisters this provider when being disposed.
     */
    export function registerTextSearchProvider(scheme: string, provider: TextSearchProvider): Disposable;

    /**
     * Search text in files across all [workspace folders](#workspace.workspaceFolders) in the workspace.
     * @param query The query parameters for the search - the search string, whether it's case-sensitive, or a regex, or matches whole words.
     * @param callback A callback, called for each result
     * @param token A token that can be used to signal cancellation to the underlying search engine.
     * @return A thenable that resolves when the search is complete.
     */
    export function findTextInFiles(
      query: TextSearchQuery,
      callback: (result: TextSearchResult) => void,
      token?: CancellationToken
    ): Thenable<TextSearchComplete>;

    /**
     * Search text in files across all [workspace folders](#workspace.workspaceFolders) in the workspace.
     * @param query The query parameters for the search - the search string, whether it's case-sensitive, or a regex, or matches whole words.
     * @param options An optional set of query options. Include and exclude patterns, maxResults, etc.
     * @param callback A callback, called for each result
     * @param token A token that can be used to signal cancellation to the underlying search engine.
     * @return A thenable that resolves when the search is complete.
     */
    export function findTextInFiles(
      query: TextSearchQuery,
      options: FindTextInFilesOptions,
      callback: (result: TextSearchResult) => void,
      token?: CancellationToken
    ): Thenable<TextSearchComplete>;
  }
}
