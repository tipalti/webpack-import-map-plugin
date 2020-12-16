'use strict';

const { validate } = require('schema-utils');
const { merge, defaults } = require('lodash');
const { resolve, relative } = require('path');
const webpack = require('webpack');
const NormalModule = require('webpack/lib/NormalModule');
const { RawSource } = webpack.sources || require('webpack-sources');
const { beforeRunHook, emitHook, getCompilerHooks, normalModuleLoaderHook } = require('./hooks');

// schema for options object
const schema = require('./schema.json');

const optionsDefaults = {
    include: '',
    exclude: '',
    // transformKeys: undefined,
    // transformValues: undefined,
    // baseUrl: undefined,
    fileName: 'import-map.json',
    transformExtensions: /^(gz|map)$/i,
    // writeToFileEmit: false,
    // filter: undefined,
    // generate: undefined,
    // seed: undefined,
    // map: undefined,
    // sort: undefined,
    serialize: (manifest) => {
        return JSON.stringify(manifest, null, 2);
    }
    // baseImportMap: undefined
};

const emitCountMap = new Map();

class ImportMapPlugin {
    constructor (options) {
        options = options || {};
        options = defaults(options, optionsDefaults);
        validate(schema, options,
            {
                name: 'ImportMapPlugin',
                baseDataPath: 'options'
            });

        this.options = options;
    }

    apply (compiler) {
        const pluginName = this.constructor.name;
        const processAssets = this.processAssets.bind(this);

        const moduleAssets = {};
        const manifestFileName = resolve(compiler.options.output.path, this.options.fileName);
        const manifestAssetId = relative(compiler.options.output.path, manifestFileName);
        const beforeRun = beforeRunHook.bind(this, { emitCountMap, manifestFileName });
        const emit = emitHook.bind(this, {
            compiler,
            emitCountMap,
            manifestAssetId,
            manifestFileName,
            moduleAssets,
            options: this.options
        });
        const normalModuleLoader = normalModuleLoaderHook.bind(this, { moduleAssets });
        const hookOptions = {
            name: 'WebpackManifestPlugin',
            stage: Infinity
        };

        compiler.hooks.compilation.tap(hookOptions, (compilation) => {
            const hook = !NormalModule.getCompilationHooks
                ? compilation.hooks.normalModuleLoader
                : NormalModule.getCompilationHooks(compilation).loader;
            hook.tap(hookOptions, normalModuleLoader);
        });

        if (webpack.version.startsWith('4')) {
            compiler.hooks.emit.tap(hookOptions, emit);
        } else {
            compiler.hooks.thisCompilation.tap(hookOptions, (compilation) => {
                compilation.hooks.processAssets.tap(hookOptions, () => emit(compilation));
            });
        }

        compiler.hooks.run.tap(hookOptions, beforeRun);
        compiler.hooks.watchRun.tap(hookOptions, beforeRun);

        // compiler.hooks.entryOption.tap(pluginName, (context, entry) => {
        //     // console.log(context);
        //     // console.log(entry);
        // });
        // compiler.hooks.thisCompilation.tap(pluginName, (compilation) => {
        //     const logger = compilation.getLogger(pluginName);
        //     const cache = compilation.getCache(pluginName);
        //     // compilation.hooks.additionalAssets.tapAsync('MyPlugin', callback => {
        //     //     // download('https://img.shields.io/npm/v/webpack.svg', function(resp) {
        //     //     if (true) {
        //     //         compilation.assets['import-map.json'] = new RawSource(JSON.stringify({
        //     //             imports: {
        //     //                 a: 'b'
        //     //             }
        //     //         }));
        //     //         callback();
        //     //     } else {
        //     //         callback(new Error('[webpack-example-plugin] Unable to download the base import-map to override'));
        //     //     }
        //     //     // });
        //     // });
        //     compilation.hooks.processAssets.tapAsync(
        //         {
        //             name: pluginName,
        //             stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_DERIVED
        //         },
        //         processAssets
        //     );
        // });
    }

    getFileType (str) {
        str = str.replace(/\?.*/, '');
        const split = str.split('.');
        let ext = split.pop();
        if (this.options.transformExtensions.test(ext)) {
            ext = split.pop() + '.' + ext;
        }
        return ext;
    }

    async processAssets (compilation, callback) {
        const fileName = this.options.fileName;

        const files = Array.from(compilation.chunks).reduce((files, chunk) => {
            return Array.from(chunk.files).reduce((files, path) => {
                let { name } = chunk;

                if (name) {
                    name = name + '.' + this.getFileType(path);
                } else {
                    // For nameless chunks, just map the files directly.
                    name = path;
                }

                return files.concat({
                    path: path,
                    chunk: chunk,
                    name: name,
                    isInitial: chunk.isOnlyInitial ? chunk.isOnlyInitial() : (chunk.isInitial ? chunk.isInitial() : chunk.initial),
                    isChunk: true,
                    isAsset: false,
                    isModuleAsset: false
                });
            }, files);
        }, []);

        // files = stats.assets.reduce(function (files, asset) {
        //     const name = moduleAssets[asset.name];
        //     if (name) {
        //         return files.concat({
        //             path: asset.name,
        //             name: name,
        //             isInitial: false,
        //             isChunk: false,
        //             isAsset: true,
        //             isModuleAsset: true
        //         });
        //     }

        //     const isEntryAsset = (asset.chunks || []).length > 0;
        //     if (isEntryAsset) {
        //         return files;
        //     }

        //     return files.concat({
        //         path: asset.name,
        //         name: asset.name,
        //         isInitial: false,
        //         isChunk: false,
        //         isAsset: true,
        //         isModuleAsset: false
        //     });
        // }, files);

        console.log(files);

        let source = {
            imports: {
                foo: 'bar.js'
            }
        };

        const existingAsset = compilation.getAsset(fileName);
        let info = {};
        if (existingAsset) {
            source = merge(JSON.parse(existingAsset.source.source()), source);
            info = merge(existingAsset.info, info);
            compilation.updateAsset(fileName, new RawSource(JSON.stringify(source)), info);
        } else {
            compilation.emitAsset(fileName, new RawSource(JSON.stringify(source)), info);
        }
        callback();
    }
}

module.exports = { getCompilerHooks, ImportMapPlugin };
