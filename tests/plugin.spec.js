'use strict';

const path = require('path');
const sinon = require('sinon');
const expect = require('chai').expect;
const MemoryFileSystem = require('memory-fs');
const webpack = require('webpack');
const _ = require('lodash');
const FakeCopyWebpackPlugin = require('./helpers/copy-plugin-mock');
const ImportMapPlugin = require('../index.js');
const { isWebpackVersionGte } = require('./helpers/webpack-version-helpers');

const OUTPUT_DIR = __dirname;
const importMapPath = path.join(OUTPUT_DIR, 'import-map.json');

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
            console.log(e);
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
                importMapOptions: {
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
                    importMapOptions: {
                        transformKeys: x => `zzz/${x}`
                    }
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
                        publicPath: '/not-foo/'
                    }
                }, {
                    importMapOptions: {
                        baseUrl: '/foo/'
                    }
                }, function (importMap, stats) {
                    expect(importMap).to.eql({
                        imports: {
                            'one.js': '/foo/one.' + stats.hash + '.js'
                        }
                    });

                    done();
                });
            });
        });

        it('should keep full urls provided by baseUrl', function (done) {
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
                expect(importMap).to.eql({
                    imports: {
                        'one.js': 'https://www/example.com/one.js'
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
                importMapOptions: {
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

        it('does not prefix seed attributes with baseUrl', function (done) {
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
                importMapOptions: {
                    baseUrl: '/app/',
                    seed: {
                        test1: 'test2'
                    }
                }
            }, function (importMap, stats) {
                expect(importMap).to.eql({
                    imports: {
                        'one.js': '/app/one.' + stats.hash + '.js',
                        test1: 'test2'
                    }
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
                importMapOptions: {
                    seed: {}
                }
            }, function (importMap) {
                expect(importMap).to.eql({
                    imports: {
                        'one.js': 'one.js',
                        'two.js': 'two.js'
                    }
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
                    imports: {
                        'main.js': 'main.js',
                        'file.txt': 'file.txt'
                    }
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
            it('make importMap available to other webpack plugins', function (done) {
                webpackCompile({
                    context: __dirname,
                    entry: './fixtures/file.js'
                }, {}, function (importMap, stats) {
                    expect(importMap).to.eql({
                        imports: {
                            'main.js': 'main.js'
                        }
                    });

                    expect(JSON.parse(stats.compilation.assets['import-map.json'].source())).to.eql({
                        imports: {
                            'main.js': 'main.js'
                        }
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
                    imports: {
                        'dir/main.js': 'dir/main.js',
                        'some/dir/main.js': 'some/dir/main.js'
                    }
                });

                done();
            });
        });
    });

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
                expect(Object.keys(importMap.imports).length).to.eql(2);
                expect(importMap.imports['nameless.js']).to.eql('nameless.' + stats.hash + '.js');

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
                    importMapOptions: {
                        fileName: 'my-import-map.json'
                    }
                }, function (importMap, stats, fs) {
                    const importMapPath = path.join(OUTPUT_DIR, 'my-import-map.json');

                    const result = JSON.parse(fs.readFileSync(importMapPath).toString());

                    expect(result).to.eql({
                        imports: {
                            'main.js': 'main.js'
                        }
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
                    importMapOptions: {
                        fileName: path.join(__dirname, 'my-import-map.json')
                    }
                }, function (importMap, stats, fs) {
                    const importMapPath = path.join(__dirname, 'my-import-map.json');

                    const result = JSON.parse(fs.readFileSync(importMapPath).toString());

                    expect(result).to.eql({
                        imports: {
                            'main.js': 'main.js'
                        }
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
                importMapOptions: {
                    filter: function (file) {
                        return file.isInitial;
                    }
                }
            }, function (importMap, stats) {
                expect(Object.keys(importMap.imports).length).to.eql(1);
                expect(importMap.imports['nameless.js']).to.eql('nameless.' + stats.hash + '.js');

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
                importMapOptions: {
                    map: function (file, i) {
                        file.name = i.toString();
                        return file;
                    }
                }
            }, function (importMap, stats) {
                expect(importMap).to.eql({
                    imports: {
                        0: 'main.js'
                    }
                });

                done();
            });
        });

        it('should allow file name changes', function (done) {
            webpackCompile({
                context: __dirname,
                entry: './fixtures/file.js',
                output: {
                    filename: 'javascripts/main.js'
                }
            }, {
                importMapOptions: {
                    map: function (file) {
                        file.name = path.join('foo/', file.name);
                        return file;
                    }
                }
            }, function (importMap) {
                expect(importMap).to.eql({
                    imports: {
                        'foo/main.js': 'javascripts/main.js'
                    }
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
                importMapOptions: {
                    sort: function (a, b) {
                        // make sure one is the latest
                        return a.name === 'one.js' ? 1 : -1;
                    }
                }
            }, function (importMap, stats) {
                expect(Object.keys(importMap.imports)).to.eql(['two.js', 'one.js']);

                done();
            });
        });
    });

    describe('generate', function () {
        it('should default to `seed`', function (done) {
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
                        expect(seed).to.eql({
                            key: 'value'
                        });
                        return seed;
                    }
                }
            }, function (importMap, stats) {
                expect(importMap).to.eql({
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
                expect(importMap).to.eql({
                    imports: {
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
                            baseUrl: '/app/'
                        })
                    ]
                }, {}, function (importMap, stats) {
                    expect(importMap).to.eql({
                        imports: {
                            'one.js': '/app/one.' + stats.hash + '.js',
                            'third.party.js': '/app/third.party.js'
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
        });
    });
});
