import { RequestType, Range } from 'vscode-languageserver';

export interface ImageInfo {
    originalImagePath: string;
    imagePath: string;
    range: Range;
}
export interface ImageInfoResponse {
    images: ImageInfo[];
}
export interface ImageInfoRequest {
    uri: string;
    fileName: string;
    visibleLines: number[];
    workspaceFolder: string;
    additionalSourcefolder: string;
    paths: {
        [alias: string]: string | string[];
    };
}

export const GutterPreviewImageRequestType: RequestType<
    ImageInfoRequest,
    ImageInfoResponse,
    any,
    any
> = new RequestType('gutterpreview/gutterpreviewImages');
