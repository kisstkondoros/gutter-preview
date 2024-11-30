import * as path from 'path';
import * as fs from 'fs';

import { AbsoluteUrlMapper } from './mapper';
import { ImageCache } from '../util/imagecache';

class RelativeToWorkspaceRootFileUrlMapper implements AbsoluteUrlMapper {
    private additionalSourceFolders: string[] = [];
    private workspaceFolder: string;
    private paths: { [alias: string]: string | string[] };
    private aliases: string[];

    map(fileName: string, imagePath: string) {
        let absoluteImagePath: string;

        if (this.workspaceFolder) {
            let rootPath = path.normalize(this.workspaceFolder);
            const pathName = path.normalize(imagePath).replace(/\\/g, '/');
            if (pathName) {
                const pathsToTest = [pathName];
                if (this.paths['']) {
                    let aliases = this.paths[''];
                    if (!Array.isArray(aliases)) {
                        aliases = [aliases];
                    }
                    aliases.forEach((alias) => {
                        const resolvedPath = path.join(alias, pathName);
                        pathsToTest.push(resolvedPath);
                    });
                }
                this.aliases.forEach((alias) => {
                    if (alias != '' && pathName.startsWith(alias)) {
                        let aliases = this.paths[alias];
                        if (!Array.isArray(aliases)) {
                            aliases = [aliases];
                        }
                        aliases.forEach((replacement) => {
                            pathsToTest.push(pathName.replace(alias, replacement));
                        });
                    }
                });

                for (let index = 0; index < pathsToTest.length; index++) {
                    const testPath = pathsToTest[index];
                    let testImagePath = path.join(rootPath, testPath);
                    if (ImageCache.has(testImagePath) || fs.existsSync(testImagePath)) {
                        absoluteImagePath = testImagePath;
                    } else if (this.additionalSourceFolders.length > 0) {
                        for (let i = 0; i < this.additionalSourceFolders.length; i++) {
                            const additionalSourceFolder = this.additionalSourceFolders[i];
                            let testImagePath;
                            if (path.isAbsolute(additionalSourceFolder)) {
                                testImagePath = path.join(additionalSourceFolder, testPath);
                            } else {
                                testImagePath = path.join(rootPath, additionalSourceFolder, testPath);
                            }
                            if (ImageCache.has(testImagePath) || fs.existsSync(testImagePath)) {
                                absoluteImagePath = testImagePath;
                                break;
                            }
                        }
                    }
                }
            }
        }
        return absoluteImagePath;
    }

    refreshConfig(workspaceFolder: string, sourcefolders: string[], paths: { [alias: string]: string | string[] }) {
        this.workspaceFolder = workspaceFolder;
        this.additionalSourceFolders = sourcefolders;
        this.paths = paths;
        this.aliases = Object.keys(paths);
    }
}
export const relativeToWorkspaceRootFileUrlMapper: AbsoluteUrlMapper = new RelativeToWorkspaceRootFileUrlMapper();
