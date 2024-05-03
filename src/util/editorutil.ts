import { TextDocument, window, TextEditorDecorationType, TextEditor } from 'vscode';

export function findEditorsForDocument(document: TextDocument) {
    if (document.uri != null && document.uri.scheme == 'output') {
        return [];
    }
    return window.visibleTextEditors.filter((p) => p.document.uri === document.uri);
}

export const clearEditorDecorations = (document: TextDocument, decorations: TextEditorDecorationType[]) => {
    const editors: TextEditor[] = findEditorsForDocument(document);
    if (editors) {
        decorations.forEach((decoration) => {
            decoration.dispose();
            editors.forEach((editor) => editor.setDecorations(decoration, []));
        });
    }
};
