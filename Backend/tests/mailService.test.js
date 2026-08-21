const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';

const {
  googleMailScopeEnabled,
  outlookMailScopeEnabled,
  GOOGLE_GMAIL_SEND_SCOPE,
  OUTLOOK_MAIL_SEND_SCOPE,
  _test,
} = require('../src/services/mailService');

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

test('Gmail follow-up MIME is base64url encoded and strips header injection', () => {
  const raw = _test.buildGmailRaw({
    to: 'guest@example.com\r\nBcc: attacker@example.com',
    subject: 'Follow up\r\nBcc: attacker@example.com',
    text: 'Hi there,\n\nHere is the booking link.',
  });
  const decoded = Buffer.from(raw, 'base64url').toString('utf8');

  assert.match(decoded, /^To: guest@example\.com Bcc: attacker@example\.com/m);
  assert.equal(decoded.includes('\r\nBcc: attacker@example.com\r\n'), false);
  assert.match(decoded, /Content-Type: text\/plain; charset="UTF-8"/);
  assert.match(decoded, /Here is the booking link\./);
});

test('mail scope helpers only accept send-capable delegated scopes', () => {
  assert.equal(googleMailScopeEnabled([GOOGLE_GMAIL_SEND_SCOPE]), true);
  assert.equal(googleMailScopeEnabled(['https://www.googleapis.com/auth/calendar']), false);
  assert.equal(outlookMailScopeEnabled([OUTLOOK_MAIL_SEND_SCOPE]), true);
  assert.equal(outlookMailScopeEnabled(['Calendars.ReadWrite']), false);
});

test('mail body and subject sanitizers keep bounded editable content', () => {
  assert.equal(_test.cleanHeader('  Hello\nWorld  '), 'Hello World');
  assert.equal(_test.cleanBody('  First\r\nSecond  '), 'First\nSecond');
  assert.match(_test.encodeSubject('Follow-up ✓'), /^=\?UTF-8\?B\?.+\?=$/);
});

(async () => {
  for (const { name, fn } of tests) {
    await fn();
    console.log(`ok - ${name}`);
  }
  console.log(`${tests.length} mail service tests passed`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
