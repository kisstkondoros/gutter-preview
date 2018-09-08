import * as vscode from 'vscode';
import * as tmp from 'tmp';
import * as request from 'request';
import * as path from 'path';
import * as url from 'url';
import * as fs from 'fs';
import * as probe from 'probe-image-size';

import { absoluteUrlMappers } from './mappers';
import { recognizers } from './recognizers';
import { findEditorForDocument, clearEditorDecorations } from './util/editorutil';
import { copyFile } from './util/fileutil';
import { nonNullOrEmpty } from './util/stringutil';
import { ImageCache } from './util/imagecache';

tmp.setGracefulCleanup();

interface Decoration {
    textEditorDecorationType: vscode.TextEditorDecorationType;
    decorations: vscode.DecorationOptions[];
    originalImagePath: string;
    imagePath: string;
}

export function activate(context: vscode.ExtensionContext) {
    const acceptedExtensions = ['.svg', '.png', '.jpeg', '.jpg', '.bmp', '.gif'];
    const [major, minor] = vscode.version.split('.').map(v => parseInt(v));

    const collectEntries = (document: vscode.TextDocument, lastScanResult: Decoration[]) => {
        var max = document.lineCount;
        const editor = findEditorForDocument(document);
        const config = vscode.workspace.getConfiguration('gutterpreview');
        const showImagePreviewOnGutter = config.get('showimagepreviewongutter', true);
        absoluteUrlMappers.forEach(absoluteUrlMapper => absoluteUrlMapper.refreshConfig());

        for (var lineIndex = 0; lineIndex < max; lineIndex++) {
            var lineObject = document.lineAt(lineIndex);
            var line = lineObject.text;

            let recognizedImages = recognizers
                .map(recognizer => recognizer.recognize(document, line))
                .filter(item => nonNullOrEmpty(item));
            recognizedImages.forEach(imagePath => {
                let absoluteUrls = absoluteUrlMappers
                    .map(mapper => {
                        try {
                            return mapper.map(document, imagePath);
                        } catch (e) {}
                    })
                    .filter(item => nonNullOrEmpty(item));
                let absoluteUrlsSet = new Set(absoluteUrls);

                absoluteUrlsSet.forEach(absoluteImagePath => {
                    appendImagePath(editor, showImagePreviewOnGutter, absoluteImagePath, lineIndex, lastScanResult);
                });
            });
        }
    };

    const appendImagePath = (
        editor: vscode.TextEditor,
        showImagePreviewOnGutter: boolean,
        absoluteImagePath: string,
        lineIndex: number,
        lastScanResult: Decoration[]
    ) => {
        if (absoluteImagePath) {
            let isDataUri = absoluteImagePath.indexOf('data:image') == 0;
            let isExtensionSupported: boolean;

            if (!isDataUri) {
                const absoluteImageUrl = url.parse(absoluteImagePath);
                if (absoluteImageUrl.pathname) {
                    let absolutePath = path.parse(absoluteImageUrl.pathname);
                    isExtensionSupported = acceptedExtensions.some(
                        ext => absolutePath.ext && absolutePath.ext.toLowerCase().startsWith(ext)
                    );
                }
            }

            absoluteImagePath = absoluteImagePath.replace(/\|(width=\d*)?(height=\d*)?/gm, '');
            if (isDataUri || isExtensionSupported) {
                let decorations: vscode.DecorationOptions[] = [];
                decorations.push({
                    range: new vscode.Range(lineIndex, 0, lineIndex, 0),
                    hoverMessage: ''
                });
                var uri: vscode.Uri | string = absoluteImagePath;
                if (major > 1 || (major == 1 && minor > 5)) {
                    uri = vscode.Uri.parse(absoluteImagePath);
                }
                const decorate = uri => {
                    let decorationRenderOptions: vscode.DecorationRenderOptions = {
                        gutterIconPath: uri,
                        gutterIconSize: 'contain'
                    };
                    let textEditorDecorationType: vscode.TextEditorDecorationType = vscode.window.createTextEditorDecorationType(
                        <any>decorationRenderOptions
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
                if (isDataUri) {
                    decorate(uri);
                } else {
                    if (ImageCache.has(absoluteImagePath)) {
                        ImageCache.get(absoluteImagePath).then(path => decorate(path));
                    } else {
                        try {
                            const absoluteImageUrl = url.parse(absoluteImagePath);
                            const tempFile = tmp.fileSync({
                                postfix: absoluteImageUrl.pathname ? path.parse(absoluteImageUrl.pathname).ext : 'png'
                            });
                            const filePath = tempFile.name;
                            const promise = new Promise<string>(resolve => {
                                if (absoluteImageUrl.protocol && absoluteImageUrl.protocol.startsWith('http')) {
                                    var r = request(absoluteImagePath).on('response', function(res) {
                                        r.pipe(fs.createWriteStream(filePath)).on('close', () => {
                                            resolve(filePath);
                                        });
                                    });
                                } else {
                                    const handle = fs.watch(absoluteImagePath, function fileChangeListener() {
                                        handle.close();
                                        fs.unlink(filePath, () => {});
                                        ImageCache.delete(absoluteImagePath);
                                        throttledScan(editor.document, 50);
                                    });
                                    copyFile(absoluteImagePath, filePath, err => {
                                        if (!err) {
                                            resolve(filePath);
                                        }
                                    });
                                }
                            });
                            promise.then(path => decorate(path));

                            ImageCache.set(absoluteImagePath, promise);
                        } catch (error) {}
                    }
                }
            }
        }
    };

    let disposables: vscode.Disposable[] = [];
    let scanResults: { [uri: string]: Decoration[] } = {};
    let throttleId = undefined;
    let throttledScan = (document: vscode.TextDocument, timeout: number = 500) => {
        if (throttleId) clearTimeout(throttleId);
        throttleId = setTimeout(() => scan(document), timeout);
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
        const scanResult = getDocumentDecorators(document);

        clearEditorDecorations(document, scanResult.map(p => p.textEditorDecorationType));
        scanResult.length = 0;
        collectEntries(document, scanResult);
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

    disposables.push(vscode.languages.registerHoverProvider(['*'], hoverProvider));
    disposables.push(
        vscode.Disposable.from({
            dispose: () => ImageCache.cleanup()
        })
    );

    vscode.workspace.onDidChangeTextDocument(e => throttledScan(e.document));
    vscode.window.onDidChangeActiveTextEditor(e => {
        ImageCache.cleanup();
        throttledScan(e.document);
    });
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
        ImageCache.cleanup();
        refreshAllVisibleEditors();
    });
    vscode.workspace.onDidOpenTextDocument(e => {
        const scanResult = (scanResults[e.uri.toString()] = scanResults[e.uri.toString()] || []);
        clearEditorDecorations(e, scanResult.map(p => p.textEditorDecorationType));
        scanResult.length = 0;

        ImageCache.cleanup();
        throttledScan(e);
    });

    refreshAllVisibleEditors();
    context.subscriptions.push(...disposables);
}
