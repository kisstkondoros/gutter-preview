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

const baseLocalLinkClause = process.platform === 'win32' ? winLocalLinkClause : unixLocalLinkClause;
// Append line and column number regex
const _localLinkPattern = new RegExp(`${baseLocalLinkClause}`);

import { ImagePathRecognizer } from './recognizer';
import { TextDocument } from 'vscode-languageserver';

export const localLinkRecognizer: ImagePathRecognizer = {
    recognize: (document: TextDocument, lineIndex: number, line: string) => {
        let match = _localLinkPattern.exec(line);
        let imagePath: string;

        if (match && match.length > 1) {
            imagePath = match[1];
        }
        return !imagePath
            ? undefined
            : {
                  url: imagePath,
                  lineIndex,
                  start: line.indexOf(imagePath),
                  end: line.indexOf(imagePath) + imagePath.length
              };
    }
};
