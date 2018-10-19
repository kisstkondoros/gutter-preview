import * as path from 'path';

import {
    ServerOptions,
    TransportKind,
    ErrorAction,
    Message,
    LanguageClientOptions,
    LanguageClient
} from 'vscode-languageclient';
import { ExtensionContext, window, workspace, TextDocument, CancellationToken } from 'vscode';
import { ImageInfoResponse, GutterPreviewImageRequestType } from './common/protocol';
import { imageDecorator } from './decorator';
import { getConfiguredProperty } from './util/configuration';

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
        return client.onReady().then(() => {
            const folder = workspace.getWorkspaceFolder(document.uri);
            let workspaceFolder;
            if (folder && folder.uri) {
                workspaceFolder = folder.uri.fsPath;
            }
            return client.sendRequest(
                GutterPreviewImageRequestType,
                {
                    uri: document.uri.toString(),
                    visibleLines: visibleLines,
                    fileName: document.fileName,
                    workspaceFolder: workspaceFolder,
                    additionalSourcefolder: getConfiguredProperty(document, 'sourceFolder', '')
                },
                token
            );
        });
    };
    imageDecorator(symbolUpdater, context, client);
}
