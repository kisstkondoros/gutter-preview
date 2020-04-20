import { ImagePathRecognizer } from './recognizer';
import { linkRecognizer } from './linkrecognizer';
import { localLinkRecognizer } from './locallinkrecognizer';
import { dataUrlRecognizer } from './dataurlrecognizer';
import { siblingRecognizer } from './siblingrecognizer';
import { markedLinkRecognizer } from './markedlinkrecognizer';

export const recognizers: ImagePathRecognizer[] = [
    markedLinkRecognizer,
    dataUrlRecognizer,
    linkRecognizer,
    localLinkRecognizer,
    siblingRecognizer,
];
