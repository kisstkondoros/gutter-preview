import { ImagePathRecognizer } from './recognizer';
import { linkRecognizer } from './linkrecognizer';
import { localLinkRecognizer } from './locallinkrecognizer';

export const recognizers: ImagePathRecognizer[] = [linkRecognizer, localLinkRecognizer];
