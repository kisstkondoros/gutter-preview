import { AbsoluteUrlMapper } from './mapper';

export const dataUrlMapper: AbsoluteUrlMapper = {
    map(imagePath: string) {
        let absoluteImagePath: string;
        if (imagePath.indexOf('data:image') === 0) {
            absoluteImagePath = imagePath;
        }
        return absoluteImagePath;
    },
    refreshConfig() {},
};
