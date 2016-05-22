import * as vscode from 'vscode';
import {Disposable, DocumentSelector, languages, commands} from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

interface Decoration {
  textEditorDecorationType: vscode.TextEditorDecorationType;
  decorations: vscode.DecorationOptions[];
}

const acceptedExtensions = ['.svg', '.png', '.jpeg', '.jpg', '.bmp'];

const appendImagePath = (absoluteImagePath, lineIndex, lastScanResult) => {
  if (absoluteImagePath) {
    let absolutePath = path.parse(absoluteImagePath);
    let isExtensionSupported = acceptedExtensions.some((ext) => absolutePath.ext && absolutePath.ext.toLowerCase() === ext);
    if (isExtensionSupported) {
      let decorations: vscode.DecorationOptions[] = [];
      decorations.push({
        range: new vscode.Range(lineIndex, 0, lineIndex, 0),
        hoverMessage: ""
      });
      let decorationRenderOptions: vscode.DecorationRenderOptions = {
        gutterIconPath: absoluteImagePath
      };
      let textEditorDecorationType: vscode.TextEditorDecorationType = vscode.window.createTextEditorDecorationType(decorationRenderOptions);
      lastScanResult.push({ textEditorDecorationType, decorations });
    }
  }
}

const urlRecognizer = {
  recognize: (editor, line) => {
    let imageUrls: RegExp = /url\('?"?(.*?)'?"?\)/igm;
    let match = imageUrls.exec(line);
    let imagePath: string

    if (match && match.length > 1) {
      imagePath = match[1];
    }
    return imagePath;
  }
}

const relativeUrlRecognizer = {
  recognize: (editor, line) => {
    let imageUrls: RegExp = /[\w~,;\-\\\/\./?%&+#=]*/igm;
    let match = imageUrls.exec(line);
    let imagePath: string

    if (match && match.length > 0) {
      imagePath = match[0];
    }
    return imagePath;
  }
}

interface ImagePathRecognizer {
  recognize(editor, line);
}
interface AbsoluteUrlMapper {
  map(editor, imagePath);
}
const simpleUrlMapper: AbsoluteUrlMapper = {
  map(editor, imagePath) {
    let absoluteImagePath: string;
    if (path.isAbsolute(imagePath)) {
      if (fs.existsSync(imagePath)) {
        absoluteImagePath = imagePath;
      }
    }
    return absoluteImagePath;
  }
}

const relativeToOpenFileUrlMapper: AbsoluteUrlMapper = {
  map(editor, imagePath) {
    let absoluteImagePath: string;
    let testImagePath = path.join(editor.document.fileName, imagePath);
    if (fs.existsSync(testImagePath)) {
      absoluteImagePath = testImagePath;
    }
    return absoluteImagePath;
  }
}

const relativeToWorkspaceRootFileUrlMapper: AbsoluteUrlMapper = {
  map(editor, imagePath) {
    let absoluteImagePath: string;
    let testImagePath = path.join(vscode.workspace.rootPath, imagePath);
    if (fs.existsSync(testImagePath)) {
      absoluteImagePath = testImagePath;
    }
    return absoluteImagePath;
  }
}

const nonNull = (item: string) => {
  return !(item == null || item == undefined || item.length == 0);
}

const recognizers: ImagePathRecognizer[] = [urlRecognizer, relativeUrlRecognizer];
const absoluteUrlMappers: AbsoluteUrlMapper[] = [simpleUrlMapper, relativeToOpenFileUrlMapper, relativeToWorkspaceRootFileUrlMapper];

const collectEntries = (editor, lastScanResult) => {
  const content: string = editor.document.getText();
  let lines = content.split(/\r?\n/g);
  lines.forEach((line, lineIndex) => {
    let recognizedImages = recognizers.map(recognizer => recognizer.recognize(editor, line)).filter(item => nonNull(item));
    recognizedImages.forEach((imagePath) => {
      let absoluteUrls = absoluteUrlMappers.map(mapper => mapper.map(editor, imagePath)).filter(item => nonNull(item));
      absoluteUrls.forEach((absoluteImagePath) => {
        appendImagePath(absoluteImagePath, lineIndex, lastScanResult)
      })

    });
  });
};

const clearEditor = (editor, lastScanResult) => {
  lastScanResult.forEach(element => {
    let {textEditorDecorationType, decorations} = element;
    vscode.window.activeTextEditor.setDecorations(textEditorDecorationType, []);
  });
};

const updateEditor = (editor, lastScanResult) => {
  lastScanResult.forEach(element => {
    let {textEditorDecorationType, decorations} = element;
    vscode.window.activeTextEditor.setDecorations(textEditorDecorationType, decorations);
  });
};

export function activate(context) {
  let lastScanResult: Decoration[] = [];
  let throttleId = undefined;
  let throttledScan = () =>{
    if (throttleId)
      clearTimeout(throttleId);
    throttleId = setTimeout(()=>scan(), 500);
  };
  
  const scan = () => {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      clearEditor(editor, lastScanResult);
      lastScanResult = [];
      collectEntries(editor, lastScanResult);
      updateEditor(editor, lastScanResult);
    }
  };

  vscode.workspace.onDidChangeTextDocument(throttledScan)
  vscode.workspace.onDidOpenTextDocument(() => {
    lastScanResult = [];
    throttledScan();
  });
  throttledScan();
}