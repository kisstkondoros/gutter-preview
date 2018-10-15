import { ImagePathRecognizer, UrlMatch } from './recognizer';

export const linkRecognizer: ImagePathRecognizer = {
    recognize: (lineIndex: number, line: string): UrlMatch[] => {
        let pattern: RegExp = /(?:(?:https?|ftp):\/\/|\b(?:[a-z\d]+\.))(?:(?:[^\s()<>]+|\((?:[^\s()<>]+|(?:\([^\s()<>]+\)))?\))+(?:\((?:[^\s()<>]+|(?:\(?:[^\s()<>]+\)))?\)|[^\s`!()\[\]{};:'".,<>?«»“”‘’]))?/gi;
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
