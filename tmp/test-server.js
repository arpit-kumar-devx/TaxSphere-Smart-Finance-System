// /tmp/test-server.js
const http = require('http');

const data = JSON.stringify({
  description: "Test Income",
  amount: 100,
  category: "General",
  date: new Date().toISOString()
});

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/v1/incomes',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length,
    'Authorization': 'Bearer DUMMY_TOKEN' // Won't work but we want to see if we get 401 or 500
  }
};

const req = http.request(options, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  let body = '';
  res.on('data', (chunk) => body += chunk);
  res.on('end', () => {
    console.log(`BODY: ${body}`);
  });
});

req.on('error', (e) => {
  console.error(`ERROR: ${e.message}`);
});

req.write(data);
req.end();
