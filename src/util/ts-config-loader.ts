// modified / simplified version of tsconfig-paths

import * as path from 'path';
import * as fs from 'fs';
import JSON5 from 'json5';
import StripBom from 'strip-bom';

export interface ExplicitParams {
    baseUrl: string;
    paths: { [key: string]: Array<string> };
    mainFields?: (string | string[])[];
    addMatchAll?: boolean;
}

export type TsConfigLoader = (params: TsConfigLoaderParams) => TsConfigLoaderResult;

export interface ConfigLoaderParams {
    cwd: string;
    explicitParams?: ExplicitParams;
    tsConfigLoaderParam?: TsConfigLoader;
}

export interface ConfigLoaderSuccessResult {
    resultType: 'success';
    configFileAbsolutePath: string;
    baseUrl?: string;
    absoluteBaseUrl: string;
    paths: { [key: string]: Array<string> };
    mainFields?: (string | string[])[];
    addMatchAll?: boolean;
}

export interface ConfigLoaderFailResult {
    resultType: 'failed';
    message: string;
}

export type ConfigLoaderResult = ConfigLoaderSuccessResult | ConfigLoaderFailResult;

export function loadConfig(cwd: string): ConfigLoaderResult {
    return configLoader({ cwd });
}

export function configLoader({ cwd }: ConfigLoaderParams): ConfigLoaderResult {
    // Load tsconfig and create path matching function
    const loadResult = tsConfigLoader({
        cwd,
    });

    if (!loadResult.tsConfigPath) {
        return {
            resultType: 'failed',
            message: "Couldn't find tsconfig.json",
        };
    }

    return {
        resultType: 'success',
        configFileAbsolutePath: loadResult.tsConfigPath,
        baseUrl: loadResult.baseUrl,
        absoluteBaseUrl: path.resolve(path.dirname(loadResult.tsConfigPath), loadResult.baseUrl || ''),
        paths: loadResult.paths || {},
        addMatchAll: loadResult.baseUrl !== undefined,
    };
}

/**
 * Typing for the parts of tsconfig that we care about
 */
export interface Tsconfig {
    extends?: string | string[];
    compilerOptions?: {
        baseUrl?: string;
        paths?: { [key: string]: Array<string> };
        strict?: boolean;
    };
}

export interface TsConfigLoaderResult {
    tsConfigPath: string | undefined;
    baseUrl: string | undefined;
    paths: { [key: string]: Array<string> } | undefined;
}

export interface TsConfigLoaderParams {
    cwd: string;
}

export function tsConfigLoader({ cwd }: TsConfigLoaderParams): TsConfigLoaderResult {
    const loadResult = loadSync(cwd);
    return loadResult;
}

function loadSync(cwd: string): TsConfigLoaderResult {
    const configPath = resolveConfigPath(cwd);

    if (!configPath) {
        return {
            tsConfigPath: undefined,
            baseUrl: undefined,
            paths: undefined,
        };
    }
    const config = loadTsconfig(configPath);

    return {
        tsConfigPath: configPath,
        baseUrl: config && config.compilerOptions && config.compilerOptions.baseUrl,
        paths: config && config.compilerOptions && config.compilerOptions.paths,
    };
}

function resolveConfigPath(cwd: string): string | undefined {
    if (fs.statSync(cwd).isFile()) {
        return path.resolve(cwd);
    }

    const configAbsolutePath = walkForTsConfig(cwd);
    return configAbsolutePath ? path.resolve(configAbsolutePath) : undefined;
}
export function walkForTsConfig(
    directory: string,
    readdirSync: (path: string) => string[] = fs.readdirSync,
): string | undefined {
    const files = readdirSync(directory);
    const filesToCheck = ['tsconfig.json', 'jsconfig.json'];
    for (const fileToCheck of filesToCheck) {
        if (files.indexOf(fileToCheck) !== -1) {
            return path.join(directory, fileToCheck);
        }
    }

    const parentDirectory = path.dirname(directory);

    // If we reached the top
    if (directory === parentDirectory) {
        return undefined;
    }

    return walkForTsConfig(parentDirectory, readdirSync);
}

export function loadTsconfig(
    configFilePath: string,
    // eslint-disable-next-line no-shadow
    existsSync: (path: string) => boolean = fs.existsSync,
    readFileSync: (filename: string) => string = (filename: string) => fs.readFileSync(filename, 'utf8'),
): Tsconfig | undefined {
    if (!existsSync(configFilePath)) {
        return undefined;
    }

    const configString = readFileSync(configFilePath);
    const cleanedJson = StripBom(configString);
    let config: Tsconfig;
    try {
        config = JSON5.parse(cleanedJson);
    } catch (e) {
        throw new Error(`${configFilePath} is malformed ${e.message}`);
    }

    let extendedConfig = config.extends;
    if (extendedConfig) {
        let base: Tsconfig;

        if (Array.isArray(extendedConfig)) {
            base = extendedConfig.reduce(
                (currBase, extendedConfigElement) =>
                    mergeTsconfigs(
                        currBase,
                        loadTsconfigFromExtends(configFilePath, extendedConfigElement, existsSync, readFileSync),
                    ),
                {},
            );
        } else {
            base = loadTsconfigFromExtends(configFilePath, extendedConfig, existsSync, readFileSync);
        }

        return mergeTsconfigs(base, config);
    }
    return config;
}

/**
 * Intended to be called only from loadTsconfig.
 * Parameters don't have defaults because they should use the same as loadTsconfig.
 */
function loadTsconfigFromExtends(
    configFilePath: string,
    extendedConfigValue: string,
    // eslint-disable-next-line no-shadow
    existsSync: (path: string) => boolean,
    readFileSync: (filename: string) => string,
): Tsconfig {
    if (typeof extendedConfigValue === 'string' && extendedConfigValue.indexOf('.json') === -1) {
        extendedConfigValue += '.json';
    }
    const currentDir = path.dirname(configFilePath);
    let extendedConfigPath = path.join(currentDir, extendedConfigValue);
    if (
        extendedConfigValue.indexOf('/') !== -1 &&
        extendedConfigValue.indexOf('.') !== -1 &&
        !existsSync(extendedConfigPath)
    ) {
        extendedConfigPath = path.join(currentDir, 'node_modules', extendedConfigValue);
    }

    const config = loadTsconfig(extendedConfigPath, existsSync, readFileSync) || {};

    // baseUrl should be interpreted as relative to extendedConfigPath,
    // but we need to update it so it is relative to the original tsconfig being loaded
    if (config.compilerOptions?.baseUrl) {
        const extendsDir = path.dirname(extendedConfigValue);
        config.compilerOptions.baseUrl = path.join(extendsDir, config.compilerOptions.baseUrl);
    }

    return config;
}

function mergeTsconfigs(base: Tsconfig | undefined, config: Tsconfig | undefined): Tsconfig {
    base = base || {};
    config = config || {};

    return {
        ...base,
        ...config,
        compilerOptions: {
            ...base.compilerOptions,
            ...config.compilerOptions,
        },
    };
}
