import * as vscode from 'vscode';
import { Disposable, DocumentSelector, languages, commands } from 'vscode';
import * as tmp from 'tmp';
import * as request from 'request';
import * as path from 'path';
import * as url from 'url';
import * as fs from 'fs';
import * as probe from 'probe-image-size';
var base64Img = require('base64-img');

tmp.setGracefulCleanup();

interface Decoration {
  textEditorDecorationType: vscode.TextEditorDecorationType;
  decorations: vscode.DecorationOptions[];
  originalImagePath: string;
  imagePath: string;
}

export function activate(context: vscode.ExtensionContext) {

  const acceptedExtensions = ['.svg', '.png', '.jpeg', '.jpg', '.bmp', '.gif'];
  const [major, minor, patch] = vscode.version.split('.').map(v => parseInt(v));
  let fallbackImage = undefined;
  let imageCache: Map<String, Thenable<string>> = new Map();

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

  const pythonRecognizer: ImagePathRecognizer = {
    recognize: (editor, line) => {
      let imageUrls: RegExp = /['`"]{1}([^'`"]+\.[\w]{3})['`"]{1}/igm;
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

  const recognizers: ImagePathRecognizer[] = [markdownRecognizer, urlRecognizer, imgSrcRecognizer, pythonRecognizer];
  const absoluteUrlMappers: AbsoluteUrlMapper[] = [dataUrlMapper, simpleUrlMapper, relativeToOpenFileUrlMapper, relativeToWorkspaceRootFileUrlMapper];

  const collectEntries = (editor: vscode.TextEditor, lastScanResult) => {
    var max = editor.document.lineCount;
    const config = vscode.workspace.getConfiguration('gutterpreview');
    const showImagePreviewOnGutter = config.get('showimagepreviewongutter', true);
    for (var lineIndex = 0; lineIndex < max; lineIndex++) {
      var lineObject = editor.document.lineAt(lineIndex);
      var line = lineObject.text;
      absoluteUrlMappers.forEach(absoluteUrlMapper => absoluteUrlMapper.refreshConfig());
      let recognizedImages = recognizers.map(recognizer => recognizer.recognize(editor, line)).filter(item => nonNull(item));
      recognizedImages.forEach((imagePath) => {
        let absoluteUrls = absoluteUrlMappers.map(mapper => mapper.map(editor, imagePath)).filter(item => nonNull(item));
        let absoluteUrlsSet = new Set(absoluteUrls);

        absoluteUrlsSet.forEach((absoluteImagePath) => {
          appendImagePath(showImagePreviewOnGutter, absoluteImagePath, lineIndex, lastScanResult)
        });
      });
    };
  };

  const clearEditor = (editor, lastScanResult: Decoration[]) => {
    lastScanResult.forEach(element => {
      let { textEditorDecorationType, decorations, originalImagePath, imagePath } = element;
      vscode.window.activeTextEditor.setDecorations(textEditorDecorationType, []);
    });
  };

  const appendImagePath = (showImagePreviewOnGutter, absoluteImagePath, lineIndex, lastScanResult: Decoration[]) => {
    if (absoluteImagePath) {
      let isDataUri = absoluteImagePath.indexOf("data:image") == 0;
      let isExtensionSupported: boolean;

      if (!isDataUri) {
        let absolutePath = path.parse(absoluteImagePath);
        isExtensionSupported = acceptedExtensions.some((ext) => absolutePath.ext && absolutePath.ext.toLowerCase().startsWith(ext));
      }

      absoluteImagePath = absoluteImagePath.replace(/\|(width=\d*)?(height=\d*)?/gm, '')
      if (isDataUri || isExtensionSupported) {
        let decorations: vscode.DecorationOptions[] = [];
        decorations.push({
          range: new vscode.Range(lineIndex, 0, lineIndex, 0),
          hoverMessage: ""
        });
        var uri = absoluteImagePath;
        if (major > 1 || (major == 1 && minor > 5)) {
          uri = vscode.Uri.parse(absoluteImagePath);
        }
        const decorate = (uri) => {
          let decorationRenderOptions: vscode.DecorationRenderOptions = {
            gutterIconPath: uri,
            gutterIconSize: 'contain'
          };
          let textEditorDecorationType: vscode.TextEditorDecorationType = vscode.window.createTextEditorDecorationType(<any>decorationRenderOptions);
          lastScanResult.push({ textEditorDecorationType, decorations, originalImagePath: absoluteImagePath, imagePath: uri });
          if (showImagePreviewOnGutter) {
            vscode.window.activeTextEditor.setDecorations(textEditorDecorationType, decorations);
          }
        }
        if (isDataUri) {
          decorate(uri);
        } else {
          if (imageCache.has(absoluteImagePath)) {
            imageCache.get(absoluteImagePath).then((path) => decorate(path));
          } else {
            try {
              const tempFile = tmp.fileSync();
              const path = tempFile.name;
              const promise = new Promise<string>((resolve, reject) => {
                const absoluteImageUrl = url.parse(absoluteImagePath);
                if (absoluteImageUrl.protocol && absoluteImageUrl.protocol.startsWith('http')) {
                  var r = request(absoluteImagePath)
                    .on('response', function (res) {
                      r.pipe(fs.createWriteStream(path)).on('close', () => {
                        resolve(path);
                      });
                    });
                } else {
                  const handle = fs.watch(absoluteImagePath, function fileChangeListener() {
                    handle.close();
                    fs.unlink(path);
                    imageCache.delete(absoluteImagePath);
                    throttledScan(50);
                  });
                  copyFile(absoluteImagePath, path, (err) => {
                    if (!err) {
                      resolve(path)
                    }
                  });
                }
              });
              promise.then(path => decorate(path));
              imageCache.set(absoluteImagePath, promise);
            }
            catch (error) {

            }
          }
        }
      }
    }
  }

  function copyFile(source, target, cb) {
    var cbCalled = false;

    var rd = fs.createReadStream(source);
    rd.on("error", function (err) {
      done(err);
    });
    var wr = fs.createWriteStream(target);
    wr.on("error", function (err) {
      done(err);
    });
    wr.on("close", function (ex) {
      done();
    });
    rd.pipe(wr);

    function done(err?) {
      if (!cbCalled) {
        cb(err);
        cbCalled = true;
      }
    }
  }

  fallbackImage = context.asAbsolutePath("images/logo.png");
  let disposables: Disposable[] = [];
  let lastScanResult: Decoration[] = [];
  let throttleId = undefined;
  let throttledScan = (timeout: number = 500) => {
    if (throttleId)
      clearTimeout(throttleId);
    throttleId = setTimeout(() => scan(), timeout);
  };

  const scan = () => {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      clearEditor(editor, lastScanResult);
      lastScanResult = [];
      collectEntries(editor, lastScanResult);
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

            var fallback = () => {
              let markedString: vscode.MarkedString = "![" + item.originalImagePath + "](" + item.originalImagePath + "|height=100)"
              let resultset: vscode.MarkedString[] = [markedString];
              return new vscode.Hover(resultset, document.getWordRangeAtPosition(position));
            };
            var imageWithSize = (markedString, result) => {
              let resultset: vscode.MarkedString[] = [markedString + `  \r\n${result.width}x${result.height}`];
              return new vscode.Hover(resultset, document.getWordRangeAtPosition(position));
            };
            try {
              let markedString: vscode.MarkedString = "![" + item.originalImagePath + "](" + item.imagePath + "|height=100)";
              result = probe(fs.createReadStream(item.imagePath)).then((result) => imageWithSize(markedString, result), () => fallback());
            } catch (error) {
              result = Promise.resolve(fallback());
            }
          }
        }
      }
      return result;
    }
  };

  disposables.push(vscode.languages.registerHoverProvider(['*'], hoverProvider));
  disposables.push(vscode.Disposable.from({
    dispose: () => cleanupUnusedTempFiles()
  }))

  const cleanupUnusedTempFiles = () => {
    imageCache.forEach(value => {
      value.then(tmpFile => fs.unlink(tmpFile))
    })
    imageCache.clear();
  };

  vscode.workspace.onDidChangeTextDocument(() => throttledScan());
  vscode.window.onDidChangeActiveTextEditor(e => {
    cleanupUnusedTempFiles();
    throttledScan();
  });
  vscode.workspace.onDidOpenTextDocument(() => {
    lastScanResult = [];
    cleanupUnusedTempFiles();
    throttledScan();
  });
  throttledScan();

  context.subscriptions.push(...disposables);
}