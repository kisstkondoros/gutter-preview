import { ImagePathRecognizer, UrlMatch } from './recognizer';

export const markedLinkRecognizer: ImagePathRecognizer = {
    recognize: (lineIndex: number, line: string): UrlMatch[] => {
        let pattern: RegExp = /(\[.*\])\(([^"]*)(\".*\")?\)/gi;
        let match: RegExpExecArray;
        const result = [];
        while ((match = pattern.exec(line))) {
            if (match.length > 0) {
                const imagePath = match[2].trim();
                const matchIndex = match.index + match[1].length + 1;
                result.push({
                    url: imagePath,
                    lineIndex,
                    start: matchIndex,
                    end: matchIndex + imagePath.length,
                });
            }
        }
        return result;
    },
};
