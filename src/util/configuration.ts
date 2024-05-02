import * as vscode from 'vscode';

export function getConfiguredProperty<T>(
    documentOrEditor: vscode.TextDocument | vscode.TextEditor,
    property: string,
    fallback: T,
): T {
    const document = isEditor(documentOrEditor) ? documentOrEditor.document : documentOrEditor;
    const config = vscode.workspace.getConfiguration('gutterpreview', document ? document.uri : undefined);
    return config.get(property.toLowerCase(), config.get(property, fallback));
}

function isEditor(documentOrEditor: vscode.TextDocument | vscode.TextEditor): documentOrEditor is vscode.TextEditor {
    return (documentOrEditor as any).document != null;
}
