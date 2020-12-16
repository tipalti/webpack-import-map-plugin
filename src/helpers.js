'use strict';

const generateManifest = (files) => {
    let result;
    result = files.reduce(
        (manifest, file) => Object.assign(manifest, { [file.name]: file.path }),
        {}
    );

    result = {
        imports: { ...result }
    };

    return result;
};

const getFileType = (fileName, { transformExtensions }) => {
    const replaced = fileName.replace(/\?.*/, '');
    const split = replaced.split('.');
    const extension = split.pop();
    return transformExtensions.test(extension) ? `${split.pop()}.${extension}` : extension;
};

const reduceAssets = (files, asset, moduleAssets) => {
    const name = moduleAssets[asset.name] ? moduleAssets[asset.name] : asset.info.sourceFilename;
    if (name) {
        return files.concat({
            path: asset.name,
            name,
            isInitial: false,
            isChunk: false,
            isAsset: true,
            isModuleAsset: true
        });
    }

    const isEntryAsset = asset.chunks && asset.chunks.length > 0;
    if (isEntryAsset) {
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
};

const reduceChunk = (files, chunk, options) =>
    Array.of(...Array.from(chunk.files), ...Array.from(chunk.auxiliaryFiles || [])).reduce(
        (prev, path) => {
            let name = chunk.name ? chunk.name : null;
            // chunk name, or for nameless chunks, just map the files directly.
            name = name
                ? options.useEntryKeys && !path.endsWith('.map')
                    ? name
                    : `${name}.${getFileType(path, options)}`
                : path;

            return prev.concat({
                path,
                chunk,
                name,
                isInitial: chunk.isOnlyInitial(),
                isChunk: true,
                isAsset: false,
                isModuleAsset: false
            });
        },
        files
    );

function validURL (str) {
    const pattern = new RegExp('^(https?:\\/\\/)' + // protocol
              '((([a-z\\d]([a-z\\d-]*[a-z\\d])*)\\.)+[a-z]{2,}|' + // domain name
              '((\\d{1,3}\\.){3}\\d{1,3}))' + // OR ip (v4) address
              '(\\:\\d+)?(\\/[-a-z\\d%_.~+]*)*' + // port and path
              '(\\?[;&a-z\\d%_.~+=-]*)?' + // query string
              '(\\#[-a-z\\d_]*)?$', 'i'); // fragment locator
    return !!pattern.test(str);
}

const standardizeFilePaths = (file) => {
    file.name = file.name.replace(/\\/g, '/');
    file.path = file.path.replace(/\\/g, '/');
    return file;
};

module.exports = { generateManifest, reduceAssets, reduceChunk, validURL, standardizeFilePaths };
