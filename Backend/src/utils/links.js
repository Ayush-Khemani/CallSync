const crypto = require('crypto');

function createMeetingLinkToken() {
  return crypto.randomBytes(18).toString('base64url');
}

module.exports = { createMeetingLinkToken };
