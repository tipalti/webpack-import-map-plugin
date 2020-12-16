const validateOptions = require('schema-utils');
const merge = require('lodash/merge');
const webpack = require('webpack');
const { RawSource } = webpack.sources || require('webpack-sources');

// schema for options object
const schema = {
  type: 'object',
  properties: {
    test: {
      type: 'string'
    }
  }
};

class ImportMapPlugin {
    constructor(options = {}){
        validateOptions(schema, options, 'Import Map Plugin');
        options.transformExtensions = /^(gz|map)$/i;
        this.options = options;
    }
    apply(compiler) {
        const pluginName = this.constructor.name;
    
        compiler.hooks.entryOption.tap(pluginName, (context, entry) => {
            // console.log(context);
            // console.log(entry);
        });
        compiler.hooks.thisCompilation.tap(pluginName, (compilation) => {
            const logger = compilation.getLogger("import-map-plugin");
            const cache = compilation.getCache("ImportMapPlugin");
            compilation.hooks.additionalAssets.tapAsync('MyPlugin', callback => {
                // download('https://img.shields.io/npm/v/webpack.svg', function(resp) {
                if(true) {
                    compilation.assets['import-map.json'] = new RawSource(JSON.stringify({
                        imports: {
                            a: 'b'
                        }
                    }));
                    callback();
                  } else {
                    callback(new Error('[webpack-example-plugin] Unable to download the image'));
                  }
                // });
            });
            compilation.hooks.processAssets.tapAsync(
            {
                name: "import-map-plugin",
                stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_DERIVED ,
            },
            async (unusedAssets, callback) => {
                let filename = "import-map.json";
                
                const getFileType =  (str) => {
                    str = str.replace(/\?.*/, '');
                    const split = str.split('.');
                    let ext = split.pop();
                    if (this.options.transformExtensions.test(ext)) {
                        ext = split.pop() + '.' + ext;
                    }
                    return ext;
                };

                let files = Array.from(compilation.chunks).reduce( (files, chunk) => {
                    return Array.from(chunk.files).reduce( (files, path) => {
                        let name = chunk.name ? chunk.name : null;
        
                        if (name) {
                            name = name + '.' + getFileType(path);
                        } else {
                            // For nameless chunks, just map the files directly.
                            name = path;
                        }
        
                        return files.concat({
                            path: path,
                            chunk: chunk,
                            name: name,
                            isInitial: chunk.isOnlyInitial(),
                            isChunk: true,
                            isAsset: false,
                            isModuleAsset: false
                        });
                    }, files);
                }, []);

                let source = {
                    "imports": {
                        "foo": "bar.js"
                    }
                };

                const existingAsset = compilation.getAsset(filename);
                let info = {};
                if (existingAsset) {
                    source = merge(JSON.parse(existingAsset.source.source()), source);
                    info = merge(existingAsset.info, info);
                    compilation.updateAsset(filename, new RawSource(JSON.stringify(source)), info);
                } else {
                    compilation.emitAsset(filename, new RawSource(JSON.stringify(source)), info);
                }
                callback();
            })
        })
    }
}

  
  module.exports = ImportMapPlugin;