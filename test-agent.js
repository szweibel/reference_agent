const http = require('http');

const data = JSON.stringify({
  prompt: "Can I bring my service dog to the library?"
});

const options = {
  hostname: 'localhost',
  port: 8000,
  path: '/api/query',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

console.log('Testing agent with query: "Can I bring my service dog to the library?"\n');

const req = http.request(options, (res) => {
  console.log(`Status: ${res.statusCode}\n`);

  let buffer = '';
  res.on('data', (chunk) => {
    buffer += chunk.toString();
    // Print as we receive data
    process.stdout.write(chunk.toString());
  });

  res.on('end', () => {
    console.log('\n\nStream ended.');
  });
});

req.on('error', (error) => {
  console.error('Request error:', error);
});

req.write(data);
req.end();

// Timeout after 2 minutes
setTimeout(() => {
  console.log('\n\nTimeout - ending test');
  process.exit(0);
}, 120000);
