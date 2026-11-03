// The seven steps and their talk-track lines. The data lives here; the page and the generated
// talk track both read it, so they cannot drift.
export const STEPS = {
  1: { title: 'You are signed in', why: 'Your session holds a PingOne access token. The lab reads it server-side and uses it as the subject of the exchange. It is shown here because it is your own token; over MCP the model never receives it.' },
  2: { title: 'Agent gets its own identity', why: 'The AI Agent app proves who the agent is with its own credentials. This becomes the actor in the exchange.' },
  3: { title: 'Token exchange (RFC 8693)', why: 'The Token Exchanger app trades your token plus the agent token for one delegated token.' },
  4: { title: 'Delegated token: what changed', why: 'Your identity is kept, the agent is recorded as the actor, and the audience and scope are narrowed.' },
  5: { title: 'Downstream accepts the delegated token', why: 'The downstream API only accepts a token with the right audience and an act claim.' },
  6: { title: 'Downstream refuses your own token', why: 'The same call with your original token is refused: only the delegated token carries the agent.' },
  7: { title: 'No token reached the model', why: 'Everything the page would hand to a model is scanned for token text. This page shows tokens because you are the signed-in user who ran the exchange; the model never receives them.' },
};
