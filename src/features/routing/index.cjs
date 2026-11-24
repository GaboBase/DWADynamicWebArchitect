'use strict';

const { placeFile } = require('./file-placer.cjs');
const { promoteFile, determinePromotionDestination } = require('./promoter.cjs');

module.exports = {
  placeFile,
  promoteFile,
  determinePromotionDestination
};
