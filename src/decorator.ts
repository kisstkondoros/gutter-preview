import * as vscode from 'vscode';
import slash = require('slash');
import * as fs from 'fs';
import * as probe from 'probe-image-size';
import 'any-promise/register/es6-promise';

import { findEditorsForDocument, clearEditorDecorations } from './util/editorutil';

import { ImageInfoResponse, ImageInfo } from './common/protocol';
import { LanguageClient } from 'vscode-languageclient';
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
    const [major, minor] = vscode.version.split('.').map(v => parseInt(v));

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

        const normalizedPath = imageInfo.imagePath.startsWith('data:')
            ? imageInfo.imagePath
            : 'file://' + slash(imageInfo.imagePath);
        let uri: vscode.Uri = vscode.Uri.parse(normalizedPath);

        const absoluteImagePath = imageInfo.originalImagePath;
        const underlineEnabled = getConfiguredProperty(
            editor && editor.document ? editor.document : undefined,
            'showUnderline',
            true
        );

        var range = client.protocol2CodeConverter.asRange(imageInfo.range);
        decorations.push({
            range: range,
            hoverMessage: ''
        });

        let decorationRenderOptions: vscode.DecorationRenderOptions = {
            gutterIconPath: uri,
            gutterIconSize: 'contain',
            textDecoration: underlineEnabled ? 'underline' : 'none'
        };
        let textEditorDecorationType: vscode.TextEditorDecorationType = vscode.window.createTextEditorDecorationType(
            decorationRenderOptions
        );
        lastScanResult.push({
            textEditorDecorationType,
            decorations,
            originalImagePath: absoluteImagePath,
            imagePath: imageInfo.imagePath
        });
        const toSingleLineDecorationOption = (source: vscode.DecorationOptions): vscode.DecorationOptions => {
            return {
                hoverMessage: source.hoverMessage,
                range: new vscode.Range(source.range.start, source.range.start),
                renderOptions: source.renderOptions
            };
        };
        if (showImagePreviewOnGutter && editor) {
            editor.setDecorations(textEditorDecorationType, decorations.map(p => toSingleLineDecorationOption(p)));
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
                    .map(item => {
                        return {
                            item: item,
                            decoration: item.decorations.find(dec => dec.range.contains(position))
                        };
                    })
                    .find(pair => pair.decoration != null);

                if (matchingDecoratorAndItem) {
                    const item = matchingDecoratorAndItem.item;

                    var fallback = (markedString: vscode.MarkedString) => {
                        let resultset: vscode.MarkedString[] = [markedString];
                        return new vscode.Hover(resultset, document.getWordRangeAtPosition(position));
                    };
                    var imageWithSize = (markedString, result) => {
                        let resultset: vscode.MarkedString[] = [
                            markedString + `  \r\n${result.width}x${result.height}`
                        ];
                        return new vscode.Hover(resultset, document.getWordRangeAtPosition(position));
                    };
                    let markedString: (string) => vscode.MarkedString = imagePath =>
                        `![${imagePath}](${imagePath}|height=${maxHeight})`;
                    try {
                        if (item.originalImagePath.startsWith('data:image')) {
                            result = Promise.resolve(fallback(markedString(item.originalImagePath)));
                        } else {
                            result = probe(fs.createReadStream(item.imagePath)).then(
                                result => imageWithSize(markedString(item.imagePath), result),
                                () => fallback(markedString(item.imagePath))
                            );
                        }
                    } catch (error) {
                        result = Promise.resolve(fallback(markedString(item.imagePath)));
                    }
                }
            }
            return result;
        }
    };

    const refreshAllVisibleEditors = () => {
        vscode.window.visibleTextEditors
            .map(p => p.document)
            .filter(p => p != null)
            .forEach(doc => throttledScan(doc));
    };

    const getDocumentDecorators = (document: vscode.TextDocument): ScanResult => {
        const scanResult = scanResults[document.uri.toString()] || {
            decorations: [],
            token: new vscode.CancellationTokenSource()
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
                .then(symbolResponse => {
                    const scanResult = getDocumentDecorators(document);
                    clearEditorDecorations(document, scanResult.decorations.map(p => p.textEditorDecorationType));
                    scanResult.decorations.length = 0;

                    symbolResponse.images.forEach(p => {
                        editors.forEach(editor =>
                            decorate(showImagePreviewOnGutter, editor, p, scanResult.decorations)
                        );
                    });
                })
                .catch(e => {
                    console.error(e);
                });
        }
    };

    context.subscriptions.push(vscode.languages.registerHoverProvider(['*'], hoverProvider));

    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(e => {
            if (e) {
                throttledScan(e.document);
            }
        })
    );
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(e => {
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
        vscode.window.onDidChangeTextEditorVisibleRanges(event => {
            if (event && event.textEditor && event.textEditor.document) {
                const document = event.textEditor.document;
                throttledScan(document, 50);
            }
        })
    );
    context.subscriptions.push(
        vscode.workspace.onDidOpenTextDocument(e => {
            if (e) {
                throttledScan(e);
            }
        })
    );

    refreshAllVisibleEditors();
}
