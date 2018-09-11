import { ImagePathRecognizer } from './recognizer';
import { TextDocument } from 'vscode-languageserver';

export const markdownRecognizer: ImagePathRecognizer = {
    recognize: (document: TextDocument, line: string) => {
        let imagePath: string;
        if (document.languageId == 'markdown') {
            let imageUrls: RegExp = /\((.*)\)/gim;
            let match = imageUrls.exec(line);
            if (match && match.length > 1) {
                imagePath = match[1];
            }
        }
        return imagePath;
    }
};
