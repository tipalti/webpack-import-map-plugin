
<!-- PROJECT SHIELDS -->
<!--
*** I'm using markdown "reference style" links for readability.
*** Reference links are enclosed in brackets [ ] instead of parentheses ( ).
*** See the bottom of this document for the declaration of the reference variables
*** for contributors-url, forks-url, etc. This is an optional, concise syntax you may use.
*** https://www.markdownguide.org/basic-syntax/#reference-style-links
-->
[![Contributors][contributors-shield]][contributors-url]
[![Contributions Welcome](https://img.shields.io/badge/contributions-welcome-brightgreen.svg?style=flat-square)](https://github.com/zleight1/webpack-import-map-plugin/issues)
[![Forks][forks-shield]][forks-url]
[![Stargazers][stars-shield]][stars-url]
[![Issues][issues-shield]][issues-url]
[![HitCount](http://hits.dwyl.com/zleight/webpack-import-map-plugin.svg)](http://hits.dwyl.com/zleight/webpack-import-map-plugin)
[![Known Vulnerabilities](https://snyk.io/test/github/dwyl/hapi-auth-jwt2/badge.svg?targetFile=package.json&style=flat-square)](https://snyk.io/test/github/dwyl/hapi-auth-jwt2?targetFile=package.json)
[![Codecov](https://img.shields.io/codecov/c/github/zleight1/webpack-import-map-plugin/master?style=flat-square)](https://codecov.io/gh/zleight1/webpack-import-map-plugin)
[![CircleCI](https://img.shields.io/circleci/build/github/zleight1/webpack-import-map-plugin/master?style=flat-square)](https://app.circleci.com/pipelines/github/zleight1/webpack-import-map-plugin?branch=master)


  
[![https://nodei.co/npm/webpack-import-map-plugin.png?downloads=true&downloadRank=true&stars=true](https://nodei.co/npm/webpack-import-map-plugin.png?downloads=true&downloadRank=true&stars=true)](https://www.npmjs.com/package/webpack-import-map-plugin)


<!-- PROJECT LOGO -->
<br />
<p align="center">

  <h3 align="center">Webpack Import-Map Plugin</h3>

  <p align="center">
    A plugin for Webpack to generate an import-map for bundled & emitted files. Heavily based on <a href="https://github.com/danethurber/webpack-manifest-plugin" target="_blank">webpack-manifest-plugin</a>.
    <br />
    <em>Currently only generates top-level maps, scoped maps are not supported yet.</em>
    <br />
    <a href="https://github.com/zleight1/webpack-import-map-plugin#Usage"><strong>Explore the docs »</strong></a>
    <br />
    <br />
    <a href="https://github.com/zleight1/webpack-import-map-plugin#Demo">View Demo</a>
    ·
    <a href="https://github.com/zleight1/webpack-import-map-plugin/issues">Report Bug</a>
    ·
    <a href="https://github.com/zleight1/webpack-import-map-plugin/issues">Request Feature</a>
  </p>
</p>



<!-- TABLE OF CONTENTS -->
## Table of Contents

* [About the Project](#about-the-project)
  * [Built With](#built-with)
* [Getting Started](#getting-started)
  * [Prerequisites](#prerequisites)
  * [Installation](#installation)
* [Usage](#usage)
* [Roadmap](#roadmap)
* [Contributing](#contributing)
* [License](#license)
* [Contact](#contact)
* [Acknowledgements](#acknowledgements)



<!-- ABOUT THE PROJECT -->
## About The Project

This plugin allows you to use filename hashing, etc. and automatically generate an import-map to use standalone, or as a patch file for something like import-map-deployer.

Two main use cases are generating an import-map that allows for using hashes in filenames, to make cache-busting easy, or to generate a delta/patch file to use in a deployment pipeline.


### Built With

* JavaScript
* Lots of coffee



<!-- GETTING STARTED -->
## Getting Started

To get a local copy up and running follow these simple steps.

### Prerequisites

* Node >= 10.x
* Webpack >= 2.x
* Some knowledge of [import-maps](https://github.com/WICG/import-maps)

### Installation
 
1. Add the devDependency to your project
```sh
npm i -D webpack-import-map-plugin
```
2. Add the plugin in your webpack config's plugins and configure it
```js
// webpack.config.js
const ImportMapWebpackPlugin = require('webpack-import-map-plugin');
```
### Demo
```js
// with a Webpack 4 config like:
config.entry = { entryName: 'entry-file.js' };
config.output.filename = '[name].[contenthash:8].js';

// Add to plugins
new ImportMapWebpackPlugin({
    filter: x => {
        return ['entryName.js'].includes(x.name);
    },
    transformKeys: filename => {
        if (filename === 'entryName.js') {
            return '@my-super-scope/out-file';
        }
    },
    fileName: 'import-map.json',
    baseUrl: 'https://super-cdn.com/'
});
// output import-map.json
{
    "imports": {
        "@my-super-scope": "https://super-cdn.com/entryName.12345678.js"
    }
}
```



<!-- USAGE EXAMPLES -->
## Usage

### Configuration Options
The configuration object is _very_ similar to webpack-manifest-plugin but not exactly the same. Some sensible defaults are set for most options, though YMMMV.
#### include
A filter, or array of filters to run on the entry filenames that should be included in the resulting import-map. Strings will match exactly, run in order provided. A falsy value will include all files. **Note: Run *before* exclude.**
* type: `RegExp | string`
* default: `''`
#### exclude
A filter, or array of filters to run on the entry filenames that should be excluded in the resulting import-map. Strings will match exactly, run in order provided. A falsy value will not exclude any files. **Note: Run *after* include.**
* type: `RegExp | string`
* default: `''`
#### filter
A more complex filter function that receives the whole file object from webpack and returns a falsy value to exclude the file from the resulting import map. **Note: Run *after* include and exclude.**
* type: `Function(FileDescriptor): boolean`
* default: `null`
#### transformKeys
A function run on the filename after the filters that allow you to generate a "key" for your import-map. You can strip key extensions, or rewrite with this function.**You probably want to implement this option.**
* type: `Function(string): string`
* default: `null`
#### transformValues
A function run on the **emitted** asset file path (i.e. /dist/main.hash.js). You could use this function to rewrite prefixed paths, etc.
* type: `Function(string): string`
* default: `null`
#### baseUrl
A string url to to prefix the values with. A good usage would be prepending a cdn address or placeholder to rewrite in a pipeline process. **Note: Run *after* transformValues.**
* type: `string`
* default: `null`
#### fileName
The output filename, emitted to the output directory.
* type: `string`
* default: `'import-map.json'`
#### writeToFileEmit
If set to true will emit to build folder and memory in combination with webpack-dev-server.
* type: `boolean`
* default: `false`
#### generate
The function that generates the resulting import-map. This is where you could implement scopes, etc.
* type: `Function(Object, FileDescriptor, string[]): Object`
* default: 
```js
(seed, files, entrypoints) => files.reduce(function (manifest, file) {
    manifest[file.name] = file.path;
    return manifest;
}, seed);
```
#### seed
A cache of key/value pairs to used to seed the import-map. A good use for this would be including libraries/runtimes, or a base import-map for webpack-dev-server debugging.
* type: `Object`
* default: `{}`
#### map
Modify files details before the manifest is created.
* type: `Function(FileDescriptor): FileDescriptor`
* default: `null`
#### sort
Sort files before they are passed to generate.
* type: `Function(FileDescriptor): number`
* default: `null`
#### serialize
The serializing function for the result import-map. Unless you are doing something unique, it's best to leave this as is.
* type: `Function(Object): string`
* default: 
```js 
function (manifest) {
    return JSON.stringify(manifest, null, 4);
}
```
### Type: FileDescriptor
[FileDescriptor](https://github.com/danethurber/webpack-manifest-plugin#filedescriptor)
<!-- ROADMAP -->
## Roadmap

See the [open issues](https://github.com/zleight1/webpack-import-map-plugin/issues) for a list of proposed features (and known issues).



<!-- CONTRIBUTING -->
## Contributing

Contributions are what make the open source community such an amazing place to be learn, inspire, and create. Any contributions you make are **greatly appreciated**.

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

Please make sure any contributions have proper unit tests and update any relevant documentation.


<!-- LICENSE -->
## License

Distributed under the MIT License. See `LICENSE` for more information.



<!-- CONTACT -->
## Contact

Zachary Leighton - zleight1@gmail.com

Project Link: [https://github.com/zleight1/webpack-import-map-plugin](https://github.com/zleight1/webpack-import-map-plugin)



<!-- ACKNOWLEDGEMENTS -->
## Acknowledgements

* Heavily based on [webpack-manifest-plugin](https://github.com/danethurber/webpack-manifest-plugin)
* Many thanks to [single-spa](https://single-spa.js.org/) for a great front-end microservices "meta-framework".
* [import-maps](https://github.com/WICG/import-maps)





<!-- MARKDOWN LINKS & IMAGES -->
<!-- https://www.markdownguide.org/basic-syntax/#reference-style-links -->
[contributors-shield]: https://img.shields.io/github/contributors/zleight1/webpack-import-map-plugin.svg?style=flat-square
[contributors-url]: https://github.com/zleight1/webpack-import-map-plugin/graphs/contributors
[forks-shield]: https://img.shields.io/github/forks/zleight1/webpack-import-map-plugin.svg?style=flat-square
[forks-url]: https://github.com/zleight1/webpack-import-map-plugin/network/members
[stars-shield]: https://img.shields.io/github/stars/zleight1/webpack-import-map-plugin.svg?style=flat-square
[stars-url]: https://github.com/zleight1/webpack-import-map-plugin/stargazers
[issues-shield]: https://img.shields.io/github/issues/zleight1/webpack-import-map-plugin.svg?style=flat-square
[issues-url]: https://github.com/zleight1/webpack-import-map-plugin/issues
[license-shield]: https://img.shields.io/github/license/zleight1/webpack-import-map-plugin.svg?style=flat-square
[license-url]: https://github.com/zleight1/webpack-import-map-plugin/blob/master/LICENSE.txt