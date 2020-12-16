'use strict';

const path = require('path');
const MemoryFileSystem = require('memory-fs');
const webpack = require('webpack');
const _ = require('lodash');
const axios = require('axios');
const FakeCopyWebpackPlugin = require('./helpers/copy-plugin-mock');
const { ImportMapPlugin } = require('../index.js');
const { isWebpackVersionGte } = require('./helpers/webpack-version-helpers');

jest.mock('axios');
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

describe('ImportMapPlugin', () => {
    it('exists', () => {
        expect(ImportMapPlugin).toBeDefined();
    });
    describe.skip('baseImportMap', () => {
        it('should retrieve the remote import map and merge with emitted', done => {
            const response = {
                data: {
                    imports: {
                        'base.js': 'http://remote.cdn.com/files.js'
                    }
                }
            };
            axios.get.mockResolvedValue(response);
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
                    // todo actually mock this
                    baseImportMap: 'http://mock.com/import-map.json'
                }
            }, function (importMap, stats) {
                expect(importMap).toEqual({
                    imports: {
                        'base.js': 'http://remote.cdn.com/files.js',
                        'one.js': 'one.js',
                        'two.js': 'two.js'
                    }
                });

                done();
            });
        });
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
                    filename: '[name].[hash].js'
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
                devtool: 'sourcemap',
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

        it('prefixes definitions with publicPath', done => {
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
                    publicPath: '/app/'
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

        describe('mapKeys', () => {
            it('applies the mapKeys on all the key values', done => {
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
                        mapKeys: x => `zzz/${x}`
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
                        filename: '[name].[hash].js',
                        publicPath: '/not-foo/'
                    }
                }, {
                    importMapOptions: {
                        publicPath: '/foo/'
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

        it('should keep full urls provided by plugin publicPath', done => {
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
                    publicPath: 'https://www/example.com/'
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

        it('should keep full urls provided by output publicPath', done => {
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

        it('does not prefix seed attributes with publicPath', done => {
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
                    publicPath: '/app/',
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
                        filename: '[name].[hash].js'
                    }
                }, {}, function (importMap, stats) {
                    expect(Object.keys(importMap.imports)).toHaveLength(2);
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
        it('emit errors with unsupported', () => {
            expect(() => {
                const plugin = new ImportMapPlugin({
                    include: () => true
                });
                plugin.apply();
            }).toThrow();
        });
        it('emit errors with unsupported in array', () => {
            expect(() => {
                const plugin = new ImportMapPlugin({
                    include: ['xxx.js', false]
                });
                plugin.apply();
            }).toThrow();
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
        it('emit errors with unsupported', () => {
            expect(() => {
                const plugin = new ImportMapPlugin({
                    exclude: () => true
                });
                plugin.apply();
            }).toThrow();
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
                expect(stats.toJson().errors[0]).toMatch('[webpack-import-map-plugin]');

                done();
            }, true);
        });
    });
    describe('mapValues', () => {
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
                    mapValues: (path) => {
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
    describe('publicPath', () => {
        it('prepend the publicPath on all values', done => {
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
                    publicPath: 'https://my-cdn.com/'
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
                        filename: '[name].[hash].js',
                        publicPath: '/app/'
                    },
                    plugins: [
                        new FakeCopyWebpackPlugin(),
                        new ImportMapPlugin({
                            publicPath: '/app/'
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
                        filename: '[name].[hash].js'
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
