// Looks at the wording of a message for scam and spam patterns. Plain pattern matching, no AI, no network.

const RULES = [
  {
    weight: 40,
    text: 'It asks you to send or confirm secret details such as an OTP, PIN, BVN, password or recovery phrase. Real companies never ask for these in a message.',
    test: (t) => /\b(send|share|provide|give|reply with|enter|confirm|verify|submit|tell us)\b[^.\n]{0,60}\b(otp|bvn|nin|pin|password|passcode|cvv|card number|verification code|seed phrase|recovery phrase|private key|login details)\b/i.test(t),
  },
  {
    weight: 20,
    text: 'It tries to rush you ("urgent", "within 24 hours", "account will be suspended").',
    test: (t) => /\b(urgent(ly)?|immediately|act now|last chance|final (notice|warning)|expires? (today|soon|tonight)|within \d+ ?(hours?|minutes?|mins?)|(account|card|wallet) (will be |has been |is )?(suspended|blocked|closed|locked|deactivated|restricted|limited))\b/i.test(t),
  },
  {
    weight: 30,
    text: 'It says you won a prize or were selected for something you did not enter.',
    test: (t) => /\b(congratulations|you('ve| have)? (won|been selected|been chosen)|lucky winner|lottery|jackpot|claim your (prize|reward|gift|bonus)|free (gift|money|airtime|data|iphone|laptop))\b/i.test(t),
  },
  {
    weight: 30,
    text: 'It asks for a fee or gift cards before you can receive money or something valuable.',
    test: (t) => /\b(processing fee|clearance fee|registration fee|activation fee|release fee|western union|moneygram|gift ?cards?|itunes card|google play card)\b/i.test(t),
  },
  {
    weight: 30,
    text: 'It promises guaranteed profit or money that multiplies. Real investments cannot guarantee returns.',
    test: (t) => /\b(guaranteed (returns?|profits?|income)|double your (money|investment|bitcoin|crypto)|100% (profit|return|safe)|risk[- ]free|daily (profit|returns?)|investment plan|crypto doubl|forex signals?)\b/i.test(t),
  },
  {
    weight: 20,
    text: 'It promises easy money for little effort.',
    test: (t) => /\b(earn \$?[\d,]+ ?(daily|per day|a day|weekly|per week)|make money (online|fast|from home)|work from home|no experience (needed|required)|be your own boss|passive income)\b/i.test(t),
  },
  {
    weight: 20,
    text: 'It claims a parcel, delivery or payment is stuck and needs action from you.',
    test: (t) => /\b((parcel|package|delivery|shipment|payment|transfer) (is |has been )?(on hold|held|failed|pending|returned|unsuccessful)|customs (fee|charge|duty))\b/i.test(t),
  },
  {
    weight: 10,
    text: 'It pushes you to click a link straight away.',
    test: (t) => /\b(click (here|the link|below|this link)|tap (here|the link)|open (the|this) link|follow (the|this) link|visit (the|this) link)\b/i.test(t),
  },
  {
    weight: 10,
    text: 'It claims to come from an official body (bank, tax office, customs, police or a government agency).',
    test: (t) => /\b(central bank|cbn|efcc|nnpc|irs|fbi|interpol|customs service|inland revenue|nimc|your bank)\b/i.test(t),
  },
  {
    weight: 10,
    text: 'It mentions a very large amount of money.',
    test: (t) => /(₦|\$|£|€|NGN|USD|GBP)\s?\d{1,3}(,\d{3}){2,}/i.test(t),
  },
  {
    weight: 10,
    text: 'It is mostly in capital letters.',
    test: (t) => {
      const letters = t.replace(/[^a-z]/gi, '');
      return letters.length >= 40 && (t.replace(/[^A-Z]/g, '').length / letters.length) > 0.5;
    },
  },
  {
    weight: 5,
    text: 'It uses lots of exclamation marks.',
    test: (t) => (t.match(/!/g) || []).length >= 3,
  },
];

/** Returns { score, verdict: 'spam' | 'suspicious' | 'ok', reasons: [string] } */
export function analyzeMessage(text) {
  const reasons = [];
  let score = 0;
  for (const rule of RULES) {
    if (rule.test(text)) {
      score += rule.weight;
      reasons.push(rule.text);
    }
  }
  score = Math.min(100, score);
  return { score, verdict: score >= 50 ? 'spam' : score >= 25 ? 'suspicious' : 'ok', reasons };
}
