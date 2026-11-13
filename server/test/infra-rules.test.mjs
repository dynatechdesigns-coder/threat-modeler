import test from "node:test";
import assert from "node:assert/strict";
import { runStaticRules } from "../src/services/scanner/agent/staticRules.js";
import { loadSources } from "../src/services/scanner/agent/fileLoader.js";

const run = (path, code) =>
  runStaticRules([
    {
      path,
      ext: path.split(".").pop(),
      content: code,
      lines: code.split("\n"),
    },
  ]);
const ids = (path, code) => run(path, code).map((f) => f.ruleId);

const WF = ".github/workflows/ci.yml";

test("workflow: script injection and pwn request", () => {
  assert.ok(
    ids(WF, 'steps:\n  - run: echo "${{ github.event.issue.title }}"').includes(
      "gha-script-injection",
    ),
  );
  assert.ok(
    ids(WF, 'steps:\n  - run: |\n      echo "${{ github.head_ref }}"').includes(
      "gha-script-injection",
    ),
  );
  // the safe pattern: value goes through env
  assert.ok(
    !ids(
      WF,
      'steps:\n  - run: echo "$TITLE"\n    env:\n      TITLE: ${{ github.event.issue.title }}',
    ).includes("gha-script-injection"),
  );
  const pwn =
    "on: pull_request_target\njobs:\n  a:\n    steps:\n      - uses: actions/checkout@v4\n        with:\n          ref: ${{ github.event.pull_request.head.sha }}";
  assert.ok(ids(WF, pwn).includes("gha-pwn-request"));
  assert.ok(
    !ids(WF, pwn.replace("pull_request_target", "pull_request")).includes(
      "gha-pwn-request",
    ),
  );
});

test("workflow: permissions and unpinned actions", () => {
  assert.ok(ids(WF, "permissions: write-all").includes("gha-write-all"));
  assert.ok(
    !ids(WF, "permissions:\n  contents: read").includes("gha-write-all"),
  );
  assert.ok(
    ids(WF, "- uses: some-org/act@main").includes("gha-unpinned-action"),
  );
  assert.ok(
    !ids(WF, "- uses: some-org/act@v3").includes("gha-unpinned-action"),
  );
  assert.ok(!ids(WF, "- uses: ./local-action").includes("gha-unpinned-action"));
});

test("workflow rules do not fire on ordinary yaml", () => {
  assert.deepEqual(
    ids("config/app.yml", "permissions: write-all\nuses: a/b@main"),
    [],
  );
});

test("dockerfile rules", () => {
  const bad =
    'FROM node\nENV DB_PASSWORD=supersecret1\nCOPY .env /app/.env\nADD https://x.io/a.tgz /a\nRUN curl -s https://x.io/i.sh | sh\nCMD ["node","a.js"]';
  const got = ids("Dockerfile", bad);
  for (const id of [
    "docker-root-user",
    "docker-unpinned-image",
    "docker-secret-env",
    "docker-copy-env",
    "docker-add-remote",
    "curl-pipe-shell",
  ])
    assert.ok(got.includes(id), id);
  const good =
    'FROM node:20.11-alpine AS build\nRUN npm ci\nFROM build AS final\nARG TOKEN\nENV PORT=3000\nCOPY .env.example /a/\nRUN adduser -D app\nUSER app\nCMD ["node","a.js"]';
  assert.deepEqual(ids("Dockerfile", good), []);
  assert.deepEqual(ids("Dockerfile.prod", good), []);
  // multi-stage: only the final stage must drop root
  assert.ok(
    !ids(
      "Dockerfile",
      "FROM node:20 AS b\nRUN x\nFROM nginx:1.25\nUSER nginx",
    ).includes("docker-root-user"),
  );
  assert.ok(
    ids("Dockerfile", "FROM node:20\nUSER root").includes("docker-root-user"),
  );
  assert.ok(
    !ids("Dockerfile", "FROM scratch\nUSER 1000").includes(
      "docker-unpinned-image",
    ),
  );
});

test("terraform rules", () => {
  const bad =
    'resource "aws_security_group" "a" {\n  ingress {\n    from_port = 22\n    cidr_blocks = ["0.0.0.0/0"]\n  }\n  egress {\n    cidr_blocks = ["0.0.0.0/0"]\n  }\n}\nresource "aws_s3_bucket" "b" {\n  acl = "public-read"\n}\nresource "aws_db_instance" "d" {\n  publicly_accessible = true\n  storage_encrypted = false\n  password = "hunter2hunter2"\n}';
  const got = run("main.tf", bad);
  for (const id of [
    "tf-open-ingress",
    "tf-public-storage",
    "tf-public-database",
    "tf-unencrypted",
  ])
    assert.ok(
      got.some((f) => f.ruleId === id),
      id,
    );
  // a literal password is reported once per line, by whichever secret rule sees it first
  assert.ok(got.some((f) => f.category === "Secrets" && f.line === 16));
  assert.equal(
    got.filter((f) => f.ruleId === "tf-open-ingress").length,
    1,
    "egress is not flagged",
  );
  const good =
    'resource "aws_db_instance" "d" {\n  publicly_accessible = false\n  storage_encrypted = true\n  password = var.db_password\n}\nresource "aws_s3_bucket" "b" { acl = "private" }';
  assert.deepEqual(ids("main.tf", good), []);
});

test("kubernetes rules", () => {
  const head = "apiVersion: apps/v1\nkind: Deployment\nspec:\n";
  const bad =
    head +
    '  hostNetwork: true\n  containers:\n    - name: a\n      image: nginx\n      securityContext:\n        privileged: true\n        runAsUser: 0\n      env:\n        - name: DB_PASSWORD\n          value: "hunter2hunter2"\n  volumes:\n    - hostPath:\n        path: /var/run/docker.sock';
  const got = ids("deploy.yaml", bad);
  for (const id of [
    "k8s-privileged",
    "k8s-host-access",
    "k8s-run-as-root",
    "k8s-docker-socket",
    "k8s-unpinned-image",
    "k8s-secret-literal",
  ])
    assert.ok(got.includes(id), id);
  const good =
    head +
    "  containers:\n    - name: a\n      image: nginx:1.25\n      securityContext:\n        runAsNonRoot: true\n        allowPrivilegeEscalation: false\n      env:\n        - name: DB_PASSWORD\n          valueFrom:\n            secretKeyRef: { name: db, key: pw }";
  assert.deepEqual(ids("deploy.yaml", good), []);
  // a yaml file that is not Kubernetes is left alone
  assert.deepEqual(ids("app.yaml", "privileged: true\nimage: nginx"), []);
});

test("the loader reads Dockerfile variants and workflow files", async () => {
  const files = [
    "Dockerfile",
    "api/Dockerfile.prod",
    "web.dockerfile",
    ".github/workflows/ci.yml",
  ].map((n) => ({ key: n, originalName: n }));
  const { sources } = await loadSources({
    files,
    readFile: async () => Buffer.from("FROM node:20\n"),
  });
  assert.equal(sources.length, 4);
});
