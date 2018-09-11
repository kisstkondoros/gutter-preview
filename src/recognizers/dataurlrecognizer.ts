import { ImagePathRecognizer, UrlMatch } from './recognizer';

export const dataUrlRecognizer: ImagePathRecognizer = {
    recognize: (lineIndex: number, line: string): UrlMatch[] => {
        let pattern: RegExp = /(data:image(\/[a-z0-9-+.]+(;[a-z0-9-.!#$%*+.{}|~`]+=[a-z0-9-.!#$%*+.{}|~`]+)*)?(;base64)?,([a-z0-9!$&',()*+;=\-._~:@\/?%\s]*))[\"\'\)]+/gim;

        let match: RegExpExecArray;
        const result = [];
        while ((match = pattern.exec(line))) {
            if (match.length > 1) {
                const imagePath = match[1];
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
