import * as fs from 'fs';
import * as path from 'path';

import { AbsoluteUrlMapper } from './mapper';
import { ImageCache } from '../util/imagecache';

export const relativeToOpenFileUrlMapper: AbsoluteUrlMapper = {
    map(fileName: string, imagePath: string) {
        let absoluteImagePath: string;
        const pathName = path.normalize(imagePath);
        if (pathName) {
            let testImagePath = path.join(fileName, '..', pathName);
            if (ImageCache.has(testImagePath) || fs.existsSync(testImagePath)) {
                absoluteImagePath = testImagePath;
            }
        }
        return absoluteImagePath;
    },
    refreshConfig() {},
};
