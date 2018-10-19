import * as path from 'path';
import * as url from 'url';
import * as fs from 'fs';

import { AbsoluteUrlMapper } from './mapper';
import { ImageCache } from '../util/imagecache';

export const relativeToOpenFileUrlMapper: AbsoluteUrlMapper = {
    map(fileName: string, imagePath: string) {
        let absoluteImagePath: string;
        const pathName = url.parse(imagePath).pathname;
        if (pathName) {
            let testImagePath = path.join(fileName, '..', pathName);
            if (ImageCache.has(testImagePath) || fs.existsSync(testImagePath)) {
                absoluteImagePath = testImagePath;
            }
        }
        return absoluteImagePath;
    },
    refreshConfig() {}
};
