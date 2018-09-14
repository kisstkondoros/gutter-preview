import * as path from 'path';
import * as fs from 'fs';

import { AbsoluteUrlMapper } from './mapper';

export const simpleUrlMapper: AbsoluteUrlMapper = {
    map(fileName: string, imagePath: string) {
        let absoluteImagePath: string;
        if (imagePath.indexOf('http') == 0) {
            absoluteImagePath = imagePath;
        } else if (imagePath.indexOf('//') == 0) {
            absoluteImagePath = 'http:' + imagePath;
        } else if (path.isAbsolute(imagePath)) {
            if (fs.existsSync(imagePath)) {
                absoluteImagePath = imagePath;
            }
        }
        return absoluteImagePath;
    },
    refreshConfig() {}
};
