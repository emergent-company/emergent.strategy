import WebSocket from 'ws';

const PAGE_ID = '9CF93A62F73A94DA1EBB4C6FC2FD33D7';
const ws = new WebSocket(`ws://localhost:9222/devtools/page/${PAGE_ID}`);

let messageId = 1;
const errors = [];
const warnings = [];
const networkErrors = [];

ws.on('open', () => {
  ws.send(JSON.stringify({id: messageId++, method: 'Runtime.enable'}));
  ws.send(JSON.stringify({id: messageId++, method: 'Log.enable'}));
  ws.send(JSON.stringify({id: messageId++, method: 'Network.enable'}));
  ws.send(JSON.stringify({id: messageId++, method: 'Console.enable'}));
  
  // Reload the page to capture all console messages from fresh load
  ws.send(JSON.stringify({id: messageId++, method: 'Page.reload', params: {ignoreCache: false}}));
  
  setTimeout(() => {
    console.log('\n=== ERRORS ===');
    if (errors.length === 0) {
      console.log('✅ No errors found!');
    } else {
      errors.forEach(e => console.log(JSON.stringify(e, null, 2)));
    }
    
    console.log('\n=== WARNINGS ===');
    if (warnings.length === 0) {
      console.log('✅ No warnings found!');
    } else {
      warnings.forEach(w => console.log(JSON.stringify(w, null, 2)));
    }
    
    console.log('\n=== NETWORK ERRORS (Status >= 400) ===');
    if (networkErrors.length === 0) {
      console.log('✅ No network errors found!');
    } else {
      networkErrors.forEach(n => console.log(JSON.stringify(n, null, 2)));
    }
    
    ws.close();
    process.exit(0);
  }, 5000);
});

ws.on('message', (data) => {
  const msg = JSON.parse(data);
  
  // Console API errors
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
    errors.push({
      type: 'console.error',
      message: msg.params.args.map(a => a.value || a.description).join(' '),
      timestamp: msg.params.timestamp,
      stack: msg.params.stackTrace
    });
  }
  
  // Console API warnings
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'warning') {
    warnings.push({
      type: 'console.warn',
      message: msg.params.args.map(a => a.value || a.description).join(' '),
      timestamp: msg.params.timestamp
    });
  }
  
  // Runtime exceptions
  if (msg.method === 'Runtime.exceptionThrown') {
    errors.push({
      type: 'exception',
      message: msg.params.exceptionDetails.text,
      exception: msg.params.exceptionDetails.exception,
      timestamp: msg.params.timestamp
    });
  }
  
  // Log entries (errors/warnings)
  if (msg.method === 'Log.entryAdded') {
    if (msg.params.entry.level === 'error') {
      errors.push({
        type: 'log.error',
        message: msg.params.entry.text,
        url: msg.params.entry.url,
        timestamp: msg.params.entry.timestamp
      });
    } else if (msg.params.entry.level === 'warning') {
      warnings.push({
        type: 'log.warning',
        message: msg.params.entry.text,
        timestamp: msg.params.entry.timestamp
      });
    }
  }
  
  // Network errors (4xx, 5xx)
  if (msg.method === 'Network.responseReceived') {
    const status = msg.params.response.status;
    if (status >= 400) {
      networkErrors.push({
        url: msg.params.response.url,
        status: status,
        statusText: msg.params.response.statusText,
        timestamp: msg.params.timestamp
      });
    }
  }
});

ws.on('error', (err) => {
  console.error('WebSocket error:', err.message);
  process.exit(1);
});
