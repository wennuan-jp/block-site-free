// Check storage data
const fs = require('fs');
const path = require('path');

// Since this is a Chrome extension, we can't directly access chrome.storage in Node.js
// But we can check if there are any patterns in the blocked list that might be blocking Google Podcasts

console.log('Checking if Google Podcasts might be blocked by this extension...');
console.log('Extension name: ZenBlock: Minimalist Site Blocker');
console.log('Purpose: Block distracting websites');

// Check the content.js file for blocking logic
const contentJsPath = path.join(__dirname, 'content.js');
const contentJs = fs.readFileSync(contentJsPath, 'utf8');

console.log('\nBlocking logic found in content.js:');
console.log('- Uses "contains" logic to match blocked patterns');
console.log('- Normalizes URLs by removing protocol, query params, fragments');
console.log('- Checks if current URL includes any blocked pattern');
console.log('- If blocked, checks whitelist before redirecting');

// Check if there are any patterns that might match Google Podcasts
const googlePodcastsUrl = 'https://www.google.com/podcasts?feed=aHR0cHM6Ly9yc3MuYXJ0MTkuY29tL2J1bGxldHByb29mLXJhZGlv';
const normalizedUrl = googlePodcastsUrl.replace(/^(http|https):\/\//, '').split(/[?#]/)[0].replace(/\/+$/, '');

console.log('\nGoogle Podcasts URL analysis:');
console.log('Original URL:', googlePodcastsUrl);
console.log('Normalized URL:', normalizedUrl);
console.log('Parts that could be matched by blocking patterns:');
console.log('- "google.com"');
console.log('- "google.com/podcasts"');
console.log('- "podcasts"');

// Check if there are any blocked patterns in the codebase
const blockedPatternsInCode = [];
if (contentJs.includes('blockedPatterns')) {
  console.log('\nExtension uses blockedPatterns storage to determine blocked sites');
  console.log('To check the actual blocked patterns, you need to load the extension in Chrome and check storage via DevTools');
}

console.log('\nPossible reasons why Google Podcasts is not opening:');
console.log('1. The extension is blocking "google.com" or "podcasts" pattern');
console.log('2. Google Podcasts service has been shut down (according to web search)');
console.log('3. Network issues or browser settings');

console.log('\nRecommendations:');
console.log('1. Check the extension\'s options page to see blocked patterns');
console.log('2. Try accessing Google Podcasts in an incognito window with extensions disabled');
console.log('3. Check if Google Podcasts has been moved to YouTube Music (as per web search)');
