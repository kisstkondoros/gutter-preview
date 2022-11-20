import * as fs from 'fs';
import * as path from 'path';
import * as tmp from 'tmp';
import * as url from 'url';

import { URI } from 'vscode-uri';
import { copyFile } from './fileutil';
import fetch from 'node-fetch';
import { promisify } from 'util';

tmp.setGracefulCleanup();

let imageCache: Map<String, Thenable<string>> = new Map();
let currentColor: string;
let storagePath: string;
export const ImageCache = {
    configure: (clientStoragePath) => {
        storagePath = clientStoragePath;
    },
    setCurrentColor: (color: string) => {
        if (currentColor != color) {
            currentColor = color;
            imageCache.clear();
        }
    },
    delete: (key: string) => {
        imageCache.get(key).then((tmpFile) => fs.unlink(tmpFile, () => {}));
        imageCache.delete(key);
    },
    set: (key: string, value: Thenable<string>) => {
        imageCache.delete(key);
        imageCache.set(key, value);
    },
    get: (key: string) => {
        return imageCache.get(key);
    },
    has: (key: string) => {
        return imageCache.has(key);
    },
    store: (absoluteImagePath: string): Thenable<string> => {
        const currentColorForClojure: string = currentColor;
        if (ImageCache.has(absoluteImagePath)) {
            return ImageCache.get(absoluteImagePath);
        } else {
            try {
                const absoluteImageUrl = URI.parse(absoluteImagePath);
                if (!fs.existsSync(storagePath)) {
                    fs.mkdirSync(storagePath);
                }
                const tempFile = tmp.fileSync({
                    tmpdir: storagePath,
                    postfix: absoluteImageUrl.path ? path.parse(absoluteImageUrl.path).ext : 'png',
                });
                const filePath = tempFile.name;
                const promise = new Promise<string>((resolve, reject) => {
                    if (absoluteImageUrl.scheme && absoluteImageUrl.scheme.startsWith('http')) {
                        fetch(new url.URL(absoluteImagePath).toString())
                            .then((resp) => {
                                if (!resp.ok) {
                                    reject(resp.statusText);
                                    return;
                                }
                                const dest = fs.createWriteStream(filePath);
                                resp.body.pipe(dest);
                                resp.body.on('error', (err) => {
                                    reject(err);
                                });
                                dest.on('finish', function () {
                                    resolve(filePath);
                                });
                            })
                            .catch((err) => reject(err));
                    } else {
                        try {
                            const handle = fs.watch(absoluteImagePath, function fileChangeListener() {
                                handle.close();
                                fs.unlink(filePath, () => {});
                                ImageCache.delete(absoluteImagePath);
                            });
                        } catch (e) {}
                        copyFile(absoluteImagePath, filePath, (err) => {
                            if (!err) {
                                resolve(filePath);
                            }
                        });
                    }
                });

                const injectStyles = (path: string) => {
                    return new Promise<string>((res, rej) => {
                        if (path.endsWith('.svg') && currentColorForClojure && currentColorForClojure != '') {
                            const read = promisify(fs.readFile);
                            const write = promisify(fs.writeFile);

                            read(path)
                                .then((data) => {
                                    const original = data.toString('utf-8');
                                    return original.replace('<svg', `<svg style="color:${currentColorForClojure}"`);
                                })
                                .then((data) => {
                                    return write(path, data);
                                })
                                .then(() => res(path))
                                .catch((err) => rej(err));
                        } else {
                            res(path);
                        }
                    });
                };
                const injected = promise.then((p) => injectStyles(p));
                ImageCache.set(absoluteImagePath, injected);
                return injected;
            } catch (error) {}
        }
    },

    cleanup: () => {
        imageCache.forEach((value) => {
            value.then((tmpFile) => fs.unlink(tmpFile, () => {}));
        });
        imageCache.clear();
    },
};
