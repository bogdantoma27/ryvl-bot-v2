// Exercise the real compiled bootstrap without starting Discord, PostgreSQL or a socket.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
async function originPolicy(frontendUrl) {
  let cors;
  const errors = [];
  const app = { get: () => ({ frontendUrl, port: 3000 }), enableCors: value => { cors = value; }, useGlobalPipes() {}, async listen() {} };
  const noop = class { log() {} error(e) { errors.push(e); } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../dist/main.js'), 'utf8'), {
    exports: {}, URL,
    process: { env: {}, exit: code => { errors.push(`exit ${code}`); } },
    require(name) {
      if (name === '@nestjs/core') return { NestFactory: { create: async () => app } };
      if (name === '@nestjs/common') return { Logger: noop, ValidationPipe: noop };
      if (name === './app.module') return { AppModule: class {} };
      if (name === './config/config.service') return { ConfigService: class {} };
      throw Error(`Unexpected bootstrap dependency: ${name}`);
    },
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(errors.length, 0, String(errors[0] || ''));
  assert.ok(cors, 'bootstrap must configure CORS');
  return origin => new Promise((resolve, reject) => cors.origin(origin, (error, allowed) => error ? reject(error) : resolve(allowed)));
}
for (const origin of ['http://130.61.228.100', 'http://localhost:4200', 'https://ryvl.top.evil.example', 'https://unrelated.example', 'null']) {
  test(`production CORS does not allow ${origin}`, async () => {
    const allow = await originPolicy('https://ryvl.top');
    assert.equal(await allow(origin), false);
  });
}
test('canonical HTTPS origin and requests without Origin remain usable', async () => {
  const allow = await originPolicy('https://ryvl.top/');
  assert.equal(await allow('https://ryvl.top'), true);
  assert.equal(await allow(undefined), true);
});
test('local development works when FRONTEND_URL explicitly names localhost', async () => {
  const allow = await originPolicy('http://localhost:4201');
  assert.equal(await allow('http://localhost:4201'), true);
  assert.equal(await allow('https://unrelated.example'), false);
});
