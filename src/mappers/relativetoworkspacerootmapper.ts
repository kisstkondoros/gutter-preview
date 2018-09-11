import * as url from 'url';
import * as path from 'path';
import * as fs from 'fs';

import { TextDocument } from 'vscode-languageserver';
import { AbsoluteUrlMapper } from './mapper';

class RelativeToWorkspaceRootFileUrlMapper implements AbsoluteUrlMapper {
    private additionalSourceFolder: string = '';
    private workspaceFolder: string;

    map(document: TextDocument, imagePath: string) {
        let absoluteImagePath: string;

        if (this.workspaceFolder) {
            let rootPath = url.parse(this.workspaceFolder);
            const pathName = url.parse(imagePath).pathname;

            if (rootPath.protocol == 'file:' && pathName) {
                let testImagePath = path.join(rootPath.path, pathName);
                if (fs.existsSync(testImagePath)) {
                    absoluteImagePath = testImagePath;
                } else {
                    let testImagePath = path.join(rootPath.path, this.additionalSourceFolder, pathName);
                    if (fs.existsSync(testImagePath)) {
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
