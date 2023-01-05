const entries = require('object.entries');
const path = require('path');
const fs = require('fs');
const _ = require('lodash');

const standardizeFilePaths = (file) => {
    file.name = file.name.replace(/\\/g, '/');
    file.path = file.path.replace(/\\/g, '/');
    return file;
};

const emitCountMap = new Map();
const compilerHookMap = new WeakMap();

function ImportMapPlugin (opts) {
    this.opts = _.assign({
        include: '',
        exclude: '',
        transformKeys: null,
        transformValues: null,
        baseUrl: null,
        fileName: 'import-map.json',
        transformExtensions: /^(gz|map)$/i,
        writeToFileEmit: false,
        filter: null,
        generate: null,
        seed: null,
        map: null,
        sort: null,
        serialize: function (manifest) {
            return JSON.stringify(manifest, null, 4);
        }
    }, opts || {});
}

ImportMapPlugin.getCompilerHooks = (compiler) => {
    let hooks = compilerHookMap.get(compiler);
    if (hooks === undefined) {
        const SyncWaterfallHook = require('tapable').SyncWaterfallHook;
        hooks = {
            afterEmit: new SyncWaterfallHook(['importmap'])
        };
        compilerHookMap.set(compiler, hooks);
    }
    return hooks;
};

ImportMapPlugin.prototype.getFileType = function (str) {
    str = str.replace(/\?.*/, '');
    const split = str.split('.');
    let ext = split.pop();
    if (this.opts.transformExtensions.test(ext)) {
        ext = split.pop() + '.' + ext;
    }
    return ext;
};

ImportMapPlugin.prototype.apply = function (compiler) {
    const moduleAssets = {};

    const outputFolder = compiler.options.output.path;
    const outputFile = path.resolve(outputFolder, this.opts.fileName);
    const outputName = path.relative(outputFolder, outputFile);

    const moduleAsset = function (module, file) {
        if (module.userRequest) {
            moduleAssets[file] = path.join(
                path.dirname(file),
                path.basename(module.userRequest)
            );
        }
    };

    const emit = function (compilation, compileCallback) {
        const emitCount = emitCountMap.get(outputFile) - 1;
        emitCountMap.set(outputFile, emitCount);

        const seed = this.opts.seed || {};

        const baseUrl = (
            (this.opts.baseUrl != null)
                ? this.opts.baseUrl
                : (compilation.options.output.publicPath !== 'auto')
                    ? compilation.options.output.publicPath
                    : ''
        ) || ''; // fallback to public path
        const stats = compilation.getStats().toJson({
            // Disable data generation of everything we don't use
            all: false,
            // Add asset Information
            assets: true,
            // Show cached assets (setting this to `false` only shows emitted files)
            cachedAssets: true
        });

        let files = (Array.isArray(compilation.chunks) ? compilation.chunks : Array.from(compilation.chunks || []))
            .reduce(function (files, chunk) {
                return (Array.isArray(chunk.files) ? chunk.files : Array.from(chunk.files || []))
                    .reduce(function (files, path) {
                        let name = chunk.name ? chunk.name : null;

                        if (name) {
                            name = name + '.' + this.getFileType(path);
                        } else {
                            // For nameless chunks, just map the files directly.
                            name = path;
                        }

                        // Webpack 4/5: .isOnlyInitial()
                        // Webpack 3:   .isInitial()
                        // Webpack 1/2: .initial
                        return files.concat({
                            path: path,
                            chunk: chunk,
                            name: name,
                            isInitial: chunk.isOnlyInitial ? chunk.isOnlyInitial() : (chunk.isInitial ? chunk.isInitial() : chunk.initial),
                            isChunk: true,
                            isAsset: false,
                            isModuleAsset: false
                        });
                    }.bind(this), files);
            }.bind(this), []);

        // module assets don't show up in assetsByChunkName.
        // we're getting them this way;
        files = (Array.isArray(stats.assets) ? stats.assets : Array.from(stats.assets || []))
            .reduce(function (files, asset) {
                const name = moduleAssets[asset.name];
                if (name) {
                    return files.concat({
                        path: asset.name,
                        name: name,
                        isInitial: false,
                        isChunk: false,
                        isAsset: true,
                        isModuleAsset: true
                    });
                }

                const isEntryAsset = (asset.chunks || asset.chunkNames).length > 0;
                if (isEntryAsset) {
                    // inject related
                    if (asset.info && asset.info.related) {
                        for (const key in asset.info.related) {
                            const name = asset.info.related[key];
                            files.push({
                                path: name,
                                name: name,
                                isInitial: false,
                                isChunk: false,
                                isAsset: false,
                                isModuleAsset: false
                            });
                        }
                    }
                    return files;
                }

                return files.concat({
                    path: asset.name,
                    name: asset.name,
                    isInitial: false,
                    isChunk: false,
                    isAsset: true,
                    isModuleAsset: false
                });
            }, files);

        files = files.filter(function (file) {
            // Don't add hot updates to manifest
            const isUpdateChunk = file.path.indexOf('hot-update') >= 0;
            // Don't add manifest from another instance
            const isManifest = emitCountMap.get(path.join(outputFolder, file.name)) !== undefined;

            return !isUpdateChunk && !isManifest;
        });

        const includeExcludeFilter = (val, rule) => {
            if (_.isRegExp(rule)) {
                return rule.test(val);
            } else if (_.isString(rule)) {
                return val === rule;
            } else {
                compilation.errors.push(new TypeError('[webpack-import-map-plugin]: Unsupported type provided for include or exclude option.'));
            }
        };

        if (this.opts.include) {
            files = files.filter((file) => {
                if (_.isArray(this.opts.include)) {
                    return this.opts.include.some(innerRule => {
                        return includeExcludeFilter(file.name, innerRule);
                    });
                }
                return includeExcludeFilter(file.name, this.opts.include);
            });
        }

        if (this.opts.exclude) {
            files = files.filter((file) => {
                if (_.isArray(this.opts.exclude)) {
                    return !this.opts.exclude.some(innerRule => {
                        return includeExcludeFilter(file.name, innerRule);
                    });
                }
                return !includeExcludeFilter(file.name, this.opts.exclude);
            });
        }

        if (this.opts.filter) {
            files = files.filter(this.opts.filter);
        }

        if (this.opts.transformKeys && _.isFunction(this.opts.transformKeys)) {
            files = files.map((file) => {
                file.name = this.opts.transformKeys.call(this, file.name) || file.name;
                return file;
            });
        }

        if (this.opts.transformValues && _.isFunction(this.opts.transformValues)) {
            files = files.map((file) => {
                file.path = this.opts.transformValues.call(this, file.path) || file.path;
                return file;
            });
        }

        if (baseUrl) {
            // prepends the output with the baseUrl
            files = files.map(function (file) {
                const slash = (baseUrl.endsWith('/') || file.path.startsWith('/')) ? '' : '/';
                file.path = `${baseUrl}${slash}${file.path}`;
                return file;
            });
        }

        files = files.map(standardizeFilePaths);

        if (this.opts.map) {
            files = files.map(this.opts.map);
        }

        if (this.opts.sort) {
            files = files.sort(this.opts.sort);
        }

        let manifest;
        if (this.opts.generate) {
            const entrypointsArray = Array.from(
                compilation.entrypoints instanceof Map
                // Webpack 4+
                    ? compilation.entrypoints.entries()
                // Webpack 3
                    : entries(compilation.entrypoints)
            );
            const entrypoints = entrypointsArray.reduce(
                (e, [name, entrypoint]) => Object.assign(e, { [name]: entrypoint.getFiles() }),
                {}
            );
            manifest = this.opts.generate(seed, files, entrypoints);
        } else {
            manifest = files.reduce(function (manifest, file) {
                manifest[file.name] = file.path;
                return manifest;
            }, seed);
        }

        if (manifest.files) {
            manifest = manifest.files;
        }
        // now take the manifest and wrap it in the import-map syntax
        const importMap = {
            imports: {
                ...manifest
            }
        };
        const isLastEmit = (emitCount === 0);
        if (isLastEmit) {
            const output = this.opts.serialize(importMap);

            try {
                const { RawSource } = compiler.webpack.sources;
                compilation.emitAsset(
                    outputName,
                    new RawSource(output)
                );
            } catch (error) {
                compilation.assets[outputName] = {
                    source: function () {
                        return output;
                    },
                    size: function () {
                        return output.length;
                    }
                };
            }

            if (this.opts.writeToFileEmit) {
                fs.writeFileSync(outputFile, output);
            }
        }

        if (compiler.hooks) {
            ImportMapPlugin.getCompilerHooks(compiler).afterEmit.call(importMap);
        } else {
            compilation.applyPluginsAsync('webpack-import-map-plugin-after-emit', importMap, compileCallback);
        }
    }.bind(this);

    function beforeRun (compiler, callback) {
        const emitCount = emitCountMap.get(outputFile) || 0;
        emitCountMap.set(outputFile, emitCount + 1);

        if (callback) {
            callback();
        }
    }

    if (compiler.hooks) {
        const pluginOptions = {
            name: 'ImportMapPlugin',
            stage: Infinity
        };

        if (!Object.isFrozen(compiler.hooks)) {
            compiler.hooks.webpackImportMapPluginAfterEmit = ImportMapPlugin.getCompilerHooks(compiler).afterEmit;
        }

        compiler.hooks.compilation.tap(pluginOptions, function (compilation) {
            compilation.hooks.moduleAsset.tap(pluginOptions, moduleAsset);
        });
        compiler.hooks.emit.tap(pluginOptions, emit);

        compiler.hooks.run.tap(pluginOptions, beforeRun);
        compiler.hooks.watchRun.tap(pluginOptions, beforeRun);
    } else {
        compiler.plugin('compilation', function (compilation) {
            compilation.plugin('module-asset', moduleAsset);
        });
        compiler.plugin('emit', emit);

        compiler.plugin('before-run', beforeRun);
        compiler.plugin('watch-run', beforeRun);
    }
};

module.exports = ImportMapPlugin;
