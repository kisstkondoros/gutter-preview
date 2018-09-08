import { TextDocument, window, TextEditorDecorationType } from 'vscode';

export function findEditorForDocument(document: TextDocument) {
    return window.visibleTextEditors.find(p => p.document.uri === document.uri);
}

export const clearEditorDecorations = (document: TextDocument, decorations: TextEditorDecorationType[]) => {
    const editor = findEditorForDocument(document);
    if (editor) {
        decorations.forEach(decoration => {
            editor.setDecorations(decoration, []);
        });
    }
};
