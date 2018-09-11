import { TextDocument } from 'vscode-languageserver';

interface ImagePathRecognizer {
    recognize(document: TextDocument, line: string): string;
}
