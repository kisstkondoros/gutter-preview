import * as url from 'url';
import * as path from 'path';
import * as fs from 'fs';

import { workspace, TextDocument } from 'vscode';
import { AbsoluteUrlMapper } from './mapper';

class RelativeToWorkspaceRootFileUrlMapper implements AbsoluteUrlMapper {
    private additionalSourceFolder: string = '';
    map(document: TextDocument, imagePath: string) {
        let absoluteImagePath: string;
        let root = workspace.getWorkspaceFolder(document.uri);
        if (root && root.uri && root.uri.fsPath) {
            const rootPath = root.uri.fsPath;
            const pathName = url.parse(imagePath).pathname;
            if (pathName) {
                let testImagePath = path.join(rootPath, pathName);
                if (fs.existsSync(testImagePath)) {
                    absoluteImagePath = testImagePath;
                } else {
                    let testImagePath = path.join(rootPath, this.additionalSourceFolder, pathName);
                    if (fs.existsSync(testImagePath)) {
                        absoluteImagePath = testImagePath;
                    }
                }
            }
        }
        return absoluteImagePath;
    }
    refreshConfig() {
        const config = workspace.getConfiguration('gutterpreview');
        this.additionalSourceFolder = config.get('sourcefolder', '');
    }
}
export const relativeToWorkspaceRootFileUrlMapper: AbsoluteUrlMapper = new RelativeToWorkspaceRootFileUrlMapper();
