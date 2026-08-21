const config = require('../config/env');

function isAllowedCorsOrigin(origin, options = {}) {
  if (!origin) return true;

  const frontendUrls = options.frontendUrls || config.frontendUrls;
  const frontendOriginRegex = options.frontendOriginRegex ?? config.frontendOriginRegex;
  const normalizedOrigin = origin.replace(/\/$/, '');

  if (frontendUrls.includes(normalizedOrigin)) {
    return true;
  }

  if (frontendOriginRegex) {
    return new RegExp(frontendOriginRegex).test(origin);
  }

  return false;
}

module.exports = { isAllowedCorsOrigin };
