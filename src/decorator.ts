import * as util from 'util';
import * as vscode from 'vscode';
import slash from 'slash';
import { imageSize } from 'image-size';

import { findEditorsForDocument, clearEditorDecorations } from './util/editorutil';
import { getFilesize, isLocalFile, isUrlEncodedFile } from './util/fileutil';

import { ImageInfoResponse, ImageInfo } from './common/protocol';
import { LanguageClient } from 'vscode-languageclient/node';
import { getConfiguredProperty } from './util/configuration';

interface Decoration {
    textEditorDecorationType: vscode.TextEditorDecorationType;
    decorations: vscode.DecorationOptions[];
    originalImagePath: string;
    imagePath: string;
}
interface ScanResult {
    decorations: Decoration[];
    token: vscode.CancellationTokenSource;
}
export function imageDecorator(
    decoratorProvider: (
        document: vscode.TextDocument,
        visibleLines: number[],
        token: vscode.CancellationToken
    ) => Promise<ImageInfoResponse>,
    context: vscode.ExtensionContext,
    client: LanguageClient
) {
    const [major, minor] = vscode.version.split('.').map((v) => parseInt(v));

    let scanResults: { [uri: string]: ScanResult } = {};

    let throttleIds = {};
    let throttledScan = (document: vscode.TextDocument, timeout: number = 500) => {
        if (document && document.uri) {
            const lookupKey = document.uri.toString();
            if (throttleIds[lookupKey]) clearTimeout(throttleIds[lookupKey]);
            throttleIds[lookupKey] = setTimeout(() => {
                scan(document);
                delete throttleIds[lookupKey];
            }, timeout);
        }
    };

    const decorate = (
        showImagePreviewOnGutter: boolean,
        editor: vscode.TextEditor,
        imageInfo: ImageInfo,
        lastScanResult: Decoration[]
    ) => {
        let decorations: vscode.DecorationOptions[] = [];

        const uri = imageInfo.imagePath.startsWith('data:')
            ? vscode.Uri.parse(imageInfo.imagePath)
            : vscode.Uri.file(slash(imageInfo.imagePath));

        const underlineEnabled = getConfiguredProperty(
            editor && editor.document ? editor.document : undefined,
            'showUnderline',
            true
        );

        var range = client.protocol2CodeConverter.asRange(imageInfo.range);
        decorations.push({
            range: range,
            hoverMessage: '',
        });

        let decorationRenderOptions: vscode.DecorationRenderOptions = {
            gutterIconPath: uri,
            gutterIconSize: 'contain',
            textDecoration: underlineEnabled ? 'underline' : 'none',
        };
        let textEditorDecorationType: vscode.TextEditorDecorationType = vscode.window.createTextEditorDecorationType(
            decorationRenderOptions
        );
        lastScanResult.push({
            textEditorDecorationType,
            decorations,
            originalImagePath: imageInfo.originalImagePath,
            imagePath: imageInfo.imagePath,
        });
        const toSingleLineDecorationOption = (source: vscode.DecorationOptions): vscode.DecorationOptions => {
            return {
                hoverMessage: source.hoverMessage,
                range: new vscode.Range(source.range.start, source.range.start),
                renderOptions: source.renderOptions,
            };
        };
        if (showImagePreviewOnGutter && editor) {
            editor.setDecorations(
                textEditorDecorationType,
                decorations.map((p) => toSingleLineDecorationOption(p))
            );
        }
    };

    let hoverProvider = {
        provideHover(document: vscode.TextDocument, position: vscode.Position): Thenable<vscode.Hover> {
            let maxHeight = getConfiguredProperty(document, 'imagePreviewMaxHeight', 100);
            if (maxHeight < 0) {
                maxHeight = 100;
            }
            let result: Thenable<vscode.Hover> = undefined;

            if (major > 1 || (major == 1 && minor > 7)) {
                const documentDecorators = getDocumentDecorators(document);
                const matchingDecoratorAndItem = documentDecorators.decorations
                    .map((item) => {
                        return {
                            item: item,
                            decoration: item.decorations.find((dec) => dec.range.contains(position)),
                        };
                    })
                    .find((pair) => pair.decoration != null);

                if (matchingDecoratorAndItem && matchingDecoratorAndItem.decoration) {
                    const item = matchingDecoratorAndItem.item;

                    let formatPreview = (
                        imagePath: string,
                        options?: {
                            hasOpenFileCommand?: boolean;
                            dimentions?: { height: number; width: number };
                            size?: string;
                        }
                    ) => {
                        const { hasOpenFileCommand = true, dimentions, size } = options || {};
                        let result = '';

                        if (isLocalFile(imagePath) && !isUrlEncodedFile(imagePath)) {
                            imagePath = vscode.Uri.file(imagePath).toString();
                        }

                        if (hasOpenFileCommand && isLocalFile(item.originalImagePath)) {
                            const uri = vscode.Uri.file(item.originalImagePath);
                            const args = [uri];
                            const openFileCommandUrl = vscode.Uri.parse(
                                `command:revealInExplorer?${encodeURIComponent(JSON.stringify(args))}`
                            );
                            const browseFileCommandUrl = vscode.Uri.parse(
                                `command:revealFileInOS?${encodeURIComponent(JSON.stringify(args))}`
                            );
                            result += `  \r\n[Reveal in Side Bar](${openFileCommandUrl} "Reveal in Side Bar")`;
                            result += `  \r\n`;
                            result += `  \r\n[Open Containing Folder](${browseFileCommandUrl} "Open Containing Folder")`;
                        }

                        if (dimentions?.height && dimentions?.width) {
                            result += `  \r\n${dimentions.width}x${dimentions.height}`;
                        }

                        if (size) {
                            result += `  \r\n${size}`;
                        }

                        if (result.length > 0) {
                            result += `\r\n\r\n`;
                        }
                        result += `![${imagePath}](${imagePath}|height=${maxHeight})`;

                        const contents = new vscode.MarkdownString(result);
                        contents.isTrusted = true;

                        return new vscode.Hover(contents, matchingDecoratorAndItem.decoration.range);
                    };

                    try {
                        if (isUrlEncodedFile(item.originalImagePath)) {
                            result = Promise.resolve(
                                formatPreview(item.originalImagePath, { hasOpenFileCommand: false })
                            );
                        } else {
                            const dimentionsOfPromise = util.promisify(imageSize)(item.imagePath);
                            const sizeOfPromise = getFilesize(item.imagePath);

                            result = Promise.all([dimentionsOfPromise, sizeOfPromise]).then(
                                ([dimentions, size]) => formatPreview(item.imagePath, { dimentions, size }),
                                () => formatPreview(item.imagePath)
                            );
                        }
                    } catch (error) {
                        result = Promise.resolve(formatPreview(item.imagePath));
                    }
                }
            }

            return result;
        },
    };

    const refreshAllVisibleEditors = () => {
        vscode.window.visibleTextEditors
            .map((p) => p.document)
            .filter((p) => p != null)
            .forEach((doc) => throttledScan(doc));
    };

    const getDocumentDecorators = (document: vscode.TextDocument): ScanResult => {
        const scanResult = scanResults[document.uri.toString()] || {
            decorations: [],
            token: new vscode.CancellationTokenSource(),
        };
        scanResults[document.uri.toString()] = scanResult;
        return scanResult;
    };
    const scan = (document: vscode.TextDocument) => {
        const editors = findEditorsForDocument(document);
        if (editors.length > 0) {
            const showImagePreviewOnGutter = getConfiguredProperty(document, 'showImagePreviewOnGutter', true);
            const visibleLines = [];
            for (const editor of editors) {
                for (const range of editor.visibleRanges) {
                    let lineIndex = range.start.line;
                    while (lineIndex <= range.end.line) {
                        visibleLines.push(lineIndex);
                        lineIndex++;
                    }
                }
            }
            const scanResult = getDocumentDecorators(document);
            scanResult.token.cancel();
            scanResult.token = new vscode.CancellationTokenSource();

            decoratorProvider(document, visibleLines, scanResult.token.token)
                .then((symbolResponse) => {
                    const scanResult = getDocumentDecorators(document);
                    clearEditorDecorations(
                        document,
                        scanResult.decorations.map((p) => p.textEditorDecorationType)
                    );
                    scanResult.decorations.length = 0;

                    symbolResponse.images.forEach((p) => {
                        editors.forEach((editor) =>
                            decorate(showImagePreviewOnGutter, editor, p, scanResult.decorations)
                        );
                    });
                })
                .catch((e) => {
                    console.error(e);
                });
        }
    };

    context.subscriptions.push(vscode.languages.registerHoverProvider(['*'], hoverProvider));

    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument((e) => {
            if (e) {
                throttledScan(e.document);
            }
        })
    );
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor((e) => {
            if (e) {
                throttledScan(e.document);
            }
        })
    );
    context.subscriptions.push(
        vscode.workspace.onDidChangeWorkspaceFolders(() => {
            refreshAllVisibleEditors();
        })
    );
    context.subscriptions.push(
        vscode.window.onDidChangeTextEditorVisibleRanges((event) => {
            if (event && event.textEditor && event.textEditor.document) {
                const document = event.textEditor.document;
                throttledScan(document, 50);
            }
        })
    );
    context.subscriptions.push(
        vscode.workspace.onDidOpenTextDocument((e) => {
            if (e) {
                throttledScan(e);
            }
        })
    );

    refreshAllVisibleEditors();
}
