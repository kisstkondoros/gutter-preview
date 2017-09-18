import * as vscode from 'vscode';
import { Disposable, DocumentSelector, languages, commands } from 'vscode';
import * as path from 'path';
import * as url from 'url';
import * as fs from 'fs';
import * as probe from 'probe-image-size';
var base64Img = require('base64-img');

interface Decoration {
  textEditorDecorationType: vscode.TextEditorDecorationType;
  decorations: vscode.DecorationOptions[];
  absoluteImagePath: string;
}

const acceptedExtensions = ['.svg', '.png', '.jpeg', '.jpg', '.bmp', '.gif'];
const [major, minor, patch] = vscode.version.split('.').map(v => parseInt(v));
let fallbackImage = undefined;

const appendImagePath = (absoluteImagePath, lineIndex, lastScanResult) => {
  if (absoluteImagePath) {
    let isDataUri = absoluteImagePath.indexOf("data:image") == 0;
    let isExtensionSupported: boolean;

    if (isDataUri) {
      isExtensionSupported = true;
    } else {
      let absolutePath = path.parse(absoluteImagePath);
      isExtensionSupported = acceptedExtensions.some((ext) => absolutePath.ext && absolutePath.ext.toLowerCase().startsWith(ext));
    }
    absoluteImagePath = absoluteImagePath.replace(/\\/gm, '/');
    absoluteImagePath = absoluteImagePath.replace(/\|(width=\d*)?(height=\d*)?/gm, '')
    if (isExtensionSupported) {
      let decorations: vscode.DecorationOptions[] = [];
      decorations.push({
        range: new vscode.Range(lineIndex, 0, lineIndex, 0),
        hoverMessage: ""
      });
      var uri = absoluteImagePath;
      if (major > 1 || (major == 1 && minor > 5)) {
        uri = vscode.Uri.parse(absoluteImagePath);
      }
      if (fallbackImage && absoluteImagePath.startsWith("http:")) {
        uri = fallbackImage.replace(/\\/gm, '/');
      }
      let decorationRenderOptions: vscode.DecorationRenderOptions = {
        gutterIconPath: uri,
        gutterIconSize: 'contain'
      };
      let textEditorDecorationType: vscode.TextEditorDecorationType = vscode.window.createTextEditorDecorationType(<any>decorationRenderOptions);
      lastScanResult.push({ textEditorDecorationType, decorations, absoluteImagePath });
    }
  }
}

const markdownRecognizer: ImagePathRecognizer = {
  recognize: (editor: vscode.TextEditor, line) => {
    let imagePath: string;
    if (editor.document.languageId == "markdown") {
      let imageUrls: RegExp = /\((.*)\)/igm;
      let match = imageUrls.exec(line);
      if (match && match.length > 1) {
        imagePath = match[1];
      }
    }
    return imagePath;
  }
}

const urlRecognizer: ImagePathRecognizer = {
  recognize: (editor, line) => {
    let imageUrls: RegExp = /url\('?"?([^'"]*)'?"?\)/igm;
    let match = imageUrls.exec(line);
    let imagePath: string

    if (match && match.length > 1) {
      imagePath = match[1];
    }
    return imagePath;
  }
}

const imgSrcRecognizer: ImagePathRecognizer = {
  recognize: (editor, line) => {
    let imageUrls: RegExp = /src=['"]{1}([^'"]*)['"]{1}/igm;
    let match = imageUrls.exec(line);
    let imagePath: string

    if (match && match.length > 1) {
      imagePath = match[1];
    }
    return imagePath;
  }
}
interface ImagePathRecognizer {
  recognize(editor: vscode.TextEditor, line);
}
interface AbsoluteUrlMapper {
  map(editor, imagePath);
  refreshConfig();
}

const dataUrlMapper: AbsoluteUrlMapper = {
  map(editor, imagePath) {
    let absoluteImagePath: string;
    if (imagePath.indexOf("data:image") === 0) {
      absoluteImagePath = imagePath;
    }
    return absoluteImagePath;
  },
  refreshConfig() {

  }
}

const simpleUrlMapper: AbsoluteUrlMapper = {
  map(editor, imagePath) {
    let absoluteImagePath: string;
    if (imagePath.indexOf("http") == 0) {
      absoluteImagePath = imagePath;
    } else if (imagePath.indexOf("//") == 0) {
      absoluteImagePath = "http:" + imagePath;
    } else if (path.isAbsolute(imagePath)) {
      if (fs.existsSync(imagePath)) {
        absoluteImagePath = imagePath;
      }
    }
    return absoluteImagePath;
  },
  refreshConfig() {
  }
}

const relativeToOpenFileUrlMapper: AbsoluteUrlMapper = {
  map(editor, imagePath) {
    let absoluteImagePath: string;
    let testImagePath = path.join(editor.document.fileName, '..', imagePath);
    if (fs.existsSync(testImagePath)) {
      absoluteImagePath = testImagePath;
    }
    return absoluteImagePath;
  },
  refreshConfig() {
  }
}
class RelativeToWorkspaceRootFileUrlMapper implements AbsoluteUrlMapper {
  private additionalSourceFolder: string = "";
  map(editor, imagePath) {
    let absoluteImagePath: string;
    if (vscode.workspace && vscode.workspace.rootPath) {
      let testImagePath = path.join(vscode.workspace.rootPath, imagePath);
      if (fs.existsSync(testImagePath)) {
        absoluteImagePath = testImagePath;
      } else {
        let testImagePath = path.join(vscode.workspace.rootPath, this.additionalSourceFolder, imagePath);
        if (fs.existsSync(testImagePath)) {
          absoluteImagePath = testImagePath;
        }
      }
    }
    return absoluteImagePath;
  }
  refreshConfig() {
    const config = vscode.workspace.getConfiguration('gutterpreview');
    this.additionalSourceFolder = config.get('sourcefolder', "");
  }

}
const relativeToWorkspaceRootFileUrlMapper: AbsoluteUrlMapper = new RelativeToWorkspaceRootFileUrlMapper();

const nonNull = (item: string) => {
  return !(item == null || item == undefined || item.length == 0);
}

const recognizers: ImagePathRecognizer[] = [markdownRecognizer, urlRecognizer, imgSrcRecognizer];
const absoluteUrlMappers: AbsoluteUrlMapper[] = [dataUrlMapper, simpleUrlMapper, relativeToOpenFileUrlMapper, relativeToWorkspaceRootFileUrlMapper];

const collectEntries = (editor: vscode.TextEditor, lastScanResult) => {
  var max = editor.document.lineCount;
  for (var lineIndex = 0; lineIndex < max; lineIndex++) {
    var lineObject = editor.document.lineAt(lineIndex);
    var line = lineObject.text;
    absoluteUrlMappers.forEach(absoluteUrlMapper => absoluteUrlMapper.refreshConfig());
    let recognizedImages = recognizers.map(recognizer => recognizer.recognize(editor, line)).filter(item => nonNull(item));
    recognizedImages.forEach((imagePath) => {
      let absoluteUrls = absoluteUrlMappers.map(mapper => mapper.map(editor, imagePath)).filter(item => nonNull(item));
      let absoluteUrlsSet = new Set(absoluteUrls);

      absoluteUrlsSet.forEach((absoluteImagePath) => {
        appendImagePath(absoluteImagePath, lineIndex, lastScanResult)
      });
    });
  };
};

const clearEditor = (editor, lastScanResult) => {
  lastScanResult.forEach(element => {
    let { textEditorDecorationType, decorations, absoluteImagePath } = element;
    vscode.window.activeTextEditor.setDecorations(textEditorDecorationType, []);
  });
};

const updateEditor = (editor, lastScanResult) => {
  const config = vscode.workspace.getConfiguration('gutterpreview');
  const showImagePreviewOnGutter = config.get('showimagepreviewongutter', true);
  if (showImagePreviewOnGutter) {
    lastScanResult.forEach(element => {
      let { textEditorDecorationType, decorations, absoluteImagePath } = element;
      vscode.window.activeTextEditor.setDecorations(textEditorDecorationType, decorations);
    });
  }
};

export function activate(context: vscode.ExtensionContext) {
  fallbackImage = context.asAbsolutePath("images/logo.png");
  let disposables: Disposable[] = [];
  let lastScanResult: Decoration[] = [];
  let throttleId = undefined;
  let throttledScan = () => {
    if (throttleId)
      clearTimeout(throttleId);
    throttleId = setTimeout(() => scan(), 500);
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
  let hoverProvider = {
    provideHover(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Thenable<vscode.Hover> {
      let range = document.getWordRangeAtPosition(position);
      let result: Thenable<vscode.Hover> = undefined;
      if (range) {
        if (major > 1 || (major == 1 && minor > 7)) {
          const matchingDecoratorAndItem = lastScanResult.map(item => {
            return {
              item: item,
              decoration: item.decorations.find(dec => range.start.line == dec.range.start.line)
            }
          }).find(pair => pair.decoration != null);

          if (matchingDecoratorAndItem) {
            const item = matchingDecoratorAndItem.item;
            const dec = matchingDecoratorAndItem.decoration;
            let markedString: vscode.MarkedString = "![" + item.absoluteImagePath + "](" + item.absoluteImagePath + "|height=100)";
            var target = url.parse(item.absoluteImagePath);
            var fallback = (markedString) => {
              let resultset: vscode.MarkedString[] = [markedString];
              return new vscode.Hover(resultset, document.getWordRangeAtPosition(position));
            };
            var imageWithSize = (markedString, result) => {
              let resultset: vscode.MarkedString[] = [markedString + `  \r\n${result.width}x${result.height}`];
              return new vscode.Hover(resultset, document.getWordRangeAtPosition(position));
            };
            if (target.protocol.startsWith("http")) {
              const sizeCheck = probe(target.href);
              if (target.protocol.startsWith("https")) {
                result = sizeCheck.then((result) => imageWithSize(markedString, result), () => fallback(markedString));
              } else {
                result = new Promise((resolve, reject) => {
                  base64Img.requestBase64(target.href, function (err, res, data) {
                    if (err) {
                      resolve(fallback(markedString));
                    } else {
                      markedString = "![" + item.absoluteImagePath + "](" + data + "|height=100)";
                      resolve(sizeCheck.then((result) => imageWithSize(markedString, result), () => fallback(markedString)));
                    }
                  })
                })

              }
            } else {
              result = probe(fs.createReadStream(item.absoluteImagePath)).then((result) => imageWithSize(markedString, result), () => fallback(markedString));
            }
          }
        }
      }
      return result;
    }
  };
  disposables.push(vscode.languages.registerHoverProvider(['*'], hoverProvider));
  vscode.workspace.onDidChangeTextDocument(throttledScan);
  vscode.window.onDidChangeActiveTextEditor(throttledScan);
  vscode.workspace.onDidOpenTextDocument(() => {
    lastScanResult = [];
    throttledScan();
  });
  throttledScan();
  context.subscriptions.push(...disposables);
}