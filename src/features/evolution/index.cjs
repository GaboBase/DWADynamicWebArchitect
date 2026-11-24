'use strict';

const { syncArchitecture } = require('./syncer.cjs');
const { planMigration } = require('./migrator.cjs');

module.exports = {
  syncArchitecture,
  planMigration
};
