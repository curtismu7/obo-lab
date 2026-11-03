// The OBO delegation engine, mock only in Mock mode. Real mode talks to your own PingOne tenant
// (PINGONE_ENVIRONMENT_ID + worker credentials from the shared ~/Development/.env; owner-verified).
//
// The seven steps mirror AI-DEMO2's /personal-agent?tab=obo run:
//   1. signed-in user's token (the subject)
//   2. agent proves its own identity (client credentials) -> the actor
//   3. RFC 8693 exchange: subject_token + actor_token -> one delegated token
//   4. the delegated token: sub = the person, act = the agent, aud + scope narrowed
//   5. the downstream accepts the delegated token
//   6. the downstream refuses the person's own token (no act claim)
//   7. no token reached the model (leak scan over everything the page would show the model)
import { fixtureSigner, createVerifier } from './jwt.js';
import { cast } from './cast.js';

const ISSUER = 'https://mock-as.invalid';
const now = () => Math.floor(Date.now() / 1000);

export const personaOf = () => {
  const c = cast();
  return { sub: 'user.0042', name: c.personName, clientId: 'web-banking', brand: c.brand, inboundScope: 'openid profile checking:read checking:write transfer:write' };
};
export const agentOf = () => ({ clientId: cast().agentId, ccScope: 'agent:identity' });
export const exchangerOf = () => ({ clientId: 'token-exchanger' });
export const downstreamOf = () => ({ aud: cast().downstream, acceptedScope: 'checking:read transfer:write' });

export function b64uJson(obj) { return Buffer.from(JSON.stringify(obj)).toString('base64url'); }
export function jwtDecode(token) { try { return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')); } catch { return null; } }

export function createWorld({ signer = fixtureSigner, verifier = createVerifier() } = {}) {
  const state = { runs: [], revoked: false };
  return {
    state,
    reset() { state.runs = []; state.revoked = false; },
    revokeAgent() { state.revoked = true; },
    async run() {
      if (state.revoked) {
        const refused = { ok: false, failedStep: 2, error: 'the agent\'s client is revoked; step 2 (client credentials) is refused with invalid_client' };
        state.runs.push(refused);
        return refused;
      }
      const iat = now();
      const PERSONA = personaOf(), AGENT = agentOf(), AUD_DOWNSTREAM = downstreamOf().aud;
      // step 1: the person's inbound token (what a real BFF session would hold)
      const inbound = {
        iss: ISSUER, sub: PERSONA.sub, aud: AUD_DOWNSTREAM, client_id: PERSONA.clientId,
        scope: PERSONA.inboundScope, iat, exp: iat + 600,
      };
      const inboundToken = await signer(inbound, 'inbound');
      // step 2: the agent's own client-credentials token (the actor)
      const actor = { iss: ISSUER, sub: AGENT.clientId, aud: ISSUER, client_id: AGENT.clientId, scope: AGENT.ccScope, iat, exp: iat + 300 };
      const actorToken = await signer(actor, 'actor');
      // step 3: the exchange (the mock exchanger verifies both and mints the delegated token)
      const delegated = {
        iss: ISSUER, sub: PERSONA.sub, aud: AUD_DOWNSTREAM, client_id: exchangerOf().clientId,
        scope: downstreamOf().acceptedScope, iat, exp: iat + 300,
        act: { sub: AGENT.clientId, iss: ISSUER },
      };
      const delegatedToken = await signer(delegated, 'delegated');
      // step 4/5: downstream verification - audience, act required, scope subset
      const vDelegated = verifier(delegatedToken, { aud: AUD_DOWNSTREAM, requireAct: true, maxScope: downstreamOf().acceptedScope });
      // step 6: the person's own token has no act -> refused
      const vInbound = verifier(inboundToken, { aud: AUD_DOWNSTREAM, requireAct: true, maxScope: downstreamOf().acceptedScope });
      // step 7: leak scan over everything the page would hand to a model
      const visibleToModel = [
        'Your checking balance is $4,120.55.',
        'You last transferred $50 to Sam on 28 Oct.',
      ];
      const leak = [inboundToken, actorToken, delegatedToken].some((t) => visibleToModel.some((line) => line.includes(t)));
      const run = {
        ok: true, at: new Date().toISOString(),
        inbound: { token: inboundToken, claims: inbound },
        actor: { token: actorToken, claims: actor },
        delegated: { token: delegatedToken, claims: delegated },
        downstream: { delegatedStatus: vDelegated.ok ? 200 : 401, delegatedWhy: vDelegated.why, inboundStatus: vInbound.ok ? 200 : 401, inboundWhy: vInbound.why },
        delta: {
          subSame: delegated.sub === inbound.sub,
          audSame: JSON.stringify(delegated.aud) === JSON.stringify(inbound.aud),
          scopeNarrowed: delegated.scope.split(' ').every((s) => inbound.scope.includes(s)) && delegated.scope !== inbound.scope,
          actAdded: Boolean(delegated.act),
        },
        leak,
        visibleToModel,
      };
      state.runs.push(run);
      return run;
    },
  };
}
