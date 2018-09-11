import { TextDocument } from 'vscode-languageserver';

interface AbsoluteUrlMapper {
    map(document: TextDocument, imagePath: string): string;
    refreshConfig(workspaceFolder: string, sourcefolder: string);
}
