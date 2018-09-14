import { ImagePathRecognizer, UrlMatch } from './recognizer';
import { acceptedExtensions } from '../util/acceptedExtensions';

export const siblingRecognizer: ImagePathRecognizer = {
    recognize: (lineIndex: number, line: string): UrlMatch[] => {
        const excludedPathCharactersClause = '[^\\0\\s!$`&*()\\[\\]+\'":;\\\\]';
        let pattern: RegExp = new RegExp(
            `(${excludedPathCharactersClause}+(?:${acceptedExtensions.map(p => `(\\${p})`).join('|')}))`,
            'igm'
        );
        let match: RegExpExecArray;
        const result = [];
        while ((match = pattern.exec(line))) {
            if (match.length > 0) {
                const imagePath = match[0];
                result.push({
                    url: imagePath,
                    lineIndex,
                    start: match.index,
                    end: match.index + imagePath.length
                });
            }
        }
        return result;
    }
};
