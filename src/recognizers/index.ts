import { markdownRecognizer } from './markdownrecognizer';
import { ImagePathRecognizer } from './recognizer';
import { urlRecognizer } from './urlrecognizer';
import { imgageSourceRecognizer } from './imagesourcerecognizer';
import { pythonRecognizer } from './pythonrecognizer';
import { linkRecognizer } from './linkrecognizer';

export const recognizers: ImagePathRecognizer[] = [
    markdownRecognizer,
    urlRecognizer,
    linkRecognizer,
    imgageSourceRecognizer,
    pythonRecognizer
];
