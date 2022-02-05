import { ImagePathRecognizer, UrlMatch } from './recognizer';

const collectMatchesForPattern = (pattern: RegExp, lineIndex: number, line: string): UrlMatch[] => {
    let match: RegExpExecArray;

    let escapeURIContent = (content: string) => {
        if (content.indexOf(' ') > 0 || content.indexOf('"') || content.indexOf("'") > 0) {
            return (
                content.substring(0, content.indexOf(',') + 1) +
                encodeURIComponent(content.substring(content.indexOf(',') + 1))
            );
        } else {
            return content;
        }
    };

    const result = [];
    while ((match = pattern.exec(line))) {
        if (match.length > 1) {
            const imagePath = match[1];
            result.push({
                url: escapeURIContent(imagePath),
                lineIndex,
                start: match.index,
                end: match.index + imagePath.length,
            });
        }
    }
    return result;
};

export const dataUrlRecognizer: ImagePathRecognizer = {
    recognize: (lineIndex: number, line: string): UrlMatch[] => {
        const urlPrefixLength = "url('".length;
        let results: UrlMatch[] = [];

        results.push(...collectMatchesForPattern(/url\(\'(data:image.*)\'\)/gim, lineIndex, line));
        results.push(...collectMatchesForPattern(/url\(\"(data:image.*)\"\)/gim, lineIndex, line));

        results = results.map((p) => ({ ...p, start: p.start + urlPrefixLength, end: p.end + urlPrefixLength }));

        if (results.length == 0) {
            results.push(...collectMatchesForPattern(/\'(data:image[^']*)\'/gim, lineIndex, line));
            results.push(...collectMatchesForPattern(/\"(data:image[^"]*)\"/gim, lineIndex, line));
            results.push(...collectMatchesForPattern(/\`(data:image[^`]*)\`/gim, lineIndex, line));
        }

        return results;
    },
};
