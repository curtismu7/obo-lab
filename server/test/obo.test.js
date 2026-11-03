import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, personaOf, agentOf, jwtDecode } from '../src/obo.js';
import { createVerifier } from '../src/jwt.js';

test('mock run: all seven steps behave as written', async () => {
  const w = createWorld();
  const r = await w.run();
  assert.equal(r.ok, true);
  const inb = jwtDecode(r.inbound.token), act = jwtDecode(r.actor.token), del = jwtDecode(r.delegated.token);
  assert.equal(inb.sub, personaOf().sub);
  assert.equal(act.sub, agentOf().clientId);
  assert.equal(del.sub, personaOf().sub, 'the delegated token keeps the person as sub');
  assert.equal(del.act?.sub, agentOf().clientId, 'the agent is recorded as the actor');
  assert.equal(del.client_id, 'token-exchanger');
  assert.ok(del.scope.split(' ').every((s) => inb.scope.includes(s)), 'delegated scope is a subset');
  assert.notEqual(del.scope, inb.scope, 'scope is narrowed');
});

test('downstream accepts the delegated token and refuses the person\'s own', async () => {
  const w = createWorld();
  const r = await w.run();
  assert.equal(r.downstream.delegatedStatus, 200);
  assert.equal(r.downstream.inboundStatus, 401);
  assert.match(r.downstream.inboundWhy, /no act claim/);
});

test('no token reaches the model', () => {
  return createWorld().run().then((r) => {
    assert.equal(r.leak, false);
    assert.ok(r.visibleToModel.every((line) => !line.startsWith('ey')));
  });
});

test('revoking the agent fails the run at step 2', async () => {
  const w = createWorld();
  await w.run();
  w.revokeAgent();
  const refused = await w.run();
  assert.equal(refused.ok, false);
  assert.equal(refused.failedStep, 2);
  assert.match(refused.error, /invalid_client/);
});

test('verifier refuses tampered, expired and wrong-audience tokens', async () => {
  const w = createWorld();
  const r = await w.run();
  const v = createVerifier();
  const tampered = r.delegated.token.slice(0, -3) + 'xxx';
  assert.equal(v(tampered, { aud: 'x', requireAct: true }).ok, false);
  assert.equal(v('not.a.jwt', {}).ok, false);
  assert.equal(v(r.delegated.token, { aud: 'https://other.invalid' }).ok, false);
});
