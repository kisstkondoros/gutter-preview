import { ImagePathRecognizer, UrlMatch } from './recognizer';

export const dataUrlRecognizer: ImagePathRecognizer = {
    recognize: (lineIndex: number, line: string): UrlMatch[] => {
        const urlPrefixLength = "url('".length;

        let patternWithSingleQuote: RegExp = /url\(\'(data:image.*)\'\)/gim;
        let patternWithDoubleQuote: RegExp = /url\(\"(data:image.*)\"\)/gim;

        let match: RegExpExecArray;
        const result = [];
        while ((match = patternWithSingleQuote.exec(line))) {
            if (match.length > 1) {
                const imagePath = match[1];
                result.push({
                    url: imagePath,
                    lineIndex,
                    start: match.index + urlPrefixLength,
                    end: match.index + urlPrefixLength + imagePath.length,
                });
            }
        }
        while ((match = patternWithDoubleQuote.exec(line))) {
            if (match.length > 1) {
                const imagePath = match[1];
                result.push({
                    url: imagePath,
                    lineIndex,
                    start: match.index + urlPrefixLength,
                    end: match.index + urlPrefixLength + imagePath.length,
                });
            }
        }
        return result;
    },
};
