import { markdownRecognizer } from './markdownrecognizer';
import { ImagePathRecognizer } from './recognizer';
import { urlRecognizer } from './urlrecognizer';
import { imgageSourceRecognizer } from './imagesourcerecognizer';
import { pythonRecognizer } from './pythonrecognizer';
import { linkRecognizer } from './linkrecognizer';
import { localLinkRecognizer } from './locallinkrecognizer';

export const recognizers: ImagePathRecognizer[] = [
    markdownRecognizer,
    urlRecognizer,
    linkRecognizer,
    localLinkRecognizer,
    imgageSourceRecognizer,
    pythonRecognizer
];
