import { ImagePathRecognizer } from './recognizer';
import { TextDocument } from 'vscode';

export const linkRecognizer: ImagePathRecognizer = {
    recognize: (document: TextDocument, line: string) => {
        let imageUrls: RegExp = /(?:(?:https?|ftp):\/\/|\b(?:[a-z\d]+\.))(?:(?:[^\s()<>]+|\((?:[^\s()<>]+|(?:\([^\s()<>]+\)))?\))+(?:\((?:[^\s()<>]+|(?:\(?:[^\s()<>]+\)))?\)|[^\s`!()\[\]{};:'".,<>?«»“”‘’]))?/gim;
        let match = imageUrls.exec(line);
        let imagePath: string;

        if (match && match.length > 1) {
            imagePath = match[1];
        }
        return imagePath;
    }
};
