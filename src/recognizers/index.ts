import { ImagePathRecognizer } from './recognizer';
import { linkRecognizer } from './linkrecognizer';
import { localLinkRecognizer } from './locallinkrecognizer';
import { dataUrlRecognizer } from './dataurlrecognizer';
import { siblingRecognizer } from './siblingrecognizer';

export const recognizers: ImagePathRecognizer[] = [
    dataUrlRecognizer,
    linkRecognizer,
    localLinkRecognizer,
    siblingRecognizer
];
