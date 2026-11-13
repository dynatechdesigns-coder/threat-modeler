import test from 'node:test';
import assert from 'node:assert/strict';
import { renderBadge, riskColor, latestScore, badgeFor } from '../src/services/badge.js';

test('badge is valid-looking SVG with the text escaped', () => {
  const svg = renderBadge({ value: 'risk 23', color: '#3fb950' });
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(svg, />risk 23</);
  const evil = renderBadge({ label: '<script>alert(1)</script>', value: '"><img onerror=x>' });
  assert.ok(!evil.includes('<script>') && !evil.includes('<img'));
});

test('colour runs from green (low risk) to red (high risk)', () => {
  assert.equal(riskColor(0), '#3fb950');
  assert.equal(riskColor(45), '#d9a40e');
  assert.equal(riskColor(95), '#e5534b');
});

test('uses the newest finished scan, skipping scans still running or failed', () => {
  const events = [
    { status: 'baseline', riskScore: 70 },
    { status: 'ok', riskScore: 40 },
    { status: 'scanning', riskScore: 0 },
    { status: 'failed', riskScore: 0 },
  ];
  assert.equal(latestScore(events), 40);
  assert.equal(latestScore([]), null);
  assert.match(badgeFor(events), /risk 40/);
  assert.match(badgeFor([]), /no scan yet/);
});
