import { ImagePathRecognizer } from './recognizer';
import { dataUrlRecognizer } from './dataurlrecognizer';
import { linkRecognizer } from './linkrecognizer';
import { localLinkRecognizer } from './locallinkrecognizer';
import { markedLinkRecognizer } from './markedlinkrecognizer';
import { siblingRecognizer } from './siblingrecognizer';

export const recognizers: ImagePathRecognizer[] = [
    markedLinkRecognizer,
    dataUrlRecognizer,
    linkRecognizer,
    localLinkRecognizer,
    siblingRecognizer,
];
