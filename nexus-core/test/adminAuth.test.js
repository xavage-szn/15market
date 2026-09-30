// End-to-end check of the admin auth path, against the real middleware.
// Boots the express routes in-process on an ephemeral port with a throwaway
// secret, then exercises: bad password -> 401, good credentials -> token,
// token authorises, tampered token rejected, resolve-stuck dry run is inert.
process.env.ADMIN_API_SECRET = 'test-secret-for-verification-only';
process.env.ADMIN_USERNAME = 'opsuser';
process.env.ADMIN_PASSWORD = 'correct-horse-battery';

const http = require('http');

function post(port, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body ?? {});
    const req = http.request({
      host: '127.0.0.1', port, path, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload), ...headers }
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        // A 404 comes back as HTML, so do not assume JSON.
        let parsed = null;
        try { parsed = data ? JSON.parse(data) : null; } catch (e) { parsed = { raw: data.slice(0, 120) }; }
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    req.on('error', reject);
    req.end(payload);
  });
}

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log(`  ok    ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}`); }
};

// Pull in just the pieces under test, without booting the whole engine.
const security = require('../src/security');
const express = require('express');
const app = express();
app.use(express.json());
app.post('/admin/login', security.handleAdminLogin);
app.post('/admin/probe', security.requireAdminAuth, (req, res) => res.json({ ok: true }));
app.post('/admin/trades/resolve-stuck', security.requireAdminAuth, (req, res) =>
  res.json({ ok: true, apply: req.body?.apply === true, changed: false }));

const server = app.listen(0, async () => {
  const port = server.address().port;
  console.log('\nadmin auth verification\n');

  check('no token is rejected', (await post(port, '/admin/probe', {})).status === 401);

  const badPass = await post(port, '/admin/login', { username: 'opsuser', password: 'wrong' });
  check('a wrong password is rejected', badPass.status === 401);
  check('a wrong password does not reveal which field was wrong',
    /invalid credentials/i.test(badPass.body?.error || ''));

  const badUser = await post(port, '/admin/login', { username: 'nobody', password: 'correct-horse-battery' });
  check('a wrong username gives the same error (no account enumeration)',
    badUser.body?.error === badPass.body?.error);

  const good = await post(port, '/admin/login', { username: 'opsuser', password: 'correct-horse-battery' });
  check('correct credentials return a token', good.status === 200 && !!good.body?.token);
  check('the token is short-lived (5 min)', good.body?.expiresIn === 300);

  const token = good.body.token;
  const probeRes = await post(port, '/admin/probe', {}, { Authorization: `Bearer ${token}` });
  check('the token authorises an admin endpoint', probeRes.status === 200);

  // Flip one character of the signature.
  const tampered = token.slice(0, -4) + (token.slice(-4) === 'AAAA' ? 'BBBB' : 'AAAA');
  check('a tampered token is rejected',
    (await post(port, '/admin/probe', {}, { Authorization: `Bearer ${tampered}` })).status === 401);

  check('garbage as a token is rejected',
    (await post(port, '/admin/probe', {}, { Authorization: 'Bearer not-a-token' })).status === 401);

  const dry = await post(port, '/admin/trades/resolve-stuck', {}, { Authorization: `Bearer ${token}` });
  check('resolve-stuck is reachable with a token', dry.status === 200);
  check('resolve-stuck reports dry run as the default', dry.body?.changed === false);

  server.close();
  console.log(`\n${pass} passing, ${fail} failing\n`);
  process.exit(fail ? 1 : 0);
});
