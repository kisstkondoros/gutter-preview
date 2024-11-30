import * as fs from 'fs';
import { promisify } from 'util';

export function replaceCurrentColorInDataURI(uri: string, currentColor: string) {
    if (uri == null || !uri.startsWith('data:image/svg+xml')) {
        return uri;
    }
    const base64SVGPrelude = 'data:image/svg+xml;base64,';
    if (uri.startsWith(base64SVGPrelude)) {
        uri = uri.substring(base64SVGPrelude.length);
        const original = atob(decodeURIComponent(uri));
        uri =
            base64SVGPrelude + encodeURIComponent(btoa(original.replace('<svg', `<svg style="color:${currentColor}"`)));
        return uri;
    }
    const svgPrelude = 'data:image/svg+xml;utf8,';
    if (uri.startsWith(svgPrelude)) {
        uri = uri.substring(svgPrelude.length);
        const original = decodeURIComponent(uri);
        uri = svgPrelude + encodeURIComponent(original.replace('<svg', `<svg style="color:${currentColor}"`));
        return uri;
    }
    return uri;
}

export function replaceCurrentColorInFileContent(path: string, currentColor: string) {
    return new Promise<string>((res, rej) => {
        if (path.endsWith('.svg') && currentColor && currentColor != '') {
            const read = promisify(fs.readFile);
            const write = promisify(fs.writeFile);

            read(path)
                .then((data) => {
                    const original = data.toString('utf-8');
                    return original.replace('<svg', `<svg style="color:${currentColor}"`);
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
}
