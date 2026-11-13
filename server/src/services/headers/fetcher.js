import dns from 'node:dns';
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';

// Fetches ONLY the headers of a web page for the header checker.
//
// This is the dangerous kind of feature (the server visits an address a stranger typed), so every step is locked down:
//  - only http/https on the normal ports, no passwords in the address
//  - the address the name points to is checked INSIDE the connection step (so it cannot change between check and use),
//    and anything private, local or reserved is refused (no reaching 127.0.0.1, 10.x, 192.168.x, cloud metadata 169.254.x)
//  - redirects are followed by hand, a few times, and each hop goes through the same checks
//  - the body is never read: the connection is dropped as soon as the headers arrive
//  - a total time limit applies

const blocked = new net.BlockList();
const v4 = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
];
for (const [net_, bits] of v4) blocked.addSubnet(net_, bits, 'ipv4');
const v6 = [['::', 128], ['::1', 128], ['64:ff9b::', 96], ['100::', 64], ['2001:db8::', 32], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8]];
for (const [net_, bits] of v6) blocked.addSubnet(net_, bits, 'ipv6');

export class HeaderFetchError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

/** True only for addresses that are on the public internet. */
export function isPublicAddress(address) {
  const family = net.isIP(address);
  if (!family) return false;
  // An IPv4 address written in IPv6 form (::ffff:10.0.0.1) is judged as the IPv4 address it is.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (mapped) return isPublicAddress(mapped[1]);
  return !blocked.check(address, family === 4 ? 'ipv4' : 'ipv6');
}

/** Turns what a person typed into a safe URL, or throws a friendly error. */
export function parseTarget(input, relaxed = false) {
  const raw = String(input || '').trim();
  if (!raw || raw.length > 2000) throw new HeaderFetchError('Type a website address, like https://example.com');
  let url;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    throw new HeaderFetchError('That does not look like a web address');
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new HeaderFetchError('Only http and https addresses can be checked');
  if (url.username || url.password) throw new HeaderFetchError('Addresses with a username or password are not allowed');
  if (relaxed) return url; // tests only: lets the checks run against a local test server
  if (url.port && !['80', '443'].includes(url.port)) throw new HeaderFetchError('Only the normal web ports (80 and 443) can be checked');
  const host = url.hostname.toLowerCase();
  if (!host.includes('.') && !net.isIP(host.replace(/^\[|\]$/g, ''))) throw new HeaderFetchError('That address has no real domain name');
  // Node does not run the lookup step for a bare IP address, so private IP addresses must be refused here.
  const bare = host.replace(/^\[|\]$/g, '');
  if (net.isIP(bare) && !isPublicAddress(bare)) throw new HeaderFetchError('Private or local addresses cannot be checked');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new HeaderFetchError('Local addresses cannot be checked');
  }
  return url;
}

/** A DNS lookup that refuses to hand back any non-public address. Used as the connection's own lookup. */
export function makeSafeLookup(resolve = dns.lookup) {
  return (hostname, options, callback) => {
    const cb = typeof options === 'function' ? options : callback;
    const opts = typeof options === 'function' ? {} : options || {};
    resolve(hostname, { all: true, family: opts.family || 0 }, (err, addresses) => {
      if (err) return cb(err);
      if (!addresses.length || addresses.some((a) => !isPublicAddress(a.address))) {
        return cb(new HeaderFetchError('That address points to a private or local network, so it cannot be checked', 400));
      }
      return opts.all ? cb(null, addresses) : cb(null, addresses[0].address, addresses[0].family);
    });
  };
}

function requestOnce(url, { lookup, timeoutMs, allowPrivate }) {
  return new Promise((resolve, reject) => {
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request(
      url,
      {
        method: 'GET',
        headers: { 'user-agent': 'threat-modeler-header-check', accept: 'text/html,*/*;q=0.8', connection: 'close' },
        lookup: allowPrivate ? undefined : lookup,
        timeout: timeoutMs,
      },
      (res) => {
        const result = { status: res.statusCode, headers: res.headers };
        res.destroy(); // the body is never read
        resolve(result);
      }
    );
    req.on('timeout', () => req.destroy(new HeaderFetchError('The website took too long to answer', 504)));
    req.on('error', (err) => {
      if (err instanceof HeaderFetchError) return reject(err);
      const code = err.code || '';
      if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return reject(new HeaderFetchError('That website address was not found', 404));
      if (code === 'ECONNREFUSED') return reject(new HeaderFetchError('The website refused the connection', 502));
      if (/CERT|TLS|SSL/i.test(code) || /certificate/i.test(err.message)) {
        return reject(new HeaderFetchError(`The website's security certificate has a problem (${code || 'certificate error'})`, 502));
      }
      reject(new HeaderFetchError('Could not connect to that website', 502));
    });
    req.end();
  });
}

export async function fetchHeaders(input, { timeoutMs = 8000, maxRedirects = 4, resolve, allowPrivate = false } = {}) {
  const startUrl = parseTarget(input, allowPrivate);
  const lookup = makeSafeLookup(resolve);
  const deadline = Date.now() + 15000;
  const chain = [];
  let url = startUrl;

  for (let hop = 0; ; hop++) {
    if (Date.now() > deadline) throw new HeaderFetchError('The website took too long to answer', 504);
    const res = await requestOnce(url, { lookup, timeoutMs, allowPrivate });
    const location = res.headers.location;
    if (res.status >= 300 && res.status < 400 && location) {
      if (hop >= maxRedirects) throw new HeaderFetchError('The website redirected too many times', 502);
      chain.push({ url: url.toString(), status: res.status });
      let next;
      try {
        next = parseTarget(new URL(location, url).toString(), allowPrivate);
      } catch (err) {
        throw new HeaderFetchError(`The website redirected somewhere that cannot be checked: ${err.message}`, 502);
      }
      url = next;
      continue;
    }
    return { startUrl: startUrl.toString(), finalUrl: url.toString(), status: res.status, headers: res.headers, redirects: chain };
  }
}
