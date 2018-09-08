import { TextDocument } from 'vscode';

interface AbsoluteUrlMapper {
    map(document: TextDocument, imagePath: string): string;
    refreshConfig();
}
