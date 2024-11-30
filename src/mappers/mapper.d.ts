export interface AbsoluteUrlMapper {
    map(fileName: string, imagePath: string, additionalMetadata: { relativeImageDir?: string }): string;
    refreshConfig(workspaceFolder: string, sourcefolder: string, paths: { [alias: string]: string | string[] });
}
