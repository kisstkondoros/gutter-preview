const pathPrefix = '(\\.\\.?|\\~)';
const pathSeparatorClause = '\\/';
// '":; are allowed in paths but they are often separators so ignore them
// Also disallow \\ to prevent a catastropic backtracking case #24798
const excludedPathCharactersClause = '[^\\0\\s!$`&*()\\[\\]+\'":;\\\\]';
/** A regex that matches paths in the form /foo, ~/foo, ./foo, ../foo, foo/bar */
const unixLocalLinkClause =
    '((' +
    pathPrefix +
    '|(' +
    excludedPathCharactersClause +
    ')+)?(' +
    pathSeparatorClause +
    '(' +
    excludedPathCharactersClause +
    ')+)+)';

const winDrivePrefix = '[a-zA-Z]:';
const winPathPrefix = '(' + winDrivePrefix + '|\\.\\.?|\\~)';
const winPathSeparatorClause = '(\\\\|\\/)';
const winExcludedPathCharactersClause = '[^\\0<>\\?\\|\\/\\s!$`&*()\\[\\]+\'":;]';
/** A regex that matches paths in the form c:\foo, ~\foo, .\foo, ..\foo, foo\bar */
const winLocalLinkClause =
    '((' +
    winPathPrefix +
    '|(' +
    winExcludedPathCharactersClause +
    ')+)?(' +
    winPathSeparatorClause +
    '(' +
    winExcludedPathCharactersClause +
    ')+)+)';

// Append line and column number regex
const _winLocalLinkPattern = new RegExp(`${winLocalLinkClause}`, 'g');
const _unixLinkPattern = new RegExp(`${unixLocalLinkClause}`, 'g');

import { ImagePathRecognizer } from './recognizer';

export const localLinkRecognizer: ImagePathRecognizer = {
    recognize: (lineIndex: number, line: string) => {
        let match: RegExpExecArray;
        const result = [];
        while ((match = _unixLinkPattern.exec(line))) {
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
        while ((match = _winLocalLinkPattern.exec(line))) {
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
