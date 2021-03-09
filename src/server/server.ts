import {
    InitializeResult,
    IPCMessageReader,
    IPCMessageWriter,
    createConnection,
    Position,
    TextDocuments,
    CancellationToken,
    TextDocumentSyncKind,
    Connection
} from 'vscode-languageserver/node';
import { GutterPreviewImageRequestType, ImageInfoResponse, ImageInfo, ImageInfoRequest } from '../common/protocol';

import { TextDocument } from 'vscode-languageserver-textdocument';

import * as path from 'path';
import * as url from 'url';

import { acceptedExtensions } from '../util/acceptedExtensions';
import { absoluteUrlMappers } from '../mappers';
import { recognizers } from '../recognizers';
import { nonNullOrEmpty } from '../util/stringutil';

import { ImageCache } from '../util/imagecache';
import { UrlMatch } from '../recognizers/recognizer';

let connection: Connection = createConnection(new IPCMessageReader(process), new IPCMessageWriter(process));

console.log = connection.console.log.bind(connection.console);
console.error = connection.console.error.bind(connection.console);

let documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);
documents.listen(connection);

connection.onInitialize(
    (): InitializeResult => {
        return {
            capabilities: {
                textDocumentSync: TextDocumentSyncKind.Full,
            },
        };
    }
);

connection.onRequest(
    GutterPreviewImageRequestType,
    async (request: ImageInfoRequest, cancellationToken: CancellationToken): Promise<ImageInfoResponse> => {
        try {
            let document = documents.get(request.uri);
            if (document) {
                const cancellation = new Promise<ImageInfo[]>((res, rej) => {
                    cancellationToken.onCancellationRequested(() => {
                        res([]);
                    });
                });
                return Promise.race([collectEntries(document, request, cancellationToken), cancellation])
                    .then((values) => values.filter((p) => !!p))
                    .then((entries) => {
                        return {
                            images: entries.filter((p) => !!p),
                        };
                    })
                    .catch((e) => {
                        console.error(e);
                        return {
                            images: [],
                        };
                    });
            } else {
                return {
                    images: [],
                };
            }
        } catch (e) {
            console.error(e);
            return {
                images: [],
            };
        }
    }
);
connection.onShutdown(() => {
    ImageCache.cleanup();
});
connection.listen();

async function collectEntries(
    document: TextDocument,
    request: ImageInfoRequest,
    cancellationToken: CancellationToken
): Promise<ImageInfo[]> {
    let items = [];
    ImageCache.setCurrentColor(request.currentColor);
    absoluteUrlMappers.forEach((absoluteUrlMapper) =>
        absoluteUrlMapper.refreshConfig(request.workspaceFolder, request.additionalSourcefolder, request.paths)
    );

    const lines = document.getText().split(/\r\n|\r|\n/);
    for (const lineIndex of request.visibleLines) {
        var line = lines[lineIndex];
        if (!line) continue;
        if (cancellationToken.isCancellationRequested) return items;
        if (line.length > 20000) {
            continue;
        }

        recognizers
            .map((recognizer) => {
                if (cancellationToken.isCancellationRequested) return;
                return recognizer.recognize(lineIndex, line);
            })
            .filter((item) => !!item)
            .map((matches) => {
                if (document.languageId == 'latex') {
                    matches.forEach((match) => {
                        if (match.url.startsWith('{') && match.url.endsWith('}')) {
                            match.url = match.url.substring(1, match.url.length - 1);
                            match.start += 1;
                            match.end -= 1;
                        }
                    });
                }
                return matches;
            })
            .forEach((urlMatches) => {
                if (cancellationToken.isCancellationRequested) return;
                urlMatches.forEach((urlMatch) => {
                    if (cancellationToken.isCancellationRequested) return;
                    let absoluteUrls = absoluteUrlMappers
                        .map((mapper) => {
                            try {
                                return mapper.map(request.fileName, urlMatch.url);
                            } catch (e) {}
                        })
                        .filter((item) => nonNullOrEmpty(item));

                    let absoluteUrlsSet = new Set(absoluteUrls);

                    items = items.concat(
                        Array.from(absoluteUrlsSet.values()).map((absoluteImagePath) => {
                            const result =
                                convertToLocalImagePath(absoluteImagePath, urlMatch) || Promise.resolve(null);
                            return result.catch((p) => null);
                        })
                    );
                });
            });
    }
    return await Promise.all(items);
}
async function convertToLocalImagePath(absoluteImagePath: string, urlMatch: UrlMatch): Promise<ImageInfo> {
    if (absoluteImagePath) {
        let isDataUri = absoluteImagePath.indexOf('data:image') == 0;
        let isExtensionSupported: boolean;

        if (!isDataUri) {
            const absoluteImageUrl = url.parse(absoluteImagePath);
            if (absoluteImageUrl && absoluteImageUrl.pathname) {
                let absolutePath = path.parse(absoluteImageUrl.pathname);
                isExtensionSupported = acceptedExtensions.some(
                    (ext) => absolutePath && absolutePath.ext && absolutePath.ext.toLowerCase().startsWith(ext)
                );
            }
        }

        const start = Position.create(urlMatch.lineIndex, urlMatch.start);
        const end = Position.create(urlMatch.lineIndex, urlMatch.end);
        const range = { start, end };

        absoluteImagePath = absoluteImagePath.replace(/\|(width=\d*)?(height=\d*)?/gm, '');

        if (isDataUri || isExtensionSupported) {
            if (isDataUri) {
                return Promise.resolve({
                    originalImagePath: absoluteImagePath,
                    imagePath: absoluteImagePath,
                    range,
                });
            } else {
                return ImageCache.store(absoluteImagePath).then((imagePath) => {
                    return {
                        originalImagePath: absoluteImagePath,
                        imagePath,
                        range,
                    };
                });
            }
        }
    }
}
