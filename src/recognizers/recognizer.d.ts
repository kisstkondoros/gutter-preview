import { TextDocument } from 'vscode';

interface ImagePathRecognizer {
    recognize(document: TextDocument, line: string): string;
}
