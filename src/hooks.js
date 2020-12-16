'use strict';

const { mkdirSync, writeFileSync } = require('fs');
const { basename, dirname, join } = require('path');
const { isNil, merge, isRegExp, isString, isArray } = require('lodash');
const https = require('https');
const http = require('http');

const { SyncWaterfallHook } = require('tapable');
const webpack = require('webpack');
// eslint-disable-next-line global-require
const { RawSource } = webpack.sources || require('webpack-sources');

const { standardizeFilePaths, generateManifest, reduceAssets, reduceChunk, validURL } = require('./helpers');

const compilerHookMap = new WeakMap();

const getCompilerHooks = (compiler) => {
    let hooks = compilerHookMap.get(compiler);
    if (typeof hooks === 'undefined') {
        hooks = {
            afterEmit: new SyncWaterfallHook(['manifest']),
            beforeEmit: new SyncWaterfallHook(['manifest'])
        };
        compilerHookMap.set(compiler, hooks);
    }
    return hooks;
};

const beforeRunHook = ({ emitCountMap, importMapFileName }, compiler, callback) => {
    const emitCount = emitCountMap.get(importMapFileName) || 0;
    emitCountMap.set(importMapFileName, emitCount + 1);

    /* istanbul ignore next */
    if (callback) {
        callback();
    }
};

const emitHook = function emit (
    { compiler, emitCountMap, importMapAssetId, importMapFileName, baseImportMapAssetId, moduleAssets, options },
    compilation
) {
    const emitCount = emitCountMap.get(importMapFileName) - 1;
    // Disable everything we don't use, add asset info, show cached assets
    const stats = compilation.getStats().toJson({
    // all: false,
        assets: true,
        cachedAssets: true,
        ids: true,
        publicPath: true
    });

    const publicPath = !isNil(options.publicPath) ? options.publicPath : stats.publicPath;
    const { mapKeys, mapValues, include, exclude } = options;
    emitCountMap.set(importMapFileName, emitCount);

    let files = Array.from(compilation.chunks).reduce(
        (prev, chunk) => reduceChunk(prev, chunk, options),
        []
    );

    // module assets don't show up in assetsByChunkName, we're getting them this way
    files = stats.assets.reduce((prev, asset) => reduceAssets(prev, asset, moduleAssets), files);

    // don't add hot updates and don't add manifests from other instances
    files = files.filter(
        ({ name, path }) =>
            !path.includes('hot-update') &&
            name !== baseImportMapAssetId &&
      typeof emitCountMap.get(join(compiler.options.output.path, name)) === 'undefined'
    );

    const includeExcludeFilter = (val, rule) => {
        if (isRegExp(rule)) {
            return rule.test(val);
        } else if (isString(rule)) {
            return val === rule;
        } else {
            compilation.errors.push(new TypeError('[webpack-import-map-plugin]: Unsupported type provided for include or exclude option.'));
        }
    };

    if (include) {
        files = files.filter((file) => {
            if (isArray(include)) {
                return include.some(innerRule => {
                    return includeExcludeFilter(file.name, innerRule);
                });
            }
            return includeExcludeFilter(file.name, include);
        });
    }

    if (exclude) {
        files = files.filter((file) => {
            if (isArray(exclude)) {
                return !exclude.some(innerRule => {
                    return includeExcludeFilter(file.name, innerRule);
                });
            }
            return !includeExcludeFilter(file.name, exclude);
        });
    }

    files = files.map((file) => {
        if (mapKeys) {
            file.name = mapKeys(file.name);
        }
        if (mapValues) {
            file.path = mapValues(file.path);
        }
        const changes = {
            name: file.name,
            path: publicPath ? publicPath + file.path : file.path
        };

        return Object.assign(file, changes);
    });

    files = files.map(standardizeFilePaths);

    let manifest = generateManifest(files, options);
    const isLastEmit = emitCount === 0;

    manifest = getCompilerHooks(compiler).beforeEmit.call(manifest);

    if (isLastEmit) {
        const baseImportMap = compilation.getAsset ? compilation.getAsset(baseImportMapAssetId) : compilation.assets[baseImportMapAssetId];
        if (baseImportMap) {
            manifest = merge(JSON.parse(baseImportMap.source.source()), manifest);
            compilation.deleteAsset(baseImportMapAssetId);
        }

        const output = options.serialize(manifest);
        compilation.emitAsset(importMapAssetId, new RawSource(output));

        if (options.writeToFileEmit) {
            mkdirSync(dirname(importMapFileName), { recursive: true });
            writeFileSync(importMapFileName, output);
        }
    }

    getCompilerHooks(compiler).afterEmit.call(manifest);
};

const normalModuleLoaderHook = ({ moduleAssets }, loaderContext, module) => {
    const { emitFile } = loaderContext;

    // eslint-disable-next-line no-param-reassign
    loaderContext.emitFile = (file, content, sourceMap) => {
        if (module.userRequest && !moduleAssets[file]) {
            Object.assign(moduleAssets, { [file]: join(dirname(file), basename(module.userRequest)) });
        }

        return emitFile.call(module, file, content, sourceMap);
    };
};

const additionalAssetsHook = ({
    baseImportMap,
    baseImportMapAssetId
}, compilation, callback) => {
    if (!baseImportMap) {
        return callback();
    }
    if (!validURL(baseImportMap)) {
        return callback(new Error('[import-map-plugin] Malformed URL for baseImportMap (URL must include protocol): ' + baseImportMap));
    }
    let protocol = http;
    if (baseImportMap.startsWith('https://')) {
        protocol = https;
    }
    protocol.get(baseImportMap, (res) => {
        const data = [];
        res.on('data', (chunk) => {
            data.push(chunk);
        });
        res.on('end', () => {
            const buffer = Buffer.concat(data);
            compilation.assets[baseImportMapAssetId] = new RawSource(buffer.toString());
            callback();
        });
    }).on('error', (e) => {
        // todo logger
        callback(new Error({
            name: e.name,
            message: '[import-map-plugin] Unable to download the base import-map from ' + baseImportMap + ': ' + e.message,
            stack: e.stack
        }));
    });
};

module.exports = { beforeRunHook, emitHook, getCompilerHooks, normalModuleLoaderHook, additionalAssetsHook };
