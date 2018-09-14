import { TextDocument } from 'vscode-languageserver';

interface AbsoluteUrlMapper {
    map(fileName: string, imagePath: string): string;
    refreshConfig(workspaceFolder: string, sourcefolder: string);
}
