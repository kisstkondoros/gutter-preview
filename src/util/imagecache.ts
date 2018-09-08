import * as fs from 'fs';

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

    cleanup: () => {
        imageCache.forEach(value => {
            value.then(tmpFile => fs.unlink(tmpFile, () => {}));
        });
        imageCache.clear();
    }
};
