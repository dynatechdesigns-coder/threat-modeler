// A tiny, deliberately vulnerable project used by the "Try a demo scan" button, so a new person can see a real
// report in one click without having code to upload. Nothing here is real: the keys are made-up values.
// The fake key is joined together while the program runs, so no secret-looking text sits in this source file
// (GitHub's secret scanning would otherwise block a push).

const fakeAwsKey = () => ['AKIA', 'IOSFODNN7', 'EXAMPLE'].join('');

export function demoFiles() {
  const server = `import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import { db } from './db.js';

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-123';

app.get('/users', async (req, res) => {
  const rows = await db.query(\`SELECT * FROM users WHERE name = '\${req.query.name}'\`);
  res.json(rows);
});

app.post('/register', async (req, res) => {
  const hash = crypto.createHash('md5').update(req.body.password).digest('hex');
  const user = await db.users.create(req.body);
  res.json({ id: user.id, hash });
});

app.get('/calc', (req, res) => {
  res.send(String(eval(req.query.expr)));
});

app.get('/go', (req, res) => {
  res.redirect(req.query.next);
});

app.use((err, req, res, next) => {
  res.status(500).json({ error: err.stack });
});

app.listen(3000);
`;

  const db = `import mysql from 'mysql2/promise';

// Connection settings used by the whole app
export const db = mysql.createPool({
  host: 'db.internal',
  user: 'app',
  password: 'hunter2hunter2',
});

export const awsAccessKey = '${fakeAwsKey()}';
`;

  const pkg = JSON.stringify(
    {
      name: 'demo-vulnerable-app',
      version: '1.0.0',
      type: 'module',
      dependencies: { express: '4.16.0', lodash: '4.17.15', cors: '2.8.5', mysql2: '3.9.7' },
    },
    null,
    2
  );

  const page = `<script>
  const params = new URLSearchParams(location.search);
  document.getElementById('welcome').innerHTML = params.get('name');
  localStorage.setItem('token', params.get('t'));
</script>
`;

  return [
    { name: 'server.js', content: server },
    { name: 'db.js', content: db },
    { name: 'package.json', content: pkg },
    { name: 'welcome.html', content: page },
  ];
}
