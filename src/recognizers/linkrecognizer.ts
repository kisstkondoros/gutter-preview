import { ImagePathRecognizer } from './recognizer';
import { TextDocument } from 'vscode-languageserver';

export const linkRecognizer: ImagePathRecognizer = {
    recognize: (document: TextDocument, lineIndex: number, line: string) => {
        let imageUrls: RegExp = /(?:(?:https?|ftp):\/\/|\b(?:[a-z\d]+\.))(?:(?:[^\s()<>]+|\((?:[^\s()<>]+|(?:\([^\s()<>]+\)))?\))+(?:\((?:[^\s()<>]+|(?:\(?:[^\s()<>]+\)))?\)|[^\s`!()\[\]{};:'".,<>?«»“”‘’]))?/gim;
        let match = imageUrls.exec(line);
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
