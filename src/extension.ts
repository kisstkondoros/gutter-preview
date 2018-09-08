import * as vscode from "vscode";
import { Disposable } from "vscode";
import * as tmp from "tmp";
import * as request from "request";
import * as path from "path";
import * as url from "url";
import * as fs from "fs";
import * as probe from "probe-image-size";
var base64Img = require("base64-img");

tmp.setGracefulCleanup();

interface Decoration {
	textEditorDecorationType: vscode.TextEditorDecorationType;
	decorations: vscode.DecorationOptions[];
	originalImagePath: string;
	imagePath: string;
}

export function activate(context: vscode.ExtensionContext) {
	const acceptedExtensions = [".svg", ".png", ".jpeg", ".jpg", ".bmp", ".gif"];
	const [major, minor, patch] = vscode.version.split(".").map(v => parseInt(v));
	let fallbackImage = undefined;
	let imageCache: Map<String, Thenable<string>> = new Map();

	const markdownRecognizer: ImagePathRecognizer = {
		recognize: (document: vscode.TextDocument, line: string) => {
			let imagePath: string;
			if (document.languageId == "markdown") {
				let imageUrls: RegExp = /\((.*)\)/gim;
				let match = imageUrls.exec(line);
				if (match && match.length > 1) {
					imagePath = match[1];
				}
			}
			return imagePath;
		}
	};

	const urlRecognizer: ImagePathRecognizer = {
		recognize: (document: vscode.TextDocument, line: string) => {
			let imageUrls: RegExp = /url\('?"?([^'"]*)'?"?\)/gim;
			let match = imageUrls.exec(line);
			let imagePath: string;

			if (match && match.length > 1) {
				imagePath = match[1];
			}
			return imagePath;
		}
	};

	const linkRecognizer: ImagePathRecognizer = {
		recognize: (document: vscode.TextDocument, line: string) => {
			let imageUrls: RegExp = /(?:(?:https?|ftp):\/\/|\b(?:[a-z\d]+\.))(?:(?:[^\s()<>]+|\((?:[^\s()<>]+|(?:\([^\s()<>]+\)))?\))+(?:\((?:[^\s()<>]+|(?:\(?:[^\s()<>]+\)))?\)|[^\s`!()\[\]{};:'".,<>?«»“”‘’]))?/gim;
			let match = imageUrls.exec(line);
			let imagePath: string;

			if (match && match.length > 1) {
				imagePath = match[1];
			}
			return imagePath;
		}
	};

	const imgSrcRecognizer: ImagePathRecognizer = {
		recognize: (document: vscode.TextDocument, line: string) => {
			let imageUrls: RegExp = /src=['"]{1}([^'"]*)['"]{1}/gim;
			let match = imageUrls.exec(line);
			let imagePath: string;

			if (match && match.length > 1) {
				imagePath = match[1];
			}
			return imagePath;
		}
	};

	const pythonRecognizer: ImagePathRecognizer = {
		recognize: (document: vscode.TextDocument, line: string) => {
			let imageUrls: RegExp = /['`"]{1}([^'`"]+\.[\w]{3})['`"]{1}/gim;
			let match = imageUrls.exec(line);
			let imagePath: string;

			if (match && match.length > 1) {
				imagePath = match[1];
			}
			return imagePath;
		}
	};

	interface ImagePathRecognizer {
		recognize(document: vscode.TextDocument, line: string): string;
	}
	interface AbsoluteUrlMapper {
		map(document: vscode.TextDocument, imagePath: string): string;
		refreshConfig();
	}

	const dataUrlMapper: AbsoluteUrlMapper = {
		map(document: vscode.TextDocument, imagePath: string) {
			let absoluteImagePath: string;
			if (imagePath.indexOf("data:image") === 0) {
				absoluteImagePath = imagePath;
			}
			return absoluteImagePath;
		},
		refreshConfig() {}
	};

	const simpleUrlMapper: AbsoluteUrlMapper = {
		map(document: vscode.TextDocument, imagePath: string) {
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
		refreshConfig() {}
	};

	const relativeToOpenFileUrlMapper: AbsoluteUrlMapper = {
		map(document: vscode.TextDocument, imagePath: string) {
			let absoluteImagePath: string;
			const pathName = url.parse(imagePath).pathname;
			if (pathName) {
				let testImagePath = path.join(document.fileName, "..", pathName);
				if (fs.existsSync(testImagePath)) {
					absoluteImagePath = testImagePath;
				}
			}
			return absoluteImagePath;
		},
		refreshConfig() {}
	};
	class RelativeToWorkspaceRootFileUrlMapper implements AbsoluteUrlMapper {
		private additionalSourceFolder: string = "";
		map(document: vscode.TextDocument, imagePath: string) {
			let absoluteImagePath: string;
			let root = vscode.workspace.getWorkspaceFolder(document.uri);
			if (root && root.uri && root.uri.fsPath) {
				const rootPath = root.uri.fsPath;
				const pathName = url.parse(imagePath).pathname;
				if (pathName) {
					let testImagePath = path.join(rootPath, pathName);
					if (fs.existsSync(testImagePath)) {
						absoluteImagePath = testImagePath;
					} else {
						let testImagePath = path.join(rootPath, this.additionalSourceFolder, pathName);
						if (fs.existsSync(testImagePath)) {
							absoluteImagePath = testImagePath;
						}
					}
				}
			}
			return absoluteImagePath;
		}
		refreshConfig() {
			const config = vscode.workspace.getConfiguration("gutterpreview");
			this.additionalSourceFolder = config.get("sourcefolder", "");
		}
	}
	const relativeToWorkspaceRootFileUrlMapper: AbsoluteUrlMapper = new RelativeToWorkspaceRootFileUrlMapper();

	const nonNull = (item: string) => {
		return !(item == null || item == undefined || item.trim().length == 0);
	};

	const recognizers: ImagePathRecognizer[] = [
		markdownRecognizer,
		urlRecognizer,
		linkRecognizer,
		imgSrcRecognizer,
		pythonRecognizer
	];
	const absoluteUrlMappers: AbsoluteUrlMapper[] = [
		dataUrlMapper,
		simpleUrlMapper,
		relativeToOpenFileUrlMapper,
		relativeToWorkspaceRootFileUrlMapper
	];

	const collectEntries = (document: vscode.TextDocument, lastScanResult) => {
		var max = document.lineCount;
		const editor = findEditorForDocument(document);
		const config = vscode.workspace.getConfiguration("gutterpreview");
		const showImagePreviewOnGutter = config.get("showimagepreviewongutter", true);
		for (var lineIndex = 0; lineIndex < max; lineIndex++) {
			var lineObject = document.lineAt(lineIndex);
			var line = lineObject.text;
			absoluteUrlMappers.forEach(absoluteUrlMapper => absoluteUrlMapper.refreshConfig());
			let recognizedImages = recognizers
				.map(recognizer => recognizer.recognize(document, line))
				.filter(item => nonNull(item));
			recognizedImages.forEach(imagePath => {
				let absoluteUrls = absoluteUrlMappers
					.map(mapper => {
						try {
							return mapper.map(document, imagePath);
						} catch (e) {}
					})
					.filter(item => nonNull(item));
				let absoluteUrlsSet = new Set(absoluteUrls);

				absoluteUrlsSet.forEach(absoluteImagePath => {
					appendImagePath(editor, showImagePreviewOnGutter, absoluteImagePath, lineIndex, lastScanResult);
				});
			});
		}
	};

	const findEditorForDocument = (document: vscode.TextDocument) => {
		const editor = vscode.window.visibleTextEditors.find(p => p.document.uri === document.uri);
		return editor;
	};

	const clearEditor = (document: vscode.TextDocument, scanResult: Decoration[]) => {
		const editor = findEditorForDocument(document);
		if (editor) {
			scanResult.forEach(element => {
				let { textEditorDecorationType } = element;
				editor.setDecorations(textEditorDecorationType, []);
			});
		}
		scanResult.length = 0;
	};

	const appendImagePath = (
		editor: vscode.TextEditor,
		showImagePreviewOnGutter: boolean,
		absoluteImagePath: string,
		lineIndex: number,
		lastScanResult: Decoration[]
	) => {
		if (absoluteImagePath) {
			let isDataUri = absoluteImagePath.indexOf("data:image") == 0;
			let isExtensionSupported: boolean;

			if (!isDataUri) {
				const absoluteImageUrl = url.parse(absoluteImagePath);
				if (absoluteImageUrl.pathname) {
					let absolutePath = path.parse(absoluteImageUrl.pathname);
					isExtensionSupported = acceptedExtensions.some(
						ext => absolutePath.ext && absolutePath.ext.toLowerCase().startsWith(ext)
					);
				}
			}

			absoluteImagePath = absoluteImagePath.replace(/\|(width=\d*)?(height=\d*)?/gm, "");
			if (isDataUri || isExtensionSupported) {
				let decorations: vscode.DecorationOptions[] = [];
				decorations.push({
					range: new vscode.Range(lineIndex, 0, lineIndex, 0),
					hoverMessage: ""
				});
				var uri: vscode.Uri | string = absoluteImagePath;
				if (major > 1 || (major == 1 && minor > 5)) {
					uri = vscode.Uri.parse(absoluteImagePath);
				}
				const decorate = uri => {
					let decorationRenderOptions: vscode.DecorationRenderOptions = {
						gutterIconPath: uri,
						gutterIconSize: "contain"
					};
					let textEditorDecorationType: vscode.TextEditorDecorationType = vscode.window.createTextEditorDecorationType(<any>(
						decorationRenderOptions
					));
					lastScanResult.push({
						textEditorDecorationType,
						decorations,
						originalImagePath: absoluteImagePath,
						imagePath: uri
					});
					if (showImagePreviewOnGutter && editor) {
						editor.setDecorations(textEditorDecorationType, decorations);
					}
				};
				if (isDataUri) {
					decorate(uri);
				} else {
					if (imageCache.has(absoluteImagePath)) {
						imageCache.get(absoluteImagePath).then(path => decorate(path));
					} else {
						try {
							const absoluteImageUrl = url.parse(absoluteImagePath);
							const tempFile = tmp.fileSync({
								postfix: absoluteImageUrl.pathname ? path.parse(absoluteImageUrl.pathname).ext : "png"
							});
							const filePath = tempFile.name;
							const promise = new Promise<string>((resolve, reject) => {
								if (absoluteImageUrl.protocol && absoluteImageUrl.protocol.startsWith("http")) {
									var r = request(absoluteImagePath).on("response", function(res) {
										r.pipe(fs.createWriteStream(filePath)).on("close", () => {
											resolve(filePath);
										});
									});
								} else {
									const handle = fs.watch(absoluteImagePath, function fileChangeListener() {
										handle.close();
										fs.unlink(filePath, () => {});
										imageCache.delete(absoluteImagePath);
										throttledScan(editor.document, 50);
									});
									copyFile(absoluteImagePath, filePath, err => {
										if (!err) {
											resolve(filePath);
										}
									});
								}
							});
							promise.then(path => decorate(path));
							imageCache.set(absoluteImagePath, promise);
						} catch (error) {}
					}
				}
			}
		}
	};

	function copyFile(source, target, cb) {
		var cbCalled = false;

		var rd = fs.createReadStream(source);
		rd.on("error", function(err) {
			done(err);
		});
		var wr = fs.createWriteStream(target);
		wr.on("error", function(err) {
			done(err);
		});
		wr.on("close", function(ex) {
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
	let scanResults: { [uri: string]: Decoration[] } = {};
	let throttleId = undefined;
	let throttledScan = (document: vscode.TextDocument, timeout: number = 500) => {
		if (throttleId) clearTimeout(throttleId);
		throttleId = setTimeout(() => scan(document), timeout);
	};

	const refreshAllVisibleEditors = () => {
		vscode.window.visibleTextEditors
			.map(p => p.document)
			.filter(p => p != null)
			.forEach(doc => throttledScan(doc));
	};

	const getDocumentDecorators = (document: vscode.TextDocument) => {
		const scanResult = scanResults[document.uri.toString()] || [];
		scanResults[document.uri.toString()] = scanResult;
		return scanResult;
	};
	const scan = (document: vscode.TextDocument) => {
		const scanResult = getDocumentDecorators(document);

		clearEditor(document, scanResult);
		collectEntries(document, scanResult);
	};
	let hoverProvider = {
		provideHover(
			document: vscode.TextDocument,
			position: vscode.Position,
			token: vscode.CancellationToken
		): Thenable<vscode.Hover> {
			let range = document.getWordRangeAtPosition(position);
			let maxHeight = vscode.workspace.getConfiguration("gutterpreview").get("imagepreviewmaxheight", 100);
			if (maxHeight < 0) {
				maxHeight = 100;
			}
			let result: Thenable<vscode.Hover> = undefined;
			if (range) {
				if (major > 1 || (major == 1 && minor > 7)) {
					const documentDecorators = getDocumentDecorators(document);
					const matchingDecoratorAndItem = documentDecorators
						.map(item => {
							return {
								item: item,
								decoration: item.decorations.find(dec => range.start.line == dec.range.start.line)
							};
						})
						.find(pair => pair.decoration != null);

					if (matchingDecoratorAndItem) {
						const item = matchingDecoratorAndItem.item;
						const dec = matchingDecoratorAndItem.decoration;

						var fallback = (markedString: vscode.MarkedString) => {
							let resultset: vscode.MarkedString[] = [markedString];
							return new vscode.Hover(resultset, document.getWordRangeAtPosition(position));
						};
						var imageWithSize = (markedString, result) => {
							let resultset: vscode.MarkedString[] = [markedString + `  \r\n${result.width}x${result.height}`];
							return new vscode.Hover(resultset, document.getWordRangeAtPosition(position));
						};
						let markedString: vscode.MarkedString = `![${item.originalImagePath}](${item.imagePath}|height=${maxHeight})`;
						try {
							result = probe(fs.createReadStream(item.imagePath)).then(
								result => imageWithSize(markedString, result),
								() => fallback(markedString)
							);
						} catch (error) {
							result = Promise.resolve(fallback(markedString));
						}
					}
				}
			}
			return result;
		}
	};

	disposables.push(vscode.languages.registerHoverProvider(["*"], hoverProvider));
	disposables.push(
		vscode.Disposable.from({
			dispose: () => cleanupUnusedTempFiles()
		})
	);

	const cleanupUnusedTempFiles = () => {
		imageCache.forEach(value => {
			value.then(tmpFile => fs.unlink(tmpFile, () => {}));
		});
		imageCache.clear();
	};

	vscode.workspace.onDidChangeTextDocument(e => throttledScan(e.document));
	vscode.window.onDidChangeActiveTextEditor(e => {
		cleanupUnusedTempFiles();
		throttledScan(e.document);
	});
	vscode.workspace.onDidChangeWorkspaceFolders(() => {
		cleanupUnusedTempFiles();
		refreshAllVisibleEditors();
	});
	vscode.workspace.onDidOpenTextDocument(e => {
		const scanResult = (scanResults[e.uri.toString()] = scanResults[e.uri.toString()] || []);
		clearEditor(e, scanResult);

		cleanupUnusedTempFiles();
		throttledScan(e);
	});

	refreshAllVisibleEditors();

	context.subscriptions.push(...disposables);
}
