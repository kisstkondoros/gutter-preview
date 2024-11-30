import * as path from 'path';
import * as fs from 'fs';

import { AbsoluteUrlMapper } from './mapper';
import { ImageCache } from '../util/imagecache';

export const relativeToOpenFileUrlMapper: AbsoluteUrlMapper = {
    map(fileName: string, imagePath: string, additionalMetadata?: { relativeImageDir?: string }) {
        let absoluteImagePath: string;
        const pathName = path.normalize(imagePath);
        if (pathName) {
            let testImagePath = path.join(fileName, '..', additionalMetadata?.relativeImageDir || '', pathName);
            if (ImageCache.has(testImagePath) || fs.existsSync(testImagePath)) {
                absoluteImagePath = testImagePath;
            }
        }
        return absoluteImagePath;
    },
    refreshConfig() {},
};
