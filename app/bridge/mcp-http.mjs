// chatgpt-on-steroids: Streamable HTTP MCP server (stateless).
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { BRIDGE_VERSION } from './tools.mjs';
import { createRuntime } from './runtime.mjs';
import { startPanel } from './panel.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CFG = process.env.CGT_CONFIG || path.join(HERE, 'config.json');
const PORT = Number(process.env.CGT_PORT || 8877);
const PANEL_PORT = Number(process.env.CGT_PANEL_PORT || 8878);
const TOKEN = process.env.CGT_TOKEN || null;
const runtime = createRuntime({ configPath: CFG, mcpPort: PORT, panelPort: PANEL_PORT, token: TOKEN });
const bridge = runtime.bridge;
const S = (d) => z.string().describe(d);
const B = (d) => z.boolean().optional().describe(d);
const N = (d) => z.number().optional().describe(d);
const R = (res) => ({ content: [{ type: 'text', text: JSON.stringify(res, null, 2) }], isError: !res.ok });
const SPECS = [
  ['cgt_ping', 'Check that the bridge is alive.', {}, []],
  ['cgt_list_dir', 'List a directory.', { path: S('Directory path.').optional() }, ['path']],
  ['cgt_read_file', 'Read a file.', { path: S('File path.'), offset: N('Byte offset.'), limit: N('Maximum bytes.') }, ['path','offset','limit']],
  ['cgt_search', 'Search file contents under a root.', { path: S('Folder to search. Omit for the home folder.').optional(), query: S('Text to search for.'), isRegex: B('Treat query as a regex.'), glob: S('File glob, e.g. *.py.'), maxHits: N('Maximum hits.') }, ['path','query','isRegex','glob','maxHits']],
  ['cgt_write_file', 'Write a file, creating or overwriting it.', { path: S('Destination path.'), content: S('File contents.') }, ['path','content']],
  ['cgt_edit_file', 'Literal find and replace.', { path: S('File path.'), find: S('Text to replace.'), replace: S('Replacement text.'), all: B('Replace every match.') }, ['path','find','replace','all']],
  ['cgt_delete_file', 'Delete a file or directory.', { path: S('Path.') }, ['path']],
  ['cgt_copy_file', 'Copy a file or directory recursively, overwriting the destination.', { from: S('Source path.'), to: S('Destination path.') }, ['from','to']],
  ['cgt_move_file', 'Move or rename a file or directory.', { from: S('Source path.'), to: S('Destination path.') }, ['from','to']],
  ['cgt_make_dir', 'Create a directory, like mkdir -p.', { path: S('Directory path.') }, ['path']],
  ['cgt_exec_command', 'Run a shell command.', { command: S('Command to run.'), cwd: S('Working directory.').optional(), timeoutMs: N('Timeout in milliseconds.') }, ['command','cwd','timeoutMs']],
  ['cgt_batch', 'Run several tool calls in order, up to 20.', { calls: z.array(z.object({ tool: z.string(), args: z.record(z.string(), z.any()).optional() })).describe('Calls to run in order') }, ['calls']],
  ['cgt_list_sessions', 'List recorded sessions.', {}, []],
  ['cgt_session_log', 'Read a session step log.', { id: S('Session id.'), tail: N('Number of lines.') }, ['id','tail']],
];
// Tool hints for the client. Without them MCP treats every tool as possibly
// destructive, and ChatGPT asks "Reply yes to proceed" before even a directory
// listing. Reads are marked read-only.
const READ = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };
const DESTROY = { readOnlyHint: false, destructiveHint: true, openWorldHint: false };
const HINTS = {
  cgt_ping: READ, cgt_list_dir: READ, cgt_read_file: READ, cgt_search: READ, cgt_list_sessions: READ, cgt_session_log: READ,
  cgt_write_file: WRITE, cgt_edit_file: WRITE, cgt_copy_file: WRITE, cgt_move_file: WRITE, cgt_make_dir: WRITE,
  cgt_delete_file: DESTROY, cgt_exec_command: DESTROY, cgt_batch: DESTROY,
};

// Sent to the model with every connection (the MCP "instructions" field), so the
// agent knows it is already authorised and does not ask in chat.
const INSTRUCTIONS = `This connector is the user's own computer. The cgt_ tools give you their files and a shell, and they installed it so you could use them.

The user has authorised every cgt_ tool call you make for their requests. When they ask for something, do it right away. Don't ask them to confirm in the chat, not even with "Reply yes to proceed". Their request is their consent.

Run cgt_ping first. It shows the home folder that relative paths start from. Then look around with cgt_list_dir, cgt_search and cgt_read_file before you guess. On Windows the user's files are under C:\Users. The Desktop is C:\Users\<name>\Desktop, or C:\Users\<name>\OneDrive\Desktop if OneDrive moved it.`;

function createServer() {
  const srv = new McpServer({ name: 'chatgpt-on-steroids', version: BRIDGE_VERSION }, { capabilities: { tools: {} }, instructions: INSTRUCTIONS });
  for (const [name, desc, schema, keys] of SPECS) {
    const h = async (a) => R(await runtime.dispatch(name, keys.reduce((o, k) => (a && a[k] !== undefined ? (o[k] = a[k], o) : o), {})));
    const title = name.replace(/^cgt_/, '').replace(/_/g, ' ');
    srv.registerTool(name, {
      title,
      description: desc,
      ...(keys.length ? { inputSchema: schema } : {}),
      annotations: { title, ...HINTS[name] },
    }, h);
  }
  return srv;
}
// No CORS headers: ChatGPT calls from its servers, not from a browser, and
// without them a web page cannot read answers from this port.
const srv = http.createServer(async (req, res) => {
  if (TOKEN && (req.headers.authorization || '') !== 'Bearer ' + TOKEN) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32001, message: 'unauthorized' }, id: null }));
    return;
  }
  const url = new URL(req.url, 'http://127.0.0.1:' + PORT);
  if (!runtime.acceptsMcpPath(url.pathname)) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'not found' })); return; }
  if (req.method !== 'POST') { res.writeHead(405, { Allow: 'POST' }).end(); return; }
  // Only requests from outside count as ChatGPT: the relay marks what it
  // forwards, a Cloudflare tunnel adds cf-connecting-ip. Local tests do not.
  const viaRelay = req.headers['x-cgt-via'] === 'relay' || !!req.headers['cf-connecting-ip'];
  // From outside, the body is read here so the client name in initialize can
  // reach the panel as "last client". The parsed body then goes to the transport,
  // because the stream can only be read once.
  let parsedBody;
  if (viaRelay) {
    const raw = await new Promise((resolve, reject) => {
      const chunks = [];
      let bytes = 0;
      req.on('data', (c) => { bytes += c.length; if (bytes > 1024 * 1024) { req.destroy(); reject(new Error('body too large')); } else chunks.push(c); });
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      req.on('error', reject);
    }).catch(() => '');
    try { parsedBody = JSON.parse(raw); } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32700, message: 'parse error' }, id: null }));
      return;
    }
    const call = Array.isArray(parsedBody) ? parsedBody.find((x) => x && x.method === 'initialize') : parsedBody;
    const info = call && call.method === 'initialize' ? call.params?.clientInfo : null;
    runtime.touch(info);
    runtime.noteClient(info);
  }
  try {
    const mcp = createServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => { transport.close().catch(() => {}); mcp.close().catch(() => {}); });
    await mcp.connect(transport);
    await transport.handleRequest(req, res, parsedBody);
  } catch (e) {
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32603, message: e.message }, id: null }));
  }
});
srv.listen(PORT, '127.0.0.1', () => {
  console.log('[cgt-mcp] http://127.0.0.1:' + PORT + '/mcp/<secret>');
  console.log('[cgt-mcp] ' + bridge.ADVERTISED.length + ' tools, home: ' + bridge.HOME);
  console.log('[cgt-mcp] auth: ' + (TOKEN ? 'Bearer' : 'none'));
});

try {
  const panel = await startPanel({ runtime, port: PANEL_PORT });
  console.log('[cgt-panel] ' + panel.url);
} catch (e) {
  console.log('[cgt-panel] unavailable on 127.0.0.1:' + PANEL_PORT + ': ' + e.message);
}

const shutdown = () => {
  runtime.close();
  srv.close();
  setTimeout(() => process.exit(0), 300).unref();
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);


