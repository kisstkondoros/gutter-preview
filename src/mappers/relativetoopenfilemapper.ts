import * as path from 'path';
import * as url from 'url';
import * as fs from 'fs';

import { AbsoluteUrlMapper } from './mapper';
import { TextDocument } from 'vscode-languageserver';

export const relativeToOpenFileUrlMapper: AbsoluteUrlMapper = {
    map(document: TextDocument, imagePath: string) {
        let absoluteImagePath: string;
        const pathName = url.parse(imagePath).pathname;
        if (pathName) {
            let testImagePath = path.join(document.uri, '..', pathName);
            if (fs.existsSync(testImagePath)) {
                absoluteImagePath = testImagePath;
            }
        }
        return absoluteImagePath;
    },
    refreshConfig() {}
};
