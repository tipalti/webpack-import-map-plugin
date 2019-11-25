'use strict';

const path = require('path');
const sinon = require('sinon');
const expect = require('chai').expect;
const MemoryFileSystem = require('memory-fs');
const webpack = require('webpack');
const _ = require('lodash');
const ExtractTextPlugin = require('extract-text-webpack-plugin');
const FakeCopyWebpackPlugin = require('./helpers/copy-plugin-mock');
const ImportMapPlugin = require('../index.js');
const { isWebpackVersionGte } = require('./helpers/webpack-version-helpers');

const OUTPUT_DIR = path.join(__dirname, './webpack-out');
const importMapPath = path.join(OUTPUT_DIR, 'import-map.json');

function webpackConfig (webpackOpts, opts) {
    const defaults = {
        output: {
            path: OUTPUT_DIR,
            filename: '[name].js'
        },
        plugins: [
            new ImportMapPlugin(opts.manifestOptions)
        ]
    };
    if (isWebpackVersionGte(4)) {
        defaults.optimization = { chunkIds: 'named' };
    }
    return _.merge(defaults, webpackOpts);
}

function webpackCompile (webpackOpts, opts, cb) {
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
        if (stats.hasErrors()) {
            console.log(stats.toJson());
        }
        expect(stats.hasErrors()).to.eq(false);

        cb(manifestFile, stats, fs);
    });
}

describe('ManifestPlugin', function () {
    it('exists', function () {
        expect(ImportMapPlugin).to.exist;
    });

    describe('basic behavior', function () {
        it('outputs an importMap of one file', function (done) {
            webpackCompile({
                context: __dirname,
                entry: './fixtures/file.js'
            }, {}, function (importMap) {
                expect(importMap).to.exist;
                expect(importMap).to.eql({
                    imports: {
                        'main.js': 'main.js'
                    }
                });

                done();
            });
        });

        it('outputs a importMap of multiple files', function (done) {
            webpackCompile({
                context: __dirname,
                entry: {
                    one: './fixtures/file.js',
                    two: './fixtures/file-two.js'
                }
            }, {}, function (importMap) {
                expect(importMap).to.eql({
                    imports: {
                        'one.js': 'one.js',
                        'two.js': 'two.js'
                    }
                });

                done();
            });
        });

        it('works with hashes in the filename', function (done) {
            webpackCompile({
                context: __dirname,
                entry: {
                    one: './fixtures/file.js'
                },
                output: {
                    filename: '[name].[hash].js'
                }
            }, {}, function (importMap, stats) {
                expect(importMap).to.eql({
                    imports: {
                        'one.js': 'one.' + stats.hash + '.js'
                    }
                });

                done();
            });
        });

        it('works with source maps', function (done) {
            webpackCompile({
                context: __dirname,
                devtool: 'sourcemap',
                entry: {
                    one: './fixtures/file.js'
                },
                output: {
                    filename: '[name].js'
                }
            }, {}, function (importMap, stats) {
                expect(importMap).to.eql({
                    imports: {
                        'one.js': 'one.js',
                        'one.js.map': 'one.js.map'
                    }
                });

                done();
            });
        });

        it('prefixes definitions with a base url', function (done) {
            webpackCompile({
                context: __dirname,
                entry: {
                    one: './fixtures/file.js'
                },
                output: {
                    filename: '[name].[hash].js'
                }
            }, {
                manifestOptions: {
                    baseUrl: '/app/'
                }
            }, function (importMap, stats) {
                expect(importMap).to.eql({
                    imports: {
                        'one.js': '/app/one.' + stats.hash + '.js'
                    }
                });

                done();
            });
        });

        describe('transformKeys', () => {
            it('applies the transform keys on all the key values', function (done) {
                const stubFunc = sinon.stub();
                stubFunc.callsFake();
                webpackCompile({
                    context: __dirname,
                    entry: {
                        one: './fixtures/file.js'
                    },
                    output: {
                        filename: '[name].[hash].js',
                        publicPath: '/app/'
                    }
                }, {
                    transformKeys: x => `zzz/${x}`
                }, function (importMap, stats) {
                    expect(importMap).to.eql({
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
                        filename: '[name].[hash].js',
                        publicPath: '/app/'
                    }
                }, {
                    manifestOptions: {
                        publicPath: ''
                    }
                }, function (importMap, stats) {
                    expect(importMap).to.eql({
                        imports: {
                            'one.js': 'one.' + stats.hash + '.js'
                        }
                    });

                    done();
                });
            });
        });

        it('prefixes definitions with a base path when public path is also provided', function (done) {
            webpackCompile({
                context: __dirname,
                entry: {
                    one: './fixtures/file.js'
                },
                output: {
                    filename: '[name].[hash].js',
                    publicPath: '/app/'
                }
            }, {
                manifestOptions: {
                    basePath: '/app/'
                }
            }, function (importMap, stats) {
                expect(importMap).to.eql({
                    imports: {
                        '/app/one.js': '/app/one.' + stats.hash + '.js'
                    }
                });

                done();
            });
        });

        it('should keep full urls provided by basePath', function (done) {
            webpackCompile({
                context: __dirname,
                entry: {
                    one: './fixtures/file.js'
                },
                output: {
                    filename: '[name].js'
                }
            }, {
                manifestOptions: {
                    basePath: 'https://www/example.com/'
                }
            }, function (importMap, stats) {
                expect(importMap).to.eql({
                    imports: {
                        'https://www/example.com/one.js': 'one.js'
                    }
                });

                done();
            });
        });

        it('should keep full urls provided by publicPath', function (done) {
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
                expect(importMap).to.eql({
                    imports: {
                        'one.js': 'http://www/example.com/one.js'
                    }
                });

                done();
            });
        });

        it('adds seed object custom attributes when provided', function (done) {
            webpackCompile({
                context: __dirname,
                entry: {
                    one: './fixtures/file.js'
                },
                output: {
                    filename: '[name].js'
                }
            }, {
                manifestOptions: {
                    seed: {
                        test1: 'test2'
                    }
                }
            }, function (importMap) {
                expect(importMap).to.eql({
                    imports: {
                        'one.js': 'one.js',
                        test1: 'test2'
                    }
                });

                done();
            });
        });

        it('does not prefix seed attributes with basePath', function (done) {
            webpackCompile({
                context: __dirname,
                entry: {
                    one: './fixtures/file.js'
                },
                output: {
                    filename: '[name].[hash].js',
                    publicPath: '/app/'
                }
            }, {
                manifestOptions: {
                    basePath: '/app/',
                    seed: {
                        test1: 'test2'
                    }
                }
            }, function (importMap, stats) {
                expect(importMap).to.eql({
                    '/app/one.js': '/app/one.' + stats.hash + '.js',
                    test1: 'test2'
                });

                done();
            });
        });

        it('combines manifests of multiple compilations', function (done) {
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
                manifestOptions: {
                    seed: {}
                }
            }, function (importMap) {
                expect(importMap).to.eql({
                    'one.js': 'one.js',
                    'two.js': 'two.js'
                });

                done();
            });
        });

        it('outputs a importMap of no-js file', function (done) {
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
                expect(importMap).to.exist;
                expect(importMap).to.eql({
                    'main.js': 'main.js',
                    'file.txt': 'file.txt'
                });

                done();
            });
        });

        it('ensures the importMap is mapping paths to names', function (done) {
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
                expect(importMap).to.exist;
                expect(importMap).to.eql({
                    'main.js': 'main.js',
                    'file.txt': 'outputfile.txt'
                });

                done();
            });
        });

        // Webpack 5 doesn't include file content in stats.compilation.assets
        if (!isWebpackVersionGte(5)) {
            it('make importMap available to other webpack plugins', function (done) {
                webpackCompile({
                    context: __dirname,
                    entry: './fixtures/file.js'
                }, {}, function (importMap, stats) {
                    expect(importMap).to.eql({
                        'main.js': 'main.js'
                    });

                    expect(JSON.parse(stats.compilation.assets['importMap.json'].source())).to.eql({
                        'main.js': 'main.js'
                    });

                    done();
                });
            });
        }

        it('should output unix paths', function (done) {
            webpackCompile({
                context: __dirname,
                entry: {
                    'dir\\main': './fixtures/file.js',
                    'some\\dir\\main': './fixtures/file.js'
                }
            }, {}, function (importMap) {
                expect(importMap).to.exist;
                expect(importMap).to.eql({
                    'dir/main.js': 'dir/main.js',
                    'some/dir/main.js': 'some/dir/main.js'
                });

                done();
            });
        });
    });

    // Skip ExtractTextPlugin checks until it supports Webpack 5
    if (!isWebpackVersionGte(5)) {
        describe('with ExtractTextPlugin', function () {
            it('works when extracting css into a seperate file', function (done) {
                webpackCompile({
                    context: __dirname,
                    entry: {
                        wStyles: [
                            './fixtures/file.js',
                            './fixtures/style.css'
                        ]
                    },
                    output: {
                        filename: '[name].js'
                    },
                    module: isWebpackVersionGte(4) ? {
                        rules: [{
                            test: /\.css$/,
                            use: ExtractTextPlugin.extract({
                                fallback: 'style-loader',
                                use: 'css-loader'
                            })
                        }]
                    } : {
                        loaders: [{
                            test: /\.css$/,
                            loader: ExtractTextPlugin.extract({
                                fallback: 'style-loader',
                                use: 'css-loader'
                            })
                        }]
                    },
                    plugins: [
                        new ImportMapPlugin(),
                        new ExtractTextPlugin({
                            filename: '[name].css',
                            allChunks: true
                        })
                    ]
                }, {}, function (importMap, stats) {
                    expect(importMap).to.eql({
                        'wStyles.js': 'wStyles.js',
                        'wStyles.css': 'wStyles.css'
                    });

                    done();
                });
            });
        });
    }

    describe('nameless chunks', function () {
        it('add a literal mapping of files generated by nameless chunks.', function (done) {
            webpackCompile({
                context: __dirname,
                entry: {
                    nameless: './fixtures/nameless.js'
                },
                output: {
                    filename: '[name].[hash].js'
                }
            }, {}, function (importMap, stats) {
                expect(Object.keys(importMap).length).to.eql(2);
                expect(importMap['nameless.js']).to.eql('nameless.' + stats.hash + '.js');

                done();
            });
        });
    });

    describe('set location of importMap', function () {
        describe('using relative path', function () {
            it('should use output to the correct location', function (done) {
                webpackCompile({
                    context: __dirname,
                    entry: './fixtures/file.js'
                }, {
                    manifestOptions: {
                        fileName: 'webpack.importMap.js'
                    }
                }, function (importMap, stats, fs) {
                    const OUTPUT_DIR = path.join(__dirname, './webpack-out');
                    const importMapPath = path.join(OUTPUT_DIR, 'webpack.importMap.js');

                    const result = JSON.parse(fs.readFileSync(importMapPath).toString());

                    expect(result).to.eql({
                        'main.js': 'main.js'
                    });

                    done();
                });
            });
        });

        describe('using absolute path', function () {
            it('should use output to the correct location', function (done) {
                webpackCompile({
                    context: __dirname,
                    entry: './fixtures/file.js'
                }, {
                    manifestOptions: {
                        fileName: path.join(__dirname, 'webpack.importMap.js')
                    }
                }, function (importMap, stats, fs) {
                    const importMapPath = path.join(__dirname, 'webpack.importMap.js');

                    const result = JSON.parse(fs.readFileSync(importMapPath).toString());

                    expect(result).to.eql({
                        'main.js': 'main.js'
                    });

                    done();
                });
            });
        });
    });

    describe('filter', function () {
        it('should filter out non-initial chunks', function (done) {
            webpackCompile({
                context: __dirname,
                entry: {
                    nameless: './fixtures/nameless.js'
                },
                output: {
                    filename: '[name].[hash].js'
                }
            }, {
                manifestOptions: {
                    filter: function (file) {
                        return file.isInitial;
                    }
                }
            }, function (importMap, stats) {
                expect(Object.keys(importMap).length).to.eql(1);
                expect(importMap['nameless.js']).to.eql('nameless.' + stats.hash + '.js');

                done();
            });
        });
    });

    describe('map', function () {
        it('should allow modifying files defails', function (done) {
            webpackCompile({
                context: __dirname,
                entry: './fixtures/file.js',
                output: {
                    filename: '[name].js'
                }
            }, {
                manifestOptions: {
                    map: function (file, i) {
                        file.name = i.toString();
                        return file;
                    }
                }
            }, function (importMap, stats) {
                expect(importMap).to.eql({
                    0: 'main.js'
                });

                done();
            });
        });

        it('should add subfolders', function (done) {
            webpackCompile({
                context: __dirname,
                entry: './fixtures/file.js',
                output: {
                    filename: 'javascripts/main.js'
                }
            }, {
                manifestOptions: {
                    map: function (file) {
                        file.name = path.join(path.dirname(file.path), file.name);
                        return file;
                    }
                }
            }, function (importMap) {
                expect(importMap).to.eql({
                    'javascripts/main.js': 'javascripts/main.js'
                });

                done();
            });
        });
    });

    describe('sort', function () {
        it('should allow ordering of output', function (done) {
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
                manifestOptions: {
                    sort: function (a, b) {
                        console.log(a);
                        // make sure one is the latest
                        return a.name === 'one.js' ? 1 : -1;
                    }
                }
            }, function (importMap, stats) {
                expect(importMap).to.eql(['two.js', 'one.js']);

                done();
            });
        });
    });

    describe('generate', function () {
        it('should generate custom importMap', function (done) {
            webpackCompile({
                context: __dirname,
                entry: './fixtures/file.js',
                output: {
                    filename: '[name].js'
                }
            }, {
                manifestOptions: {
                    generate: function (seed, files) {
                        return files.reduce(function (importMap, file) {
                            importMap[file.name] = {
                                file: file.path,
                                hash: file.chunk.hash
                            };
                            return importMap;
                        }, seed);
                    }
                }
            }, function (importMap, stats) {
                expect(importMap).to.eql({
                    'main.js': {
                        file: 'main.js',
                        hash: Array.from(stats.compilation.chunks)[0].hash
                    }
                });

                done();
            });
        });

        it('should default to `seed`', function (done) {
            webpackCompile({
                context: __dirname,
                entry: './fixtures/file.js',
                output: {
                    filename: '[name].js'
                }
            }, {
                manifestOptions: {
                    seed: {
                        key: 'value'
                    },
                    generate: function (seed) {
                        expect(seed).to.eql({
                            key: 'value'
                        });
                        return seed;
                    }
                }
            }, function (importMap, stats) {
                expect(importMap).to.eql({
                    key: 'value'
                });

                done();
            });
        });

        it('should output an array', function (done) {
            webpackCompile({
                context: __dirname,
                entry: './fixtures/file.js',
                output: {
                    filename: '[name].js'
                }
            }, {
                manifestOptions: {
                    seed: [],
                    generate: function (seed, files) {
                        return seed.concat(files.map(function (file) {
                            return {
                                name: file.name,
                                file: file.path
                            };
                        }));
                    }
                }
            }, function (importMap, stats) {
                expect(importMap).to.eql([{
                    name: 'main.js',
                    file: 'main.js'
                }]);

                done();
            });
        });
    });

    it('should generate importMap with "entrypoints" key', done => {
        webpackCompile({
            context: __dirname,
            entry: {
                one: './fixtures/file.js',
                two: './fixtures/file-two.js'
            }
        }, {
            manifestOptions: {
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
            expect(importMap).to.eql({
                entrypoints: {
                    one: ['one.js'],
                    two: ['two.js']
                },
                files: {
                    'one.js': 'one.js',
                    'two.js': 'two.js'
                }
            });

            done();
        });
    });

    describe('with CopyWebpackPlugin', function () {
        it('works when including copied assets', function (done) {
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
                expect(importMap).to.eql({
                    imports: {
                        'one.js': 'one.js',
                        'third.party.js': 'third.party.js'
                    }
                });

                done();
            });
        });

        it('doesn\'t add duplicates when prefixes definitions with a base path', function (done) {
            webpackCompile({
                context: __dirname,
                entry: {
                    one: './fixtures/file.js'
                },
                output: {
                    filename: '[name].[hash].js',
                    publicPath: '/app/'
                },
                plugins: [
                    new FakeCopyWebpackPlugin(),
                    new ImportMapPlugin({
                        basePath: '/app/'
                    })
                ]
            }, {}, function (importMap, stats) {
                expect(importMap).to.eql({
                    imports: {
                        '/app/one.js': '/app/one.' + stats.hash + '.js',
                        '/app/third.party.js': '/app/third.party.js'
                    }
                });

                done();
            });
        });

        it('doesn\'t add duplicates when used with hashes in the filename', function (done) {
            webpackCompile({
                context: __dirname,
                entry: {
                    one: './fixtures/file.js'
                },
                output: {
                    filename: '[name].[hash].js'
                },
                plugins: [
                    new FakeCopyWebpackPlugin(),
                    new ImportMapPlugin()
                ]
            }, {}, function (importMap, stats) {
                expect(importMap).to.eql({
                    imports: {
                        'one.js': 'one.' + stats.hash + '.js',
                        'third.party.js': 'third.party.js'
                    }
                });

                done();
            });
        });

        it('supports custom serializer using serialize option', function (done) {
            webpackCompile({
                context: __dirname,
                entry: './fixtures/file.js'
            }, {
                manifestOptions: {
                    fileName: 'webpack.importMap.yml',
                    serialize: function (importMap) {
                        let output = '';
                        for (const key in importMap) {
                            output += '- ' + key + ': "' + importMap[key] + '"\n';
                        }
                        return output;
                    }
                }
            }, function (importMap, stats, fs) {
                const OUTPUT_DIR = path.join(__dirname, './webpack-out');
                const importMapPath = path.join(OUTPUT_DIR, 'webpack.importMap.yml');

                const result = fs.readFileSync(importMapPath).toString();

                expect(result).to.eql('- main.js: "main.js"\n');

                done();
            });
        });
    });
});
