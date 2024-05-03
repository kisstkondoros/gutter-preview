import * as fs from 'fs';
import { filesize } from 'filesize';

export function copyFile(source, target, cb) {
    var cbCalled = false;

    var rd = fs.createReadStream(source);
    rd.on('error', function (err) {
        done(err);
    });
    var wr = fs.createWriteStream(target);
    wr.on('error', function (err) {
        done(err);
    });
    wr.on('close', function (ex) {
        done();
    });
    rd.pipe(wr);

    function done(err?) {
        if (!cbCalled) {
            cb(err);
            cbCalled = true;
        }
    }
}

export function getFilesize(source: string): Promise<string> {
    return new Promise((resolve, reject) => {
        fs.stat(source, async (err, info) => {
            if (err) {
                return reject(err);
            }

            return resolve(filesize(info.size, { standard: 'jedec' }));
        });
    });
}

export function isLocalFile(source: string): boolean {
    return source.indexOf('://') == -1;
}

export function isUrlEncodedFile(path: string): boolean {
    return path.startsWith('data:image');
}
