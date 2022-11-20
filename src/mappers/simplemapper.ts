import * as fs from 'fs';
import * as path from 'path';

import { AbsoluteUrlMapper } from './mapper';
import { ImageCache } from '../util/imagecache';

export const simpleUrlMapper: AbsoluteUrlMapper = {
    map(imagePath: string) {
        let absoluteImagePath: string;
        if (imagePath.indexOf('http') == 0) {
            absoluteImagePath = imagePath;
        } else if (imagePath.indexOf('//') == 0) {
            absoluteImagePath = 'http:' + imagePath;
        } else if (path.isAbsolute(imagePath)) {
            if (ImageCache.has(imagePath) || fs.existsSync(imagePath)) {
                absoluteImagePath = imagePath;
            }
        }
        return absoluteImagePath;
    },
    refreshConfig() {},
};
