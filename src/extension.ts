import * as path from 'path';
import * as ts from 'typescript';

import {
    ServerOptions,
    TransportKind,
    ErrorAction,
    Message,
    LanguageClientOptions,
    LanguageClient
} from 'vscode-languageclient';
import {
    ExtensionContext,
    window,
    workspace,
    TextDocument,
    CancellationToken,
    commands,
    Position,
    Uri,
    Location
} from 'vscode';
import { ImageInfoResponse, GutterPreviewImageRequestType } from './common/protocol';
import { imageDecorator } from './decorator';
import { getConfiguredProperty } from './util/configuration';

const pathCache = {};

const loadPathsFromTSConfig = (
    workspaceFolder: string,
    currentFileFolder: string
): { [name: string]: string | string[] } => {
    if (pathCache[currentFileFolder]) {
        return pathCache[currentFileFolder];
    }
    const paths: { [name: string]: string | string[] } = {};
    let tsConfigFilePath = ts.findConfigFile(currentFileFolder, ts.sys.fileExists, 'tsconfig.json');
    let jsConfigFilePath = ts.findConfigFile(currentFileFolder, ts.sys.fileExists, 'jsconfig.json');
    let configFilePath = tsConfigFilePath;
    if (tsConfigFilePath == null || (jsConfigFilePath != null && jsConfigFilePath.length > tsConfigFilePath.length)) {
        configFilePath = jsConfigFilePath;
    }

    if (!configFilePath) {
        pathCache[currentFileFolder] = paths;
        return paths;
    }
    let configResult = ts.readConfigFile(configFilePath, ts.sys.readFile);

    if (!configResult.error) {
        const config = configResult.config.compilerOptions;
        if (config) {
            const tsConfigPaths = config.paths || {};
            const baseUrl: string = path.relative(
                workspaceFolder,
                path.resolve(path.dirname(configFilePath), config.baseUrl || '.')
            );
            Object.keys(tsConfigPaths).forEach(alias => {
                let mapping = tsConfigPaths[alias];
                const lastIndexOfSlash = alias.lastIndexOf('/');
                let aliasWithoutWildcard = alias;
                if (lastIndexOfSlash > 0) {
                    aliasWithoutWildcard = alias.substr(0, lastIndexOfSlash);
                }
                if (aliasWithoutWildcard == '*') {
                    aliasWithoutWildcard = '';
                }
                if (!paths[aliasWithoutWildcard]) {
                    if (!Array.isArray(mapping)) {
                        mapping = [mapping];
                    }
                    const resolvedMapping = [];
                    mapping.forEach((element: string) => {
                        if (element.endsWith('*')) {
                            element = element.substring(0, element.length - 1);
                        }
                        resolvedMapping.push(path.join(baseUrl, element));
                    });
                    paths[aliasWithoutWildcard] = resolvedMapping;
                }
            });
        }
    }
    pathCache[currentFileFolder] = paths;
    return paths;
};

export function activate(context: ExtensionContext) {
    let serverModule = context.asAbsolutePath(path.join('out', 'src', 'server', 'server.js'));

    let debugOptions = { execArgv: ['--nolazy', '--inspect=6009'] };

    let serverOptions: ServerOptions = {
        run: { module: serverModule, transport: TransportKind.ipc },
        debug: { module: serverModule, transport: TransportKind.ipc, options: debugOptions }
    };
    var output = window.createOutputChannel('gutter-preview');
    let error: (error, message, count) => ErrorAction = (error: Error, message: Message, count: number) => {
        output.appendLine(message.jsonrpc);
        return undefined;
    };
    let clientOptions: LanguageClientOptions = {
        documentSelector: ['*'],
        errorHandler: {
            error: error,

            closed: () => {
                return undefined;
            }
        },
        synchronize: {
            configurationSection: 'gutterpreview'
        }
    };

    let client = new LanguageClient('gutterpreview parser', serverOptions, clientOptions);
    let disposable = client.start();

    context.subscriptions.push(disposable);

    let symbolUpdater = (
        document: TextDocument,
        visibleLines: number[],
        token: CancellationToken
    ): Promise<ImageInfoResponse> => {
        let paths = getConfiguredProperty(document, 'paths', {});

        const folder = workspace.getWorkspaceFolder(document.uri);

        let workspaceFolder;
        if (folder && folder.uri) {
            workspaceFolder = folder.uri.fsPath;
        }

        if (workspaceFolder && document.uri && document.uri.fsPath) {
            paths = Object.assign(loadPathsFromTSConfig(workspaceFolder, path.dirname(document.uri.fsPath)), paths);
        }

        const getImageInfo = (uri: Uri, visibleLines: number[]) => {
            return client.onReady().then(() => {
                return client.sendRequest(
                    GutterPreviewImageRequestType,
                    {
                        uri: uri.toString(),
                        visibleLines: visibleLines,
                        fileName: document.fileName,
                        workspaceFolder: workspaceFolder,
                        currentColor: getConfiguredProperty(document, 'currentColorForSVG', ''),
                        additionalSourcefolder: getConfiguredProperty(document, 'sourceFolder', ''),
                        paths: paths
                    },
                    token
                );
            });
        };

        const requests: Array<Thenable<ImageInfoResponse>> = [];
        const isReferenceLookupEnabled = getConfiguredProperty(document, 'enableReferenceLookup', false);
        if (isReferenceLookupEnabled) {
            const propertyAccessRegex = /(\.[a-zA-Z_$0-9]+)|(\$[a-zA-Z_$0-9]+)/g;
            for (const lineIndex of visibleLines) {
                var line = document.lineAt(lineIndex).text;
                if (!line) continue;
                if (token.isCancellationRequested) return Promise.reject();
                if (line.length > 20000) {
                    continue;
                }

                let matches;
                while ((matches = propertyAccessRegex.exec(line)) != null) {
                    const position = new Position(
                        lineIndex,
                        matches.index + 1 /* DOT or $ sign */ + 1 /* to be inside the word */
                    );
                    const range = document.getWordRangeAtPosition(position);
                    if (!range) continue;

                    const pendingDefinitionRequest = commands
                        .executeCommand('vscode.executeDefinitionProvider', document.uri, position)
                        .then((definitions: Location[]) => {
                            const pendingRequests = definitions.map(definition => {
                                if (definition && definition.range && definition.range.isSingleLine) {
                                    return workspace.openTextDocument(definition.uri).then(() => {
                                        return getImageInfo(definition.uri, [definition.range.start.line]).then(
                                            response => {
                                                response.images.forEach(p => (p.range = range));
                                                return response;
                                            }
                                        );
                                    });
                                }
                            });
                            return Promise.all(pendingRequests.filter(r => !!r)).then(responses => {
                                return {
                                    images: responses
                                        .map(response => response.images)
                                        .reduce((prev, curr) => prev.concat(...curr), [])
                                } as ImageInfoResponse;
                            });
                        });
                    requests.push(pendingDefinitionRequest);
                }
            }
        }

        requests.push(getImageInfo(document.uri, visibleLines));
        return Promise.all(requests)
            .then(responses => {
                return {
                    images: responses.map(response => response.images).reduce((prev, curr) => prev.concat(...curr), [])
                };
            })
            .catch(e => {
                console.warn(
                    'Connection was not yet ready when requesting image previews or an unexpected error occured.'
                );
                console.warn(e);
                return {
                    images: []
                };
            });
    };
    imageDecorator(symbolUpdater, context, client);
}
