'use strict';

const path = require('path');
const MemoryFileSystem = require('memory-fs');
const webpack = require('webpack');
const _ = require('lodash');
const FakeCopyWebpackPlugin = require('./helpers/copy-plugin-mock');
const ImportMapPlugin = require('../');
const { isWebpackVersionGte } = require('./helpers/webpack-version-helpers');

const OUTPUT_DIR = __dirname;

function webpackConfig (webpackOpts, opts) {
    const defaults = {
        output: {
            path: OUTPUT_DIR,
            filename: '[name].js'
        },
        plugins: [
            new ImportMapPlugin(opts.importMapOptions)
        ]
    };
    if (isWebpackVersionGte(4)) {
        defaults.optimization = { chunkIds: 'named' };
    }
    return _.merge(defaults, webpackOpts);
}

function webpackCompile (webpackOpts, opts = {}, cb, allowError = false) {
    let config;
    if (Array.isArray(webpackOpts)) {
        config = webpackOpts.map(function (x) {
            return webpackConfig(x, opts);
        });
    } else {
        config = webpackConfig(webpackOpts, opts);
    }

    const compiler = webpack(config);

    const fs = compiler.outputFileSystem = new MemoryFileSystem();
    const outFilename = opts.importMapOptions && opts.importMapOptions.fileName ? opts.importMapOptions.fileName : 'import-map.json';
    const importMapPath = path.join(OUTPUT_DIR, outFilename);

    compiler.run(function (err, stats) {
        let manifestFile;
        try {
            manifestFile = JSON.parse(fs.readFileSync(importMapPath).toString());
        } catch (e) {
            manifestFile = null;
        }

        if (err) {
            console.log(err);
            throw err;
        }
        if (!allowError) {
            if (stats.hasErrors()) {
                console.log(stats.toJson());
            }
            expect(stats.hasErrors()).toBe(false);
        }

        cb(manifestFile, stats, fs);
    });
}

describe('ManifestPlugin', () => {
    it('exists', () => {
        expect(ImportMapPlugin).toBeDefined();
    });

    describe('basic behavior', () => {
        it('outputs an importMap of one file', done => {
            webpackCompile({
                context: __dirname,
                entry: './fixtures/file.js'
            }, {}, function (importMap) {
                expect(importMap).toBeDefined();
                expect(importMap).toEqual({
                    imports: {
                        'main.js': 'main.js'
                    }
                });

                done();
            });
        });

        it('outputs a importMap of multiple files', done => {
            webpackCompile({
                context: __dirname,
                entry: {
                    one: './fixtures/file.js',
                    two: './fixtures/file-two.js'
                }
            }, {}, function (importMap) {
                expect(importMap).toEqual({
                    imports: {
                        'one.js': 'one.js',
                        'two.js': 'two.js'
                    }
                });

                done();
            });
        });

        it('works with hashes in the filename', done => {
            webpackCompile({
                context: __dirname,
                entry: {
                    one: './fixtures/file.js'
                },
                output: {
                    filename: (isWebpackVersionGte(5) ? '[name].[fullhash].js' : '[name].[hash].js')
                }
            }, {}, function (importMap, stats) {
                expect(importMap).toEqual({
                    imports: {
                        'one.js': 'one.' + stats.hash + '.js'
                    }
                });

                done();
            });
        });

        it('works with source maps', done => {
            webpackCompile({
                context: __dirname,
                devtool: (isWebpackVersionGte(5) ? 'source-map' : 'sourcemap'),
                entry: {
                    one: './fixtures/file.js'
                },
                output: {
                    filename: '[name].js'
                }
            }, {}, function (importMap, stats) {
                expect(importMap).toEqual({
                    imports: {
                        'one.js': 'one.js',
                        'one.js.map': 'one.js.map'
                    }
                });

                done();
            });
        });

        it('prefixes definitions with a base url', done => {
            webpackCompile({
                context: __dirname,
                entry: {
                    one: './fixtures/file.js'
                },
                output: {
                    filename: (isWebpackVersionGte(5) ? '[name].[fullhash].js' : '[name].[hash].js')
                }
            }, {
                importMapOptions: {
                    baseUrl: '/app/'
                }
            }, function (importMap, stats) {
                expect(importMap).toEqual({
                    imports: {
                        'one.js': '/app/one.' + stats.hash + '.js'
                    }
                });

                done();
            });
        });

        describe('transformKeys', () => {
            it('applies the transform keys on all the key values', done => {
                webpackCompile({
                    context: __dirname,
                    entry: {
                        one: './fixtures/file.js'
                    },
                    output: {
                        filename: (isWebpackVersionGte(5) ? '[name].[fullhash].js' : '[name].[hash].js'),
                        publicPath: '/app/'
                    }
                }, {
                    importMapOptions: {
                        transformKeys: x => `zzz/${x}`
                    }
                }, function (importMap, stats) {
                    expect(importMap).toEqual({
                        imports: {
                            'zzz/one.js': '/app/one.' + stats.hash + '.js'
                        }
                    });

                    done();
                });
            });

            it('is possible to overrides publicPath', (done) => {
                webpackCompile({
                    context: __dirname,
                    entry: {
                        one: './fixtures/file.js'
                    },
                    output: {
                        filename: (isWebpackVersionGte(5) ? '[name].[fullhash].js' : '[name].[hash].js'),
                        publicPath: '/not-foo/'
                    }
                }, {
                    importMapOptions: {
                        baseUrl: '/foo/'
                    }
                }, function (importMap, stats) {
                    expect(importMap).toEqual({
                        imports: {
                            'one.js': '/foo/one.' + stats.hash + '.js'
                        }
                    });

                    done();
                });
            });
        });

        it('should keep full urls provided by baseUrl', done => {
            webpackCompile({
                context: __dirname,
                entry: {
                    one: './fixtures/file.js'
                },
                output: {
                    filename: '[name].js'
                }
            }, {
                importMapOptions: {
                    baseUrl: 'https://www/example.com/'
                }
            }, function (importMap, stats) {
                expect(importMap).toEqual({
                    imports: {
                        'one.js': 'https://www/example.com/one.js'
                    }
                });

                done();
            });
        });

        it('should keep full urls provided by publicPath', done => {
            webpackCompile({
                context: __dirname,
                entry: {
                    one: './fixtures/file.js'
                },
                output: {
                    filename: '[name].js',
                    publicPath: 'http://www/example.com/'
                }
            }, {}, function (importMap, stats) {
                expect(importMap).toEqual({
                    imports: {
                        'one.js': 'http://www/example.com/one.js'
                    }
                });

                done();
            });
        });

        it('adds seed object custom attributes when provided', done => {
            webpackCompile({
                context: __dirname,
                entry: {
                    one: './fixtures/file.js'
                },
                output: {
                    filename: '[name].js'
                }
            }, {
                importMapOptions: {
                    seed: {
                        test1: 'test2'
                    }
                }
            }, function (importMap) {
                expect(importMap).toEqual({
                    imports: {
                        'one.js': 'one.js',
                        test1: 'test2'
                    }
                });

                done();
            });
        });

        it('does not prefix seed attributes with baseUrl', done => {
            webpackCompile({
                context: __dirname,
                entry: {
                    one: './fixtures/file.js'
                },
                output: {
                    filename: (isWebpackVersionGte(5) ? '[name].[fullhash].js' : '[name].[hash].js'),
                    publicPath: '/app/'
                }
            }, {
                importMapOptions: {
                    baseUrl: '/app/',
                    seed: {
                        test1: 'test2'
                    }
                }
            }, function (importMap, stats) {
                expect(importMap).toEqual({
                    imports: {
                        'one.js': '/app/one.' + stats.hash + '.js',
                        test1: 'test2'
                    }
                });

                done();
            });
        });

        it('combines manifests of multiple compilations', done => {
            webpackCompile([{
                context: __dirname,
                entry: {
                    one: './fixtures/file.js'
                }
            }, {
                context: __dirname,
                entry: {
                    two: './fixtures/file-two.js'
                }
            }], {
                importMapOptions: {
                    seed: {}
                }
            }, function (importMap) {
                expect(importMap).toEqual({
                    imports: {
                        'one.js': 'one.js',
                        'two.js': 'two.js'
                    }
                });

                done();
            });
        });

        it('outputs a importMap of no-js file', done => {
            webpackCompile({
                context: __dirname,
                entry: './fixtures/file.txt',
                module: isWebpackVersionGte(4) ? {
                    rules: [{
                        test: /\.(txt)/,
                        use: [{
                            loader: 'file-loader',
                            options: {
                                name: '[name].[ext]'
                            }
                        }]
                    }]
                } : {
                    loaders: [
                        { test: /\.(txt)/, loader: 'file-loader?name=file.[ext]' }
                    ]
                }
            }, {}, function (importMap, stats) {
                expect(importMap).toBeDefined();
                expect(importMap).toEqual({
                    imports: {
                        'main.js': 'main.js',
                        'file.txt': 'file.txt'
                    }
                });

                done();
            });
        });

        it('ensures the importMap is mapping paths to names', done => {
            webpackCompile({
                context: __dirname,
                entry: './fixtures/file.txt',
                module: isWebpackVersionGte(4) ? {
                    rules: [{
                        test: /\.(txt)/,
                        use: [{
                            loader: 'file-loader',
                            options: {
                                name: 'outputfile.[ext]'
                            }
                        }]
                    }]
                } : {
                    loaders: [
                        { test: /\.(txt)/, loader: 'file-loader?name=outputfile.[ext]' }
                    ]
                }
            }, {}, function (importMap, stats) {
                expect(importMap).toBeDefined();
                expect(importMap).toEqual({
                    imports: {
                        'main.js': 'main.js',
                        'file.txt': 'outputfile.txt'
                    }
                });

                done();
            });
        });

        // Webpack 5 doesn't include file content in stats.compilation.assets
        if (!isWebpackVersionGte(5)) {
            it('make importMap available to other webpack plugins', done => {
                webpackCompile({
                    context: __dirname,
                    entry: './fixtures/file.js'
                }, {}, function (importMap, stats) {
                    expect(importMap).toEqual({
                        imports: {
                            'main.js': 'main.js'
                        }
                    });

                    expect(JSON.parse(stats.compilation.assets['import-map.json'].source())).toEqual({
                        imports: {
                            'main.js': 'main.js'
                        }
                    });

                    done();
                });
            });
        }

        it('should output unix paths', done => {
            webpackCompile({
                context: __dirname,
                entry: {
                    'dir\\main': './fixtures/file.js',
                    'some\\dir\\main': './fixtures/file.js'
                }
            }, {}, function (importMap) {
                expect(importMap).toBeDefined();
                expect(importMap).toEqual({
                    imports: {
                        'dir/main.js': 'dir/main.js',
                        'some/dir/main.js': 'some/dir/main.js'
                    }
                });

                done();
            });
        });
    });

    describe('nameless chunks', () => {
        it(
            'add a literal mapping of files generated by nameless chunks.',
            done => {
                webpackCompile({
                    context: __dirname,
                    entry: {
                        nameless: './fixtures/nameless.js'
                    },
                    output: {
                        filename: (isWebpackVersionGte(5) ? '[name].[fullhash].js' : '[name].[hash].js')
                    }
                }, {}, function (importMap, stats) {
                    expect(Object.keys(importMap.imports).length).toBe(2);
                    expect(importMap.imports['nameless.js']).toEqual('nameless.' + stats.hash + '.js');

                    done();
                });
            }
        );
    });

    describe('set location of importMap', () => {
        describe('using relative path', () => {
            it('should use output to the correct location', done => {
                webpackCompile({
                    context: __dirname,
                    entry: './fixtures/file.js'
                }, {
                    importMapOptions: {
                        fileName: 'my-import-map.json'
                    }
                }, function (importMap, stats, fs) {
                    const importMapPath = path.join(OUTPUT_DIR, 'my-import-map.json');

                    const result = JSON.parse(fs.readFileSync(importMapPath).toString());

                    expect(result).toEqual({
                        imports: {
                            'main.js': 'main.js'
                        }
                    });

                    done();
                });
            });
        });

        describe('using absolute path', () => {
            it('should use output to the correct location', done => {
                webpackCompile({
                    context: __dirname,
                    entry: './fixtures/file.js'
                }, {
                    importMapOptions: {
                        fileName: path.join(__dirname, 'my-import-map.json')
                    }
                }, function (importMap, stats, fs) {
                    const importMapPath = path.join(__dirname, 'my-import-map.json');

                    const result = JSON.parse(fs.readFileSync(importMapPath).toString());

                    expect(result).toEqual({
                        imports: {
                            'main.js': 'main.js'
                        }
                    });

                    done();
                });
            });
        });
    });

    describe('filter', () => {
        it('should filter out non-initial chunks', done => {
            webpackCompile({
                context: __dirname,
                entry: {
                    nameless: './fixtures/nameless.js'
                },
                output: {
                    filename: (isWebpackVersionGte(5) ? '[name].[fullhash].js' : '[name].[hash].js')
                }
            }, {
                importMapOptions: {
                    filter: function (file) {
                        return file.isInitial;
                    }
                }
            }, function (importMap, stats) {
                expect(Object.keys(importMap.imports).length).toBe(1);
                expect(importMap.imports['nameless.js']).toEqual('nameless.' + stats.hash + '.js');

                done();
            });
        });
    });

    describe('map', () => {
        it('should allow modifying files defails', done => {
            webpackCompile({
                context: __dirname,
                entry: './fixtures/file.js',
                output: {
                    filename: '[name].js'
                }
            }, {
                importMapOptions: {
                    map: function (file, i) {
                        file.name = i.toString();
                        return file;
                    }
                }
            }, function (importMap, stats) {
                expect(importMap).toEqual({
                    imports: {
                        0: 'main.js'
                    }
                });

                done();
            });
        });

        it('should allow file name changes', done => {
            webpackCompile({
                context: __dirname,
                entry: './fixtures/file.js',
                output: {
                    filename: 'javascripts/main.js'
                }
            }, {
                importMapOptions: {
                    map: function (file) {
                        file.name = path.posix.join('foo', file.name);
                        return file;
                    }
                }
            }, function (importMap) {
                expect(importMap).toEqual({
                    imports: {
                        'foo/main.js': 'javascripts/main.js'
                    }
                });

                done();
            });
        });
    });

    describe('include', () => {
        it('match with string', done => {
            webpackCompile({
                context: __dirname,
                entry: {
                    one: './fixtures/file.js',
                    two: './fixtures/file-two.js'
                },
                output: {
                    filename: '[name].js'
                }
            }, {
                importMapOptions: {
                    include: 'two.js'
                }
            }, function (importMap, stats) {
                expect(importMap).toEqual({
                    imports: {
                        'two.js': 'two.js'
                    }
                });

                done();
            });
        });
        it('match with string array', done => {
            webpackCompile({
                context: __dirname,
                entry: {
                    one: './fixtures/file.js',
                    two: './fixtures/file-two.js'
                },
                output: {
                    filename: '[name].js'
                }
            }, {
                importMapOptions: {
                    include: ['one.js', 'three.js']
                }
            }, function (importMap, stats) {
                expect(importMap).toEqual({
                    imports: {
                        'one.js': 'one.js'
                    }
                });

                done();
            });
        });
        it('match with regex', done => {
            webpackCompile({
                context: __dirname,
                entry: {
                    one: './fixtures/file.js',
                    two: './fixtures/file-two.js'
                },
                output: {
                    filename: '[name].js'
                }
            }, {
                importMapOptions: {
                    include: /wo\.js$/
                }
            }, function (importMap, stats) {
                expect(importMap).toEqual({
                    imports: {
                        'two.js': 'two.js'
                    }
                });

                done();
            });
        });
        it('match with regex array', done => {
            webpackCompile({
                context: __dirname,
                entry: {
                    one: './fixtures/file.js',
                    two: './fixtures/file-two.js'
                },
                output: {
                    filename: '[name].js'
                }
            }, {
                importMapOptions: {
                    include: [/n/, /x/]
                }
            }, function (importMap, stats) {
                expect(importMap).toEqual({
                    imports: {
                        'one.js': 'one.js'
                    }
                });

                done();
            });
        });
        it('match with mixed array', done => {
            webpackCompile({
                context: __dirname,
                entry: {
                    one: './fixtures/file.js',
                    two: './fixtures/file-two.js'
                },
                output: {
                    filename: '[name].js'
                }
            }, {
                importMapOptions: {
                    include: ['one.js', /two/]
                }
            }, function (importMap, stats) {
                expect(importMap).toEqual({
                    imports: {
                        'one.js': 'one.js',
                        'two.js': 'two.js'
                    }
                });

                done();
            });
        });
        it('emit errors with unsupported', done => {
            webpackCompile({
                context: __dirname,
                entry: {
                    one: './fixtures/file.js',
                    two: './fixtures/file-two.js'
                },
                output: {
                    filename: '[name].js'
                }
            }, {
                importMapOptions: {
                    include: () => true
                }
            }, function (importMap, stats) {
                expect(importMap).toEqual({ imports: {} });
                expect(stats.hasErrors).toBeTruthy();

                let error;
                error = stats.toJson().errors[0];
                error = (error instanceof Object) ? error.message : error;
                expect(error).toMatch('[webpack-import-map-plugin]');

                done();
            }, true);
        });
        it('emit errors with unsupported in array', done => {
            webpackCompile({
                context: __dirname,
                entry: {
                    one: './fixtures/file.js',
                    two: './fixtures/file-two.js'
                },
                output: {
                    filename: '[name].js'
                }
            }, {
                importMapOptions: {
                    include: ['xxx.js', false]
                }
            }, function (importMap, stats) {
                expect(importMap).toEqual({ imports: {} });
                expect(stats.hasErrors).toBeTruthy();

                let error;
                error = stats.toJson().errors[0];
                error = (error instanceof Object) ? error.message : error;
                expect(error).toMatch('[webpack-import-map-plugin]');

                done();
            }, true);
        });
    });
    describe('exclude', () => {
        it('match with string', done => {
            webpackCompile({
                context: __dirname,
                entry: {
                    one: './fixtures/file.js',
                    two: './fixtures/file-two.js'
                },
                output: {
                    filename: '[name].js'
                }
            }, {
                importMapOptions: {
                    exclude: 'two.js'
                }
            }, function (importMap, stats) {
                expect(importMap).toEqual({
                    imports: {
                        'one.js': 'one.js'
                    }
                });

                done();
            });
        });
        it('match with string array', done => {
            webpackCompile({
                context: __dirname,
                entry: {
                    one: './fixtures/file.js',
                    two: './fixtures/file-two.js'
                },
                output: {
                    filename: '[name].js'
                }
            }, {
                importMapOptions: {
                    exclude: ['one.js', 'three.js']
                }
            }, function (importMap, stats) {
                expect(importMap).toEqual({
                    imports: {
                        'two.js': 'two.js'
                    }
                });

                done();
            });
        });
        it('match with regex', done => {
            webpackCompile({
                context: __dirname,
                entry: {
                    one: './fixtures/file.js',
                    two: './fixtures/file-two.js'
                },
                output: {
                    filename: '[name].js'
                }
            }, {
                importMapOptions: {
                    exclude: /wo\.js$/
                }
            }, function (importMap, stats) {
                expect(importMap).toEqual({
                    imports: {
                        'one.js': 'one.js'
                    }
                });

                done();
            });
        });
        it('match with regex array', done => {
            webpackCompile({
                context: __dirname,
                entry: {
                    one: './fixtures/file.js',
                    two: './fixtures/file-two.js'
                },
                output: {
                    filename: '[name].js'
                }
            }, {
                importMapOptions: {
                    exclude: [/n/, /x/]
                }
            }, function (importMap, stats) {
                expect(importMap).toEqual({
                    imports: {
                        'two.js': 'two.js'
                    }
                });

                done();
            });
        });
        it('match with mixed array', done => {
            webpackCompile({
                context: __dirname,
                entry: {
                    one: './fixtures/file.js',
                    two: './fixtures/file-two.js'
                },
                output: {
                    filename: '[name].js'
                }
            }, {
                importMapOptions: {
                    exclude: ['one.js', /two/]
                }
            }, function (importMap, stats) {
                expect(importMap).toEqual({
                    imports: {}
                });

                done();
            });
        });
        it('emit errors with unsupported', done => {
            webpackCompile({
                context: __dirname,
                entry: {
                    one: './fixtures/file.js',
                    two: './fixtures/file-two.js'
                },
                output: {
                    filename: '[name].js'
                }
            }, {
                importMapOptions: {
                    exclude: () => true
                }
            }, function (importMap, stats) {
                expect(importMap).toEqual({
                    imports: {
                        'one.js': 'one.js',
                        'two.js': 'two.js'
                    }
                });
                expect(stats.hasErrors).toBeTruthy();

                let error;
                error = stats.toJson().errors[0];
                error = (error instanceof Object) ? error.message : error;
                expect(error).toMatch('[webpack-import-map-plugin]');

                done();
            }, true);
        });
        it('emit errors with unsupported in array', done => {
            webpackCompile({
                context: __dirname,
                entry: {
                    one: './fixtures/file.js',
                    two: './fixtures/file-two.js'
                },
                output: {
                    filename: '[name].js'
                }
            }, {
                importMapOptions: {
                    exclude: ['xxx.js', false]
                }
            }, function (importMap, stats) {
                expect(importMap).toEqual({
                    imports: {
                        'one.js': 'one.js',
                        'two.js': 'two.js'
                    }
                });
                expect(stats.hasErrors).toBeTruthy();

                let error;
                error = stats.toJson().errors[0];
                error = (error instanceof Object) ? error.message : error;
                expect(error).toMatch('[webpack-import-map-plugin]');

                done();
            }, true);
        });
    });
    describe('transformValues', () => {
        it('run the function on all values', done => {
            webpackCompile({
                context: __dirname,
                entry: {
                    one: './fixtures/file.js',
                    two: './fixtures/file-two.js'
                },
                output: {
                    filename: '[name].js'
                }
            }, {
                importMapOptions: {
                    transformValues: (path) => {
                        return 'https://cdn.com/foo/' + path + 'x';
                    }
                }
            }, function (importMap, stats) {
                expect(importMap).toEqual({
                    imports: {
                        'one.js': 'https://cdn.com/foo/one.jsx',
                        'two.js': 'https://cdn.com/foo/two.jsx'
                    }
                });

                done();
            });
        });
    });
    describe('baseUrl', () => {
        it('prepend the baseUrl on all values', done => {
            webpackCompile({
                context: __dirname,
                entry: {
                    one: './fixtures/file.js',
                    two: './fixtures/file-two.js'
                },
                output: {
                    filename: '[name].js'
                }
            }, {
                importMapOptions: {
                    baseUrl: 'https://my-cdn.com/'
                }
            }, function (importMap, stats) {
                expect(importMap).toEqual({
                    imports: {
                        'one.js': 'https://my-cdn.com/one.js',
                        'two.js': 'https://my-cdn.com/two.js'
                    }
                });

                done();
            });
        });
    });
    describe('sort', () => {
        it('should allow ordering of output', done => {
            webpackCompile({
                context: __dirname,
                entry: {
                    one: './fixtures/file.js',
                    two: './fixtures/file-two.js'
                },
                output: {
                    filename: '[name].js'
                }
            }, {
                importMapOptions: {
                    sort: function (a, b) {
                        // make sure one is the latest
                        return a.name === 'one.js' ? 1 : -1;
                    }
                }
            }, function (importMap, stats) {
                expect(Object.keys(importMap.imports)).toEqual(['two.js', 'one.js']);

                done();
            });
        });
    });

    describe('generate', () => {
        it('should default to `seed`', done => {
            webpackCompile({
                context: __dirname,
                entry: './fixtures/file.js',
                output: {
                    filename: '[name].js'
                }
            }, {
                importMapOptions: {
                    seed: {
                        key: 'value'
                    },
                    generate: function (seed) {
                        expect(seed).toEqual({
                            key: 'value'
                        });
                        return seed;
                    }
                }
            }, function (importMap, stats) {
                expect(importMap).toEqual({
                    imports: {
                        key: 'value'
                    }
                });

                done();
            });
        });

        it('should generate importMap with flattened "entrypoints"', done => {
            webpackCompile({
                context: __dirname,
                entry: {
                    one: './fixtures/file.js',
                    two: './fixtures/file-two.js'
                }
            }, {
                importMapOptions: {
                    generate: (seed, files, entrypoints) => {
                        const manifestFiles = files.reduce(
                            (importMap, { name, path }) => Object.assign(importMap, {
                                [name]: path
                            }),
                            seed
                        );
                        return {
                            files: manifestFiles,
                            entrypoints
                        };
                    }
                }
            },
            (importMap, stats) => {
                expect(importMap).toEqual({
                    imports: {
                        'one.js': 'one.js',
                        'two.js': 'two.js'
                    }
                });

                done();
            });
        });

        describe('with CopyWebpackPlugin', () => {
            it('works when including copied assets', done => {
                webpackCompile({
                    context: __dirname,
                    entry: {
                        one: './fixtures/file.js'
                    },
                    plugins: [
                        new FakeCopyWebpackPlugin(),
                        new ImportMapPlugin()
                    ]
                }, {}, function (importMap, stats) {
                    expect(importMap).toEqual({
                        imports: {
                            'one.js': 'one.js',
                            'third.party.js': 'third.party.js'
                        }
                    });

                    done();
                });
            });

            it(
                'doesn\'t add duplicates when prefixes definitions with a base path',
                done => {
                    webpackCompile({
                        context: __dirname,
                        entry: {
                            one: './fixtures/file.js'
                        },
                        output: {
                            filename: (isWebpackVersionGte(5) ? '[name].[fullhash].js' : '[name].[hash].js'),
                            publicPath: '/app/'
                        },
                        plugins: [
                            new FakeCopyWebpackPlugin(),
                            new ImportMapPlugin({
                                baseUrl: '/app/'
                            })
                        ]
                    }, {}, function (importMap, stats) {
                        expect(importMap).toEqual({
                            imports: {
                                'one.js': '/app/one.' + stats.hash + '.js',
                                'third.party.js': '/app/third.party.js'
                            }
                        });

                        done();
                    });
                }
            );

            it(
                'doesn\'t add duplicates when used with hashes in the filename',
                done => {
                    webpackCompile({
                        context: __dirname,
                        entry: {
                            one: './fixtures/file.js'
                        },
                        output: {
                            filename: (isWebpackVersionGte(5) ? '[name].[fullhash].js' : '[name].[hash].js')
                        },
                        plugins: [
                            new FakeCopyWebpackPlugin(),
                            new ImportMapPlugin()
                        ]
                    }, {}, function (importMap, stats) {
                        expect(importMap).toEqual({
                            imports: {
                                'one.js': 'one.' + stats.hash + '.js',
                                'third.party.js': 'third.party.js'
                            }
                        });

                        done();
                    });
                }
            );
        });
    });
});
