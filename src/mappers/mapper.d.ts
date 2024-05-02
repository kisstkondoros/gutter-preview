export interface AbsoluteUrlMapper {
    map(fileName: string, imagePath: string): string;
    refreshConfig(workspaceFolder: string, sourcefolder: string, paths: { [alias: string]: string | string[] });
}
