import { ImagePathRecognizer } from './recognizer';
import { TextDocument } from 'vscode-languageserver';

export const imgageSourceRecognizer: ImagePathRecognizer = {
    recognize: (document: TextDocument, line: string) => {
        let imageUrls: RegExp = /src=['"]{1}([^'"]*)['"]{1}/gim;
        let match = imageUrls.exec(line);
        let imagePath: string;

        if (match && match.length > 1) {
            imagePath = match[1];
        }
        return imagePath;
    }
};
