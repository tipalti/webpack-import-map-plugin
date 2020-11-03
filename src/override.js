
const _ = require('lodash');
const axios = require('axios');
const validUrl = require('valid-url');

async function overrideBaseImportMap (url, importMap) {
    if (!validUrl.isUri(url)) {
        throw new Error('todo');
    }
    const response = await axios.get(url);
    const baseImportMap = response.data;
    // todo check if valid import map

    return _.merge({}, baseImportMap, importMap);
}

module.exports = {
    overrideBaseImportMap
};
