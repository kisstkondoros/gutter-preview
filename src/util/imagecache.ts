import * as tmp from 'tmp';
import * as request from 'request';
import * as path from 'path';
import * as url from 'url';
import * as fs from 'fs';
import { copyFile } from './fileutil';

tmp.setGracefulCleanup();

let imageCache: Map<String, Thenable<string>> = new Map();

export const ImageCache = {
    delete: (key: string) => {
        imageCache.delete(key);
    },
    set: (key: string, value: Thenable<string>) => {
        imageCache.set(key, value);
    },
    get: (key: string) => {
        return imageCache.get(key);
    },
    has: (key: string) => {
        return imageCache.has(key);
    },
    store: (absoluteImagePath: string, onFileChange: () => void): Thenable<string> => {
        if (ImageCache.has(absoluteImagePath)) {
            return ImageCache.get(absoluteImagePath);
        } else {
            try {
                const absoluteImageUrl = url.parse(absoluteImagePath);
                const tempFile = tmp.fileSync({
                    postfix: absoluteImageUrl.pathname ? path.parse(absoluteImageUrl.pathname).ext : 'png'
                });
                const filePath = tempFile.name;
                const promise = new Promise<string>(resolve => {
                    if (absoluteImageUrl.protocol && absoluteImageUrl.protocol.startsWith('http')) {
                        var r = request(absoluteImagePath).on('response', function(res) {
                            r.pipe(fs.createWriteStream(filePath)).on('close', () => {
                                resolve(filePath);
                            });
                        });
                    } else {
                        const handle = fs.watch(absoluteImagePath, function fileChangeListener() {
                            handle.close();
                            fs.unlink(filePath, () => {});
                            ImageCache.delete(absoluteImagePath);
                            onFileChange();
                        });
                        copyFile(absoluteImagePath, filePath, err => {
                            if (!err) {
                                resolve(filePath);
                            }
                        });
                    }
                });
                ImageCache.set(absoluteImagePath, promise);

                return promise;
            } catch (error) {}
        }
    },

    cleanup: () => {
        imageCache.forEach(value => {
            value.then(tmpFile => fs.unlink(tmpFile, () => {}));
        });
        imageCache.clear();
    }
};
