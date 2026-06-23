#!/usr/bin/env node
// Usage: node fetch-page.js <URL>

const https = require('https');
const http = require('http');
const url = require('url');

const pageUrl = process.argv[2];

if (!pageUrl) {
  console.error('Usage: node fetch-page.js <URL>');
  process.exit(1);
}

const parsed = url.parse(pageUrl);
const client = parsed.protocol === 'https:' ? https : http;

const options = {
  hostname: parsed.hostname,
  path: parsed.path,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'fa,en;q=0.9',
  }
};

client.get(options, (res) => {
  let data = '';
  res.setEncoding('utf8');
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    process.stdout.write(data);
  });
}).on('error', (err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
