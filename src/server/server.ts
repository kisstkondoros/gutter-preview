import {
    InitializeResult,
    IPCMessageReader,
    IPCMessageWriter,
    IConnection,
    createConnection,
    Range,
    Position,
    TextDocuments,
    TextDocument
} from 'vscode-languageserver';
import { GutterPreviewImageRequestType, ImageInfoResponse, ImageInfo, ImageInfoRequest } from '../common/protocol';

import * as path from 'path';
import * as url from 'url';

import { absoluteUrlMappers } from '../mappers';
import { recognizers } from '../recognizers';
import { nonNullOrEmpty } from '../util/stringutil';

import { ImageCache } from '../util/imagecache';
import { UrlMatch } from '../recognizers/recognizer';

let connection: IConnection = createConnection(new IPCMessageReader(process), new IPCMessageWriter(process));

console.log = connection.console.log.bind(connection.console);
console.error = connection.console.error.bind(connection.console);

let documents: TextDocuments = new TextDocuments();
documents.listen(connection);

connection.onInitialize(
    (): InitializeResult => {
        return {
            capabilities: {
                textDocumentSync: documents.syncKind
            }
        };
    }
);

connection.onRequest(
    GutterPreviewImageRequestType,
    async (request: ImageInfoRequest): Promise<ImageInfoResponse> => {
        let document = documents.get(request.uri);
        if (document) {
            const entries = await collectEntries(document, request).then(values => values.filter(p => !!p));
            return {
                images: entries
            };
        } else {
            return {
                images: []
            };
        }
    }
);
connection.onShutdown(() => {
    ImageCache.cleanup();
});
connection.listen();

const acceptedExtensions = ['.svg', '.png', '.jpeg', '.jpg', '.bmp', '.gif'];
async function collectEntries(document: TextDocument, request: ImageInfoRequest): Promise<ImageInfo[]> {
    let items = [];

    absoluteUrlMappers.forEach(absoluteUrlMapper =>
        absoluteUrlMapper.refreshConfig(request.workspaceFolder, request.additionalSourcefolder)
    );

    const lines = document.getText().split(/\r\n|\r|\n/);
    var max = lines.length;
    for (var lineIndex = 0; lineIndex < max; lineIndex++) {
        var line = lines[lineIndex];

        recognizers
            .map(recognizer => recognizer.recognize(document, lineIndex, line))
            .filter(item => !!item)
            .forEach(urlMatch => {
                let absoluteUrls = absoluteUrlMappers
                    .map(mapper => {
                        try {
                            return mapper.map(document, urlMatch.url);
                        } catch (e) {}
                    })
                    .filter(item => nonNullOrEmpty(item));
                let absoluteUrlsSet = new Set(absoluteUrls);

                items = items.concat(
                    Array.from(absoluteUrlsSet.values()).map(absoluteImagePath =>
                        convertToLocalImagePath(absoluteImagePath, urlMatch)
                    )
                );
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
            if (absoluteImageUrl.pathname) {
                let absolutePath = path.parse(absoluteImageUrl.pathname);
                isExtensionSupported = acceptedExtensions.some(
                    ext => absolutePath.ext && absolutePath.ext.toLowerCase().startsWith(ext)
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
                    range
                });
            } else {
                return ImageCache.store(absoluteImagePath, () => {
                    //throttledScan(editor.document, 50);
                }).then(imagePath => {
                    return {
                        originalImagePath: absoluteImagePath,
                        imagePath,
                        range
                    };
                });
            }
        }
    }
}
