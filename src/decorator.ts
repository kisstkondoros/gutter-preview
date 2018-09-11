import * as vscode from 'vscode';

import * as fs from 'fs';
import * as probe from 'probe-image-size';

import { findEditorsForDocument, clearEditorDecorations } from './util/editorutil';

import { ImageInfoResponse, ImageInfo } from './common/protocol';
import { LanguageClient } from 'vscode-languageclient';

interface Decoration {
    textEditorDecorationType: vscode.TextEditorDecorationType;
    decorations: vscode.DecorationOptions[];
    originalImagePath: string;
    imagePath: string;
}

export function imageDecorator(
    decoratorProvider: (uri: vscode.Uri) => Promise<ImageInfoResponse>,
    context: vscode.ExtensionContext,
    client: LanguageClient
) {
    const [major, minor] = vscode.version.split('.').map(v => parseInt(v));

    let scanResults: { [uri: string]: Decoration[] } = {};

    let throttleId = undefined;
    let throttledScan = (document: vscode.TextDocument, timeout: number = 500) => {
        if (throttleId) clearTimeout(throttleId);
        throttleId = setTimeout(() => scan(document), timeout);
    };

    const decorate = (
        showImagePreviewOnGutter: boolean,
        editor: vscode.TextEditor,
        imageInfo: ImageInfo,
        lastScanResult: Decoration[]
    ) => {
        let decorations: vscode.DecorationOptions[] = [];

        const uri = imageInfo.imagePath;
        const absoluteImagePath = imageInfo.originalImagePath;

        var range = client.protocol2CodeConverter.asRange(imageInfo.range);

        decorations.push({
            range: range,
            hoverMessage: ''
        });
        let decorationRenderOptions: vscode.DecorationRenderOptions = {
            gutterIconPath: uri,
            gutterIconSize: 'contain'
        };
        let textEditorDecorationType: vscode.TextEditorDecorationType = vscode.window.createTextEditorDecorationType(
            decorationRenderOptions
        );
        lastScanResult.push({
            textEditorDecorationType,
            decorations,
            originalImagePath: absoluteImagePath,
            imagePath: uri
        });
        if (showImagePreviewOnGutter && editor) {
            editor.setDecorations(textEditorDecorationType, decorations);
        }
    };

    let hoverProvider = {
        provideHover(document: vscode.TextDocument, position: vscode.Position): Thenable<vscode.Hover> {
            let range = document.getWordRangeAtPosition(position);
            let maxHeight = vscode.workspace.getConfiguration('gutterpreview').get('imagepreviewmaxheight', 100);
            if (maxHeight < 0) {
                maxHeight = 100;
            }
            let result: Thenable<vscode.Hover> = undefined;
            if (range) {
                if (major > 1 || (major == 1 && minor > 7)) {
                    const documentDecorators = getDocumentDecorators(document);
                    const matchingDecoratorAndItem = documentDecorators
                        .map(item => {
                            return {
                                item: item,
                                decoration: item.decorations.find(dec => range.start.line == dec.range.start.line)
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
                        let markedString: vscode.MarkedString = `![${item.originalImagePath}](${
                            item.imagePath
                        }|height=${maxHeight})`;
                        try {
                            result = probe(fs.createReadStream(item.imagePath)).then(
                                result => imageWithSize(markedString, result),
                                () => fallback(markedString)
                            );
                        } catch (error) {
                            result = Promise.resolve(fallback(markedString));
                        }
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

    const getDocumentDecorators = (document: vscode.TextDocument): Decoration[] => {
        const scanResult = scanResults[document.uri.toString()] || [];
        scanResults[document.uri.toString()] = scanResult;
        return scanResult;
    };
    const scan = (document: vscode.TextDocument) => {
        const editors = findEditorsForDocument(document);
        const config = vscode.workspace.getConfiguration('gutterpreview');
        const showImagePreviewOnGutter = config.get('showimagepreviewongutter', true);

        decoratorProvider(document.uri).then(symbolResponse => {
            const scanResult = getDocumentDecorators(document);
            clearEditorDecorations(document, scanResult.map(p => p.textEditorDecorationType));
            scanResult.length = 0;

            symbolResponse.images.forEach(p =>
                editors.forEach(editor => decorate(showImagePreviewOnGutter, editor, p, scanResult))
            );
        });
    };

    context.subscriptions.push(vscode.languages.registerHoverProvider(['*'], hoverProvider));

    context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(e => throttledScan(e.document)));
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(e => {
            throttledScan(e.document);
        })
    );
    context.subscriptions.push(
        vscode.workspace.onDidChangeWorkspaceFolders(() => {
            refreshAllVisibleEditors();
        })
    );
    context.subscriptions.push(
        vscode.workspace.onDidOpenTextDocument(e => {
            const scanResult = (scanResults[e.uri.toString()] = scanResults[e.uri.toString()] || []);
            clearEditorDecorations(e, scanResult.map(p => p.textEditorDecorationType));
            scanResult.length = 0;

            throttledScan(e);
        })
    );

    refreshAllVisibleEditors();
}
