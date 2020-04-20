import { ImagePathRecognizer, UrlMatch } from './recognizer';

export const markedLinkRecognizer: ImagePathRecognizer = {
    recognize: (lineIndex: number, line: string): UrlMatch[] => {
        let pattern: RegExp = /(\[.*?\])\((.*?)\)/gi;
        let match: RegExpExecArray;
        const result = [];
        while ((match = pattern.exec(line))) {
            if (match.length > 0) {
                const imagePath = match[1];
                const matchIndex = match.index + match[0].length + 1;
                result.push({
                    url: imagePath,
                    lineIndex,
                    start: matchIndex,
                    end: matchIndex + imagePath.length
                });
            }
        }
        return result;
    }
};
