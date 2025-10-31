#!/usr/bin/env node
import { randomBytes, webcrypto } from "node:crypto";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { encryptData } from "../shared/crypto/index.ts";
import { GITHUB_APP_PRIVATE_KEY_KV_KEY } from "../shared/githubApp.ts";

type CliOptions = {
  pemPath: string;
  binding: string;
  kvKey: string;
  env?: string;
  secretName: string;
  iterations: number;
  appId?: string;
  installationId?: string;
};

type SpawnOptions = {
  env?: string;
  stdin?: string;
};

const textEncoder = new TextEncoder();

function ensureCrypto(): void {
  if (!globalThis.crypto) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- global assignment for Node runtime
    (globalThis as any).crypto = webcrypto;
  }
}

function parseArgs(argv: string[]): CliOptions {
  const options: Partial<CliOptions> = {
    binding: "GITHUB_APP_KV",
    kvKey: GITHUB_APP_PRIVATE_KEY_KV_KEY,
    secretName: "GH_APP_KEY_PASSWORD",
    iterations: 10000,
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case "--pem":
        options.pemPath = argv[++index];
        break;
      case "--binding":
        options.binding = argv[++index];
        break;
      case "--kv-key":
        options.kvKey = argv[++index];
        break;
      case "--secret":
        options.secretName = argv[++index];
        break;
      case "--env":
        options.env = argv[++index];
        break;
      case "--app-id":
        options.appId = argv[++index];
        break;
      case "--installation-id":
        options.installationId = argv[++index];
        break;
      case "--iterations":
        options.iterations = Number.parseInt(argv[++index] ?? "", 10);
        if (!Number.isFinite(options.iterations) || options.iterations <= 0) {
          throw new Error("Iterations must be a positive integer.");
        }
        break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
        break;
      default:
        throw new Error(
          `Unknown argument "${arg}". Run with --help for usage.`,
        );
    }
  }

  if (!options.pemPath) {
    throw new Error("Missing required --pem argument");
  }

  const normalize = (value?: string): string | undefined => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
  };

  options.appId = normalize(options.appId);
  options.installationId = normalize(options.installationId);

  return options as CliOptions;
}

function buildEnvArgs(env?: string): string[] {
  if (env === undefined) return [];
  return ["--env", env];
}

function printHelp(): void {
  console.log(
    [
      "Usage: npm run upload:github-app-key -- --pem /path/to/private-key.pem [options]",
      "",
      "Options:",
      "  --pem <path>           Path to the GitHub App private key PEM file (required)",
      "  --binding <name>       KV binding to use (default: GITHUB_APP_KV)",
      `  --kv-key <name>        KV key name (default: ${GITHUB_APP_PRIVATE_KEY_KV_KEY})`,
      "  --secret <name>        Worker secret name for the password (default: GH_APP_KEY_PASSWORD)",
      "  --app-id <id>          GitHub App ID to store as GH_APP_ID (optional)",
      "  --installation-id <id> Installation ID to store as GH_INSTALLATION_ID (optional)",
      "  --env <environment>    Wrangler environment to target (omit for default)",
      "  --iterations <count>   PBKDF2 iterations (default: 10000)",
      "",
      "The script encrypts the PEM file, uploads it to the configured KV namespace,",
      "and stores the generated password in the specified Worker secret.",
    ].join("\n"),
  );
}

async function runWrangler(
  args: string[],
  options: SpawnOptions = {},
): Promise<void> {
  const envArgs = buildEnvArgs(options.env);
  const child = spawn("wrangler", [...args, ...envArgs], {
    stdio: options.stdin
      ? ["pipe", "inherit", "inherit"]
      : ["ignore", "inherit", "inherit"],
    env: process.env,
  });

  await new Promise<void>((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            `wrangler ${args.join(" ")} exited with code ${code ?? "null"}`,
          ),
        );
      }
    });

    if (options.stdin) {
      child.stdin?.write(options.stdin);
      child.stdin?.end();
    }
  });
}

function isPkcs8Pem(pem: string): boolean {
  return /-----BEGIN PRIVATE KEY-----/u.test(pem);
}

function looksLikeConvertiblePem(pem: string): boolean {
  return /-----BEGIN (?:RSA|EC|DSA|ENCRYPTED) PRIVATE KEY-----/u.test(pem);
}

async function convertPemToPkcs8(pem: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(
      "openssl",
      ["pkcs8", "-topk8", "-nocrypt", "-inform", "PEM", "-outform", "PEM"],
      { stdio: ["pipe", "pipe", "inherit"] },
    );

    let stdout = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });

    child.on("error", (error) => {
      reject(
        new Error(
          `failed to execute openssl: ${
            error instanceof Error ? error.message : String(error)
          }`,
        ),
      );
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`openssl pkcs8 exited with code ${code ?? "null"}`));
      }
    });

    child.stdin.write(pem);
    child.stdin.end();
  });
}

async function main(): Promise<void> {
  ensureCrypto();
  const options = parseArgs(process.argv);
  let pem = await fs.readFile(options.pemPath, "utf8");

  if (!isPkcs8Pem(pem)) {
    if (!looksLikeConvertiblePem(pem)) {
      throw new Error(
        "Provided PEM is not recognised as a supported private key format.",
      );
    }

    console.log("Converting private key to PKCS#8 format with openssl...");
    pem = await convertPemToPkcs8(pem);

    if (!isPkcs8Pem(pem)) {
      throw new Error("OpenSSL conversion succeeded but output is not PKCS#8.");
    }
  }

  const password = randomBytes(32).toString("base64");
  const plaintext = textEncoder.encode(pem);
  const encrypted = await encryptData(plaintext, password, options.iterations);

  const tempDir = await fs.mkdtemp(join(tmpdir(), "obsidian-github-key-"));
  const payloadPath = join(tempDir, "github-app-key.bin");

  try {
    await fs.writeFile(payloadPath, Buffer.from(encrypted));
    console.log(`Uploading encrypted key to KV key "${options.kvKey}"...`);
    await runWrangler(
      [
        "kv",
        "key",
        "put",
        "--remote",
        "--binding",
        options.binding,
        options.kvKey,
        "--path",
        payloadPath,
      ],
      { env: options.env },
    );

    console.log(`Storing password in Worker secret "${options.secretName}"...`);
    await runWrangler(["secret", "put", options.secretName], {
      env: options.env,
      stdin: `${password}\n`,
    });

    if (options.appId) {
      console.log("Storing GitHub App ID as GH_APP_ID...");
      await runWrangler(["secret", "put", "GH_APP_ID"], {
        env: options.env,
        stdin: `${options.appId}\n`,
      });
    }

    if (options.installationId) {
      console.log("Storing GitHub Installation ID as GH_INSTALLATION_ID...");
      await runWrangler(["secret", "put", "GH_INSTALLATION_ID"], {
        env: options.env,
        stdin: `${options.installationId}\n`,
      });
    }

    console.log(
      "Upload complete. The password has been saved as a Worker secret.",
    );
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(
    `[upload-github-app-key] ${error instanceof Error ? error.message : error}`,
  );
  process.exit(1);
});
