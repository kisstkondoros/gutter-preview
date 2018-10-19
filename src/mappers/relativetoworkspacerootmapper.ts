import * as url from 'url';
import * as path from 'path';
import * as fs from 'fs';

import { AbsoluteUrlMapper } from './mapper';
import { ImageCache } from '../util/imagecache';

class RelativeToWorkspaceRootFileUrlMapper implements AbsoluteUrlMapper {
    private additionalSourceFolder: string = '';
    private workspaceFolder: string;

    map(fileName: string, imagePath: string) {
        let absoluteImagePath: string;

        if (this.workspaceFolder) {
            let rootPath = url.parse(this.workspaceFolder);
            const pathName = url.parse(imagePath).pathname;

            if (pathName) {
                let testImagePath = path.join(rootPath.href, pathName);
                if (ImageCache.has(testImagePath) || fs.existsSync(testImagePath)) {
                    absoluteImagePath = testImagePath;
                } else {
                    let testImagePath = path.join(rootPath.href, this.additionalSourceFolder, pathName);
                    if (ImageCache.has(testImagePath) || fs.existsSync(testImagePath)) {
                        absoluteImagePath = testImagePath;
                    }
                }
            }
        }
        return absoluteImagePath;
    }
    refreshConfig(workspaceFolder: string, sourcefolder: string) {
        this.workspaceFolder = workspaceFolder;
        this.additionalSourceFolder = sourcefolder;
    }
}
export const relativeToWorkspaceRootFileUrlMapper: AbsoluteUrlMapper = new RelativeToWorkspaceRootFileUrlMapper();
