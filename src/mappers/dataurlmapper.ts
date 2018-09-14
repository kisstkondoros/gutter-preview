import { AbsoluteUrlMapper } from './mapper';
import { TextDocument } from 'vscode-languageserver';

export const dataUrlMapper: AbsoluteUrlMapper = {
    map(fileName: string, imagePath: string) {
        let absoluteImagePath: string;
        if (imagePath.indexOf('data:image') === 0) {
            absoluteImagePath = imagePath;
        }
        return absoluteImagePath;
    },
    refreshConfig() {}
};
