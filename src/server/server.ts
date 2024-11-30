import RegexParser from 'regex-parser';
import {
    InitializeResult,
    IPCMessageReader,
    IPCMessageWriter,
    createConnection,
    Position,
    TextDocuments,
    CancellationToken,
    TextDocumentSyncKind,
    Connection,
} from 'vscode-languageserver/node';
import { GutterPreviewImageRequestType, ImageInfoResponse, ImageInfo, ImageInfoRequest } from '../common/protocol';

import { TextDocument } from 'vscode-languageserver-textdocument';

import * as path from 'path';

import { acceptedExtensions } from '../util/acceptedExtensions';
import { absoluteUrlMappers } from '../mappers';
import { recognizers } from '../recognizers';
import { nonNullOrEmpty, nonHttpOnly } from '../util/stringutil';

import { ImageCache } from '../util/imagecache';
import { UrlMatch } from '../recognizers/recognizer';
import { URI } from 'vscode-uri';
import { replaceCurrentColorInDataURI } from '../util/currentColorHelper';

let connection: Connection = createConnection(new IPCMessageReader(process), new IPCMessageWriter(process));

console.log = connection.console.log.bind(connection.console);
console.error = connection.console.error.bind(connection.console);

let documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);
documents.listen(connection);

connection.onInitialize((parameters): InitializeResult => {
    ImageCache.configure(parameters.initializationOptions.storagePath);
    return {
        capabilities: {
            textDocumentSync: TextDocumentSyncKind.Full,
        },
    };
});

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
    },
);
connection.onShutdown(() => {
    ImageCache.cleanup();
});
connection.listen();

async function collectEntries(
    document: TextDocument,
    request: ImageInfoRequest,
    cancellationToken: CancellationToken,
): Promise<ImageInfo[]> {
    let items = [];
    ImageCache.setCurrentColor(request.currentColor);
    absoluteUrlMappers.forEach((absoluteUrlMapper) =>
        absoluteUrlMapper.refreshConfig(request.workspaceFolder, request.additionalSourcefolder, request.paths),
    );

    const configuration = await connection.workspace.getConfiguration({
        scopeUri: document.uri,
        section: 'gutterpreview',
    });

    const urlDetectionPatterns = configuration.urlDetectionPatterns
        .map((pattern: string) => {
            try {
                return RegexParser(pattern);
            } catch {} // Illegal regular expression strings are ignored.
        })
        .filter((p: RegExp | undefined) => !!p);

    const lines = document.getText().split(/\r\n|\r|\n/);
    let relativeImageDir = '';
    for (const lineIndex of request.visibleLines) {
        var line = lines[lineIndex];
        if (!line) continue;
        if (cancellationToken.isCancellationRequested) return items;
        if (line.length > 20000) {
            continue;
        }
        if (line.startsWith(':imagesdir:')) {
            relativeImageDir = line.substring(':imagesdir:'.length).trim();
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
                                return mapper.map(request.fileName, urlMatch.url, { relativeImageDir });
                            } catch (e) {}
                        })
                        .filter((item) => nonNullOrEmpty(item) && nonHttpOnly(item));

                    let absoluteUrlsSet = new Set(absoluteUrls);

                    items = items.concat(
                        Array.from(absoluteUrlsSet.values()).map((absoluteImagePath) => {
                            const result =
                                convertToLocalImagePath(
                                    absoluteImagePath,
                                    urlMatch,
                                    urlDetectionPatterns,
                                    request.currentColor,
                                ) || Promise.resolve(null);
                            return result.catch((p) => null);
                        }),
                    );
                });
            });
    }
    return await Promise.all(items);
}
async function convertToLocalImagePath(
    absoluteImagePath: string,
    urlMatch: UrlMatch,
    urlDetectionPatterns: RegExp[] = [],
    currentColor: string,
): Promise<ImageInfo> {
    if (absoluteImagePath) {
        let isDataUri = absoluteImagePath.indexOf('data:image') == 0;
        let isExtensionSupported: boolean;
        let isPatternSupported: boolean;

        if (!isDataUri) {
            const absoluteImageUrl = URI.parse(absoluteImagePath);
            if (absoluteImageUrl && absoluteImageUrl.path) {
                let absolutePath = path.parse(absoluteImageUrl.path);
                isExtensionSupported = acceptedExtensions.some(
                    (ext) => absolutePath && absolutePath.ext && absolutePath.ext.toLowerCase().startsWith(ext),
                );
                if (!isExtensionSupported && urlDetectionPatterns.length) {
                    isPatternSupported = urlDetectionPatterns.some((regex) => regex.test(absoluteImagePath));
                }
            }
        }

        const start = Position.create(urlMatch.lineIndex, urlMatch.start);
        const end = Position.create(urlMatch.lineIndex, urlMatch.end);
        const range = { start, end };

        absoluteImagePath = absoluteImagePath.replace(/\|(width=\d*)?(height=\d*)?/gm, '');

        if (isDataUri || isExtensionSupported || isPatternSupported) {
            if (isDataUri) {
                return Promise.resolve({
                    originalImagePath: absoluteImagePath,
                    imagePath: replaceCurrentColorInDataURI(absoluteImagePath, currentColor),
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
