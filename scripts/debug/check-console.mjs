import WebSocket from 'ws';

const PAGE_ID = '9CF93A62F73A94DA1EBB4C6FC2FD33D7';
const ws = new WebSocket(`ws://localhost:9222/devtools/page/${PAGE_ID}`);

let messageId = 1;
const messages = [];

ws.on('open', () => {
  ws.send(JSON.stringify({id: messageId++, method: 'Runtime.enable'}));
  ws.send(JSON.stringify({id: messageId++, method: 'Log.enable'}));
  
  setTimeout(() => {
    console.log('=== Console Messages Captured ===');
    messages.forEach(m => console.log(JSON.stringify(m, null, 2)));
    if (messages.length === 0) console.log('(Listening for live messages only)');
    ws.close();
    process.exit(0);
  }, 3000);
});

ws.on('message', (data) => {
  const msg = JSON.parse(data);
  if (msg.method && (msg.method.includes('console') || msg.method.includes('Log') || msg.method.includes('exception'))) {
    messages.push(msg);
  }
});

ws.on('error', (err) => {
  console.error('WebSocket error:', err.message);
  process.exit(1);
});
