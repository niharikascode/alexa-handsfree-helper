// MCP server for the Hands-Free Helper: Streamable HTTP transport, protocol 2025-11-25.
// One endpoint (/mcp): POST carries JSON-RPC requests; long-running tool calls answer with a
// text/event-stream that sends progress + log notifications (the agent's narration and steps)
// before the final result. Any MCP client works: the Alexa+ page, MCP Inspector, Claude Code.
const crypto = require('crypto');

const PROTOCOL = '2025-11-25';
const SUPPORTED = [PROTOCOL, '2025-06-18', '2025-03-26'];
const SERVER_INFO = { name: 'hands-free-helper', title: 'Hands-Free Helper (simulated Alexa+)', version: '1.0.0' };

const RESULT_SCHEMA = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['needs_confirmation', 'done', 'blocked', 'busy'],
      description: 'needs_confirmation: everything is ready and the agent is waiting for the user\'s yes/no' },
    speech: { type: 'string', description: 'What Alexa should say to the user now' },
    narration: { type: 'array', items: { type: 'string' }, description: 'Milestones spoken while working' },
    steps: { type: 'array', items: { type: 'string' }, description: 'Every GUI action the agent took' }
  },
  required: ['status', 'speech', 'narration', 'steps']
};

const TOOLS = [
  {
    name: 'run_web_task',
    title: 'Do a task on a website',
    description: 'Carry out a spoken request on a website in Alexa\'s cloud browser (e.g. "refill my blood pressure ' +
      'medication at Maple Street Pharmacy"). The agent narrates milestones and never submits, buys or sends ' +
      'anything without confirmation: if it reaches a final action it returns status "needs_confirmation". ' +
      'Follow-up questions about earlier requests in this conversation are answered from memory.',
    inputSchema: { type: 'object', properties: { request: { type: 'string', description: 'The user\'s request, as spoken' } },
      required: ['request'] },
    outputSchema: RESULT_SCHEMA,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }
  },
  {
    name: 'confirm_action',
    title: 'Answer Alexa\'s yes/no question',
    description: 'Give the user\'s answer after run_web_task returned "needs_confirmation". approve=true lets the ' +
      'agent press the final button (e.g. Place order); approve=false stops without submitting.',
    inputSchema: { type: 'object', properties: {
      approve: { type: 'boolean' },
      note: { type: 'string', description: 'Optional change the user asked for, e.g. "make it tomorrow at 10 instead"' } },
      required: ['approve'] },
    outputSchema: RESULT_SCHEMA,
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true }
  },
  {
    name: 'reset_conversation',
    title: 'Start a new conversation',
    description: 'Forget the current conversation so the next request starts fresh.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  }
];

// Browsers must only reach this from our own page (DNS-rebinding protection, per the transport spec).
const okOrigin = (o) => !o || /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(o);

function createMcpHandler({ runAgent, resetConversation }) {
  const sessions = new Set();

  const rpcResult = (id, result) => ({ jsonrpc: '2.0', id, result });
  const rpcError = (id, code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });
  const json = (res, status, body, headers = {}) => {
    res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
    res.end(body === undefined ? '' : JSON.stringify(body));
  };

  // Long-running tools: stream notifications on an SSE response, then the JSON-RPC result.
  async function streamTool(res, msg, text) {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    const out = (m) => res.write(`event: message\ndata: ${JSON.stringify(m)}\n\n`);
    const token = msg.params?._meta?.progressToken;
    const narration = [], steps = [];
    let n = 0;
    const send = (ev) => {
      if (ev.type === 'say') narration.push(ev.text);
      if (ev.type === 'activity') steps.push(ev.text);
      if (ev.type === 'result') return;
      out({ jsonrpc: '2.0', method: 'notifications/message', params: { level: ev.type === 'error' ? 'error' : 'info', logger: 'agent', data: ev } });
      if (token !== undefined) out({ jsonrpc: '2.0', method: 'notifications/progress', params: { progressToken: token, progress: ++n, message: ev.text } });
    };
    let result;
    try {
      const r = await runAgent(text, send);
      const tag = (r.last || '').match(/^(ASK|DONE|BLOCKED):\s*(.+)$/m);
      const status = r.busy ? 'busy' : tag ? { ASK: 'needs_confirmation', DONE: 'done', BLOCKED: 'blocked' }[tag[1]] : r.code ? 'blocked' : 'done';
      const speech = r.busy ? "I'm still working on the last request." : tag ? tag[2].trim() : (r.last || '').trim();
      const structured = { status, speech, narration, steps };
      result = { content: [{ type: 'text', text: JSON.stringify(structured) }], structuredContent: structured, isError: status === 'blocked' };
    } catch (e) {
      result = { content: [{ type: 'text', text: e.message }], isError: true };
    }
    out(rpcResult(msg.id, result)); res.end();
  }

  return function handle(req, res) {
    if (!okOrigin(req.headers.origin)) return json(res, 403, rpcError(null, -32000, 'Origin not allowed'));
    if (req.method === 'GET') return json(res, 405, undefined, { Allow: 'POST, DELETE' });   // no standalone SSE stream
    if (req.method === 'DELETE') { sessions.delete(req.headers['mcp-session-id']); return json(res, 200, undefined); }
    if (req.method !== 'POST') return json(res, 405, undefined, { Allow: 'POST, DELETE' });

    let body = '';
    req.on('data', (d) => (body += d));
    req.on('end', () => {
      let msg;
      try { msg = JSON.parse(body); } catch { return json(res, 400, rpcError(null, -32700, 'Parse error')); }
      if (Array.isArray(msg) || msg.jsonrpc !== '2.0') return json(res, 400, rpcError(null, -32600, 'Invalid request'));
      if (msg.method === undefined || msg.id === undefined) return json(res, 202, undefined);   // notification or response

      if (msg.method === 'initialize') {
        const sid = crypto.randomUUID(); sessions.add(sid);
        const asked = msg.params?.protocolVersion;
        return json(res, 200, rpcResult(msg.id, {
          protocolVersion: SUPPORTED.includes(asked) ? asked : PROTOCOL,
          capabilities: { tools: { listChanged: false }, logging: {} },
          serverInfo: SERVER_INFO,
          instructions: 'Voice assistant back end. Call run_web_task with the user\'s request; if the result status is ' +
            'needs_confirmation, read `speech` to the user and call confirm_action with their answer.'
        }), { 'Mcp-Session-Id': sid });
      }
      const sid = req.headers['mcp-session-id'];
      if (!sid) return json(res, 400, rpcError(msg.id, -32000, 'Missing Mcp-Session-Id header'));
      if (!sessions.has(sid)) return json(res, 404, rpcError(msg.id, -32001, 'Session not found'));

      switch (msg.method) {
        case 'ping': return json(res, 200, rpcResult(msg.id, {}));
        case 'logging/setLevel': return json(res, 200, rpcResult(msg.id, {}));
        case 'tools/list': return json(res, 200, rpcResult(msg.id, { tools: TOOLS }));
        case 'tools/call': {
          const { name, arguments: a = {} } = msg.params || {};
          if (name === 'run_web_task') {
            if (typeof a.request !== 'string' || !a.request.trim()) return json(res, 200, rpcError(msg.id, -32602, 'request is required'));
            return streamTool(res, msg, a.request.trim());
          }
          if (name === 'confirm_action') {
            if (typeof a.approve !== 'boolean') return json(res, 200, rpcError(msg.id, -32602, 'approve (boolean) is required'));
            const text = (a.approve ? 'Yes, go ahead.' : "No, don't do that.") + (a.note ? ` ${a.note}` : '');
            return streamTool(res, msg, text);
          }
          if (name === 'reset_conversation') {
            resetConversation();
            return json(res, 200, rpcResult(msg.id, { content: [{ type: 'text', text: 'Started a new conversation.' }] }));
          }
          return json(res, 200, rpcError(msg.id, -32602, `Unknown tool: ${name}`));
        }
        default: return json(res, 200, rpcError(msg.id, -32601, `Method not found: ${msg.method}`));
      }
    });
  };
}

module.exports = { createMcpHandler, TOOLS, PROTOCOL };
