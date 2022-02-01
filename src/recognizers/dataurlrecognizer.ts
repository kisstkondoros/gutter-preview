import { ImagePathRecognizer, UrlMatch } from './recognizer';

export const dataUrlRecognizer: ImagePathRecognizer = {
    recognize: (lineIndex: number, line: string): UrlMatch[] => {
        const pattern = /data:[^'")]+/gm;

        let match: RegExpExecArray;
        const result = [];
        while ((match = pattern.exec(line))) {
            if (match) {
                const imagePath = match[0];
                result.push({
                    url: imagePath,
                    lineIndex,
                    start: match.index,
                    end: match.index + imagePath.length,
                });
            }
        }
        return result;
    },
};
