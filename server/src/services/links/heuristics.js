// Deterministic checks on how a link is written. The link is never opened.
// Each signal has a weight; the total decides the verdict.

const DANGER_AT = 60;
const WARN_AT = 25;

// Brands that scammers imitate. "domains" are the real addresses we know for each one.
// countrySites: the brand also uses its own name with country endings (google.de, amazon.co.uk).
// This list is short on purpose. It is not a full list of brands.
const BRANDS = {
  paypal: { words: ['paypal'], domains: ['paypal.com', 'paypal.me', 'paypalobjects.com'], countrySites: true },
  google: {
    words: ['google', 'gmail'],
    domains: ['google.com', 'goo.gl', 'gstatic.com', 'googleapis.com', 'googleusercontent.com', 'youtube.com', 'youtu.be', 'gmail.com', 'withgoogle.com', 'google.org'],
    countrySites: true,
  },
  apple: { words: ['apple', 'icloud'], domains: ['apple.com', 'icloud.com', 'cdn-apple.com'], countrySites: true },
  microsoft: {
    words: ['microsoft', 'outlook', 'onedrive'],
    domains: ['microsoft.com', 'live.com', 'office.com', 'microsoftonline.com', 'outlook.com', 'windows.com', 'azure.com', 'bing.com', 'sharepoint.com', 'onedrive.com', 'xbox.com', 'skype.com'],
    countrySites: true,
  },
  amazon: { words: ['amazon'], domains: ['amazon.com', 'amazonaws.com', 'amzn.to'], countrySites: true },
  facebook: { words: ['facebook'], domains: ['facebook.com', 'fb.com', 'fb.me', 'meta.com', 'messenger.com', 'fbcdn.net'], countrySites: false },
  instagram: { words: ['instagram'], domains: ['instagram.com', 'cdninstagram.com'], countrySites: false },
  whatsapp: { words: ['whatsapp'], domains: ['whatsapp.com', 'whatsapp.net', 'wa.me'], countrySites: false },
  netflix: { words: ['netflix'], domains: ['netflix.com', 'nflxvideo.net'], countrySites: true },
  linkedin: { words: ['linkedin'], domains: ['linkedin.com', 'lnkd.in'], countrySites: false },
  twitter: { words: ['twitter'], domains: ['twitter.com', 'x.com', 't.co'], countrySites: false },
  github: { words: ['github'], domains: ['github.com', 'github.io', 'githubusercontent.com', 'githubassets.com'], countrySites: false },
  dropbox: { words: ['dropbox'], domains: ['dropbox.com', 'dropboxusercontent.com'], countrySites: false },
  stripe: { words: ['stripe'], domains: ['stripe.com'], countrySites: false },
  paystack: { words: ['paystack'], domains: ['paystack.com', 'paystack.co'], countrySites: false },
  flutterwave: { words: ['flutterwave'], domains: ['flutterwave.com'], countrySites: false },
  binance: { words: ['binance'], domains: ['binance.com', 'binance.us'], countrySites: false },
  coinbase: { words: ['coinbase'], domains: ['coinbase.com'], countrySites: false },
  telegram: { words: ['telegram'], domains: ['telegram.org', 't.me', 'telegram.me'], countrySites: false },
  tiktok: { words: ['tiktok'], domains: ['tiktok.com', 'tiktokv.com'], countrySites: false },
  gtbank: { words: ['gtbank'], domains: ['gtbank.com'], countrySites: false },
  zenithbank: { words: ['zenithbank'], domains: ['zenithbank.com'], countrySites: false },
  firstbank: { words: ['firstbank', 'firstbanknigeria'], domains: ['firstbanknigeria.com'], countrySites: false },
  uba: { words: ['ubagroup'], domains: ['ubagroup.com'], countrySites: false },
  accessbank: { words: ['accessbank', 'accessbankplc'], domains: ['accessbankplc.com'], countrySites: false },
};

const PHISH_WORDS = new Set([
  'login', 'signin', 'secure', 'security', 'verify', 'verification', 'account', 'update', 'support', 'help',
  'wallet', 'password', 'confirm', 'billing', 'service', 'services', 'online', 'official', 'alert', 'recovery',
  'bonus', 'gift', 'prize', 'claim', 'free', 'app', 'web', 'mail', 'pay', 'payment', 'payments',
]);

const HOST_WORDS = /(login|signin|verify|secure|account|update|wallet|password|confirm|billing|bonus|gift|prize|airdrop|claim|free|bvn|otp|recover)/g;
const PATH_WORDS = /(login|signin|verify|account|update|wallet|password|confirm|billing|recover|claim|otp|bvn)/g;

const RISKY_TLDS = new Set(['tk', 'ml', 'ga', 'cf', 'gq', 'top', 'xyz', 'click', 'work', 'loan', 'zip', 'mov', 'country', 'kim', 'men', 'party', 'review', 'science', 'stream', 'download', 'gdn', 'racing', 'win', 'bid', 'icu', 'cyou', 'buzz', 'rest', 'monster']);
const ABUSED_CC = new Set(['tk', 'ml', 'ga', 'cf', 'gq', 'cc', 'ws', 'top']);
const SHORTENERS = new Set(['bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'ow.ly', 'is.gd', 'buff.ly', 'cutt.ly', 'rb.gy', 'shorturl.at', 'tiny.cc', 't.ly']);
const FREE_HOSTING = ['weebly.com', 'blogspot.com', 'wixsite.com', 'github.io', 'firebaseapp.com', 'web.app', 'pages.dev', 'glitch.me', '000webhostapp.com', 'netlify.app', 'vercel.app', 'ngrok-free.app', 'ngrok.io', 'trycloudflare.com', 'workers.dev'];
const SECOND_LEVEL = new Set(['co', 'com', 'org', 'net', 'gov', 'edu', 'ac', 'sch', 'ne', 'or', 'go']);
const RISKY_FILES = /\.(exe|scr|msi|bat|cmd|apk|jar|vbs|ps1|iso|dmg|pkg|hta|lnk|docm|xlsm|pptm)$/i;
const ARCHIVE_FILES = /\.(zip|rar|7z|tar|gz)$/i;
const REDIRECT_KEYS = new Set(['url', 'redirect', 'redirect_uri', 'redirecturl', 'next', 'continue', 'dest', 'destination', 'target', 'link', 'goto', 'return', 'returnurl', 'r', 'u']);

/** Registrable domain, guessed without a full public-suffix list: example.com, example.co.uk, example.com.ng. */
export function registrable(host) {
  const labels = host.split('.');
  if (labels.length <= 2) return { domain: host, label: labels[0], tld: labels.slice(1).join('.') };
  const tld = labels[labels.length - 1];
  const sld = labels[labels.length - 2];
  const take = tld.length === 2 && SECOND_LEVEL.has(sld) ? 3 : 2;
  const parts = labels.slice(-take);
  return { domain: parts.join('.'), label: parts[0], tld: parts.slice(1).join('.') };
}

// Turns "xn--pypal-4ve.com" into the characters people actually see. Plain JavaScript (RFC 3492), so it also runs in browsers.
function punyDecode(input) {
  const base = 36, tMin = 1, tMax = 26, skew = 38, damp = 700;
  const adapt = (delta, points, first) => {
    let d = first ? Math.floor(delta / damp) : delta >> 1;
    d += Math.floor(d / points);
    let k = 0;
    while (d > (((base - tMin) * tMax) >> 1)) {
      d = Math.floor(d / (base - tMin));
      k += base;
    }
    return k + Math.floor(((base - tMin + 1) * d) / (d + skew));
  };
  let n = 128, i = 0, bias = 72;
  const out = [];
  const basic = Math.max(0, input.lastIndexOf('-'));
  for (let j = 0; j < basic; j++) out.push(input.charCodeAt(j));
  for (let idx = basic > 0 ? basic + 1 : 0; idx < input.length; ) {
    const oldi = i;
    let w = 1;
    for (let k = base; ; k += base) {
      if (idx >= input.length) throw new Error('bad punycode');
      const cp = input.charCodeAt(idx++);
      const digit = cp >= 48 && cp <= 57 ? cp - 22 : cp >= 65 && cp <= 90 ? cp - 65 : cp >= 97 && cp <= 122 ? cp - 97 : base;
      if (digit >= base) throw new Error('bad punycode');
      i += digit * w;
      const t = k <= bias ? tMin : k >= bias + tMax ? tMax : k - bias;
      if (digit < t) break;
      w *= base - t;
    }
    const len = out.length + 1;
    bias = adapt(i - oldi, len, oldi === 0);
    n += Math.floor(i / len);
    i %= len;
    out.splice(i++, 0, n);
  }
  return String.fromCodePoint(...out);
}

export function toUnicodeHost(host) {
  return host
    .split('.')
    .map((label) => {
      if (!label.startsWith('xn--')) return label;
      try {
        return punyDecode(label.slice(4));
      } catch {
        return label;
      }
    })
    .join('.');
}

const isIPv4 = (h) => /^\d{1,3}(\.\d{1,3}){3}$/.test(h);
const isPrivateIPv4 = (h) => /^(10\.|127\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.)/.test(h);

function levenshtein(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[a.length][b.length];
}

// "paypa1" -> "paypal", "g00gle" -> "google", "arnazon" -> "amazon"
function leetVariants(label) {
  const base = label.replace(/rn/g, 'm').replace(/vv/g, 'w');
  const map = (s, one) => s.replace(/0/g, 'o').replace(/1/g, one).replace(/3/g, 'e').replace(/4/g, 'a').replace(/5/g, 's').replace(/7/g, 't').replace(/\$/g, 's');
  return [...new Set([map(base, 'l'), map(base, 'i'), map(label, 'l')])];
}

function isOfficial(brand, reg) {
  if (brand.domains.includes(reg.domain)) return true;
  if (!brand.countrySites) return false;
  if (!brand.words.includes(reg.label)) return false;
  const parts = reg.tld.split('.');
  const cc = parts[parts.length - 1];
  if (cc.length !== 2 || ABUSED_CC.has(cc)) return false;
  return parts.length === 1 || (parts.length === 2 && ['co', 'com'].includes(parts[0]));
}

function brandMentioned(host, words) {
  for (const label of host.split('.')) {
    const parts = label.split(/[-_]/);
    for (const w of words) {
      if (parts.includes(w)) return w;
      if (label.includes(w) && PHISH_WORDS.has(label.replace(w, '').replace(/[-_]/g, ''))) return w;
    }
  }
  return null;
}

function add(signals, weight, text) {
  signals.push({ weight, level: weight >= 40 ? 'danger' : weight >= 15 ? 'warn' : 'info', text });
}

/** Looks at one address. Returns { score, signals } and never touches the network. */
export function analyzeUrl({ raw, href, scheme }) {
  const signals = [];

  if (scheme) {
    add(signals, 100, `This is a "${scheme}:" link. Links like this can run code in your browser instead of opening a website.`);
    return { score: 100, signals };
  }

  const url = new URL(href);
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  const path = decodeURIComponentSafe(url.pathname + url.search).toLowerCase();
  const reg = registrable(host);
  const rawHost = (raw.match(/^https?:\/\/(?:[^/@?#]*@)?([^/:?#]+)/i) || [])[1] || host;

  // 1. Tricks with the address itself
  if (url.username || url.password) {
    const lookalike = /[.]/.test(decodeURIComponentSafe(url.username));
    add(signals, lookalike ? 70 : 40, `The address contains an "@". Everything before it is ignored, so the real site is "${host}", not what comes first.${lookalike ? ' The part before it looks like a website name, which is a common trick.' : ''}`);
  }
  if (isIPv4(host)) {
    add(signals, isPrivateIPv4(host) ? 25 : 35, isPrivateIPv4(host) ? 'The link points to a private network address, not a normal website.' : 'The link uses a raw number address instead of a website name. Real services rarely do this.');
  } else if (/^(0x[0-9a-f]+|\d+)$/i.test(rawHost)) {
    add(signals, 45, 'The link hides a number address in an unusual format, a way to disguise where it goes.');
  }
  if (host.split('.').some((l) => l.startsWith('xn--'))) {
    add(signals, 30, `The domain uses look-alike characters from other alphabets (it displays as "${toUnicodeHost(host)}"). Scammers use this to imitate real sites.`);
  }
  if (SHORTENERS.has(reg.domain)) {
    add(signals, 25, 'This is a shortened link, so you cannot see where it really leads. Be careful before opening it.');
  }
  if (url.port && !['80', '443'].includes(url.port)) {
    add(signals, 15, `It uses an unusual port (${url.port}).`);
  }

  // 2. Pretending to be a known brand
  let impersonated = false;
  for (const [name, brand] of Object.entries(BRANDS)) {
    if (isOfficial(brand, reg)) continue;
    const word = brandMentioned(host, brand.words);
    if (word) {
      impersonated = true;
      add(signals, 40, `The name "${word}" appears in the address, but the site itself is "${reg.domain}", which is not a ${name} address we know. Scammers do this to look official.`);
      break;
    }
    const typo = brand.words.find((w) => w.length >= 5 && reg.label !== w && (leetVariants(reg.label).includes(w) || (reg.label.length >= 6 && levenshtein(reg.label, w) === 1)));
    if (typo) {
      impersonated = true;
      const swapped = leetVariants(reg.label).includes(typo);
      add(signals, swapped ? 55 : 40, `"${reg.label}" looks like a misspelling of "${typo}". Look-alike names are a common phishing trick.`);
      break;
    }
  }

  // 3. Weak signals that add up
  const tld = reg.tld.split('.').pop();
  if (RISKY_TLDS.has(tld)) add(signals, 15, `Addresses ending in ".${tld}" are used for scams much more often than average.`);

  const hostWords = [...new Set(host.match(HOST_WORDS) || [])];
  if (hostWords.length) add(signals, Math.min(25, hostWords.length * 10), `The website name contains pressure or login words (${hostWords.join(', ')}).`);
  const pathWords = [...new Set(path.match(PATH_WORDS) || [])];
  if (pathWords.length) add(signals, Math.min(10, pathWords.length * 5), `The link asks you to ${pathWords.slice(0, 3).join(' / ')}.`);

  const labels = host.split('.');
  if (labels.length > 4) add(signals, 15, 'The address has many parts before the main domain, which can bury the real site name.');
  if (host.length > 40) add(signals, 10, 'The website name is unusually long.');
  if ((host.match(/-/g) || []).length >= 3) add(signals, 15, 'The website name has many hyphens, typical of throwaway scam sites.');
  if (reg.label.length >= 6 && (reg.label.match(/\d/g) || []).length / reg.label.length > 0.3) add(signals, 10, 'The website name is mostly numbers.');
  if (href.length > 200) add(signals, 10, 'The link is very long.');
  if ((href.match(/%[0-9a-f]{2}/gi) || []).length > 8) add(signals, 10, 'The link is full of encoded characters, which can hide its real content.');

  const file = url.pathname.split('/').pop() || '';
  if (RISKY_FILES.test(file)) add(signals, 40, `The link downloads a program or installer ("${file.slice(0, 60)}"). Only run these from sources you fully trust.`);
  else if (ARCHIVE_FILES.test(file)) add(signals, 15, 'The link downloads a compressed file, which can hide harmful content.');

  for (const [key, value] of url.searchParams) {
    if (REDIRECT_KEYS.has(key.toLowerCase()) && /^https?:\/\//i.test(value)) {
      add(signals, 20, 'The link passes you on to another website, which is a way to hide the final destination.');
      break;
    }
  }

  if (url.protocol === 'http:') {
    const asksLogin = hostWords.length > 0 || pathWords.length > 0;
    add(signals, asksLogin ? 20 : 10, asksLogin ? 'It does not use HTTPS and asks for login-type actions, so anything you type is not protected.' : 'It does not use HTTPS, so the connection is not encrypted.');
  }

  if (!impersonated && FREE_HOSTING.some((d) => host === d || host.endsWith(`.${d}`))) {
    add(signals, 10, 'It is on a free hosting service. Many real sites are, but so are many throwaway pages.');
  }

  const score = Math.min(100, signals.reduce((n, s) => n + s.weight, 0));
  return { score, signals };
}

export const verdictFor = (score) => (score >= DANGER_AT ? 'dangerous' : score >= WARN_AT ? 'suspicious' : 'ok');

function decodeURIComponentSafe(s) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}
