/**
 * Argument parsing. Pure and synchronous: argv in, options out, CliError on
 * anything malformed — the CLI turns that into exit code 2.
 */
import { isValidIsoDate, todayIso } from "./dates.js";
import { PROVIDERS } from "./registry.js";
import { VERSION } from "./version.js";
import type { Provider } from "./types.js";

export class CliError extends Error {}

export interface ScanCommand {
  command: "scan";
  paths: string[];
  at: string;
  withinDays: number;
  format: "text" | "json";
  strict: boolean;
  quiet: boolean;
  allow: Set<string>;
}

export interface ModelsCommand {
  command: "models";
  at: string;
  provider?: Provider;
  status?: "active" | "deprecated" | "retired";
}

export interface ExplainCommand {
  command: "explain";
  model: string;
  at: string;
}

export interface HelpCommand {
  command: "help";
}

export interface VersionCommand {
  command: "version";
}

export type CliCommand = ScanCommand | ModelsCommand | ExplainCommand | HelpCommand | VersionCommand;

export const HELP_TEXT = `modelsweep ${VERSION} — preflight scan for deprecated model ids and invalid parameters

USAGE
  modelsweep scan [paths...]      scan files/directories (default: .)
  modelsweep models               print the vendored deprecation table
  modelsweep explain <model-id>   full lifecycle + parameter rules for one id

SCAN OPTIONS
  --at <YYYY-MM-DD>     evaluate lifecycles at this date (default: today)
  --within <days>       escalate scheduled shutdowns within N days to errors (default: 90)
  --format text|json    report format (default: text)
  --strict              warnings also fail the run (exit 1)
  --allow <model-id>    suppress model-level findings for an id (repeatable)
  -q, --quiet           dataset and summary lines only

MODELS OPTIONS
  --provider <name>     filter by provider (openai, anthropic, google, mistral, cohere)
  --status <s>          filter by derived status (active, deprecated, retired)
  --at <YYYY-MM-DD>     derive statuses at this date (default: today)

GENERAL
  -h, --help            show this help
  -v, --version         print the version

EXIT CODES
  0  no errors (warnings allowed unless --strict)
  1  findings at error severity (or warnings with --strict)
  2  usage or I/O error
`;

function takeValue(argv: readonly string[], index: number, flag: string): string {
  const value = argv[index];
  if (value === undefined || value.startsWith("-")) {
    throw new CliError(`${flag} expects a value`);
  }
  return value;
}

function parseAt(value: string): string {
  if (!isValidIsoDate(value)) {
    throw new CliError(`--at expects a YYYY-MM-DD date, got "${value}"`);
  }
  return value;
}

/** Parse process argv (minus node and script) into a command. */
export function parseCliArgs(argv: readonly string[]): CliCommand {
  if (argv.length === 0) return { command: "help" };

  const head = argv[0] as string;
  if (head === "-h" || head === "--help" || head === "help") return { command: "help" };
  if (head === "-v" || head === "--version" || head === "version") return { command: "version" };

  if (head === "scan") {
    const options: ScanCommand = {
      command: "scan",
      paths: [],
      at: todayIso(),
      withinDays: 90,
      format: "text",
      strict: false,
      quiet: false,
      allow: new Set(),
    };
    for (let i = 1; i < argv.length; i++) {
      const arg = argv[i] as string;
      switch (arg) {
        case "--at":
          options.at = parseAt(takeValue(argv, ++i, "--at"));
          break;
        case "--within": {
          const raw = takeValue(argv, ++i, "--within");
          const days = Number(raw);
          if (!Number.isInteger(days) || days < 0) {
            throw new CliError(`--within expects a non-negative integer, got "${raw}"`);
          }
          options.withinDays = days;
          break;
        }
        case "--format": {
          const format = takeValue(argv, ++i, "--format");
          if (format !== "text" && format !== "json") {
            throw new CliError(`--format expects "text" or "json", got "${format}"`);
          }
          options.format = format;
          break;
        }
        case "--strict":
          options.strict = true;
          break;
        case "--allow":
          options.allow.add(takeValue(argv, ++i, "--allow"));
          break;
        case "-q":
        case "--quiet":
          options.quiet = true;
          break;
        default:
          if (arg.startsWith("-")) throw new CliError(`unknown flag "${arg}"`);
          options.paths.push(arg);
      }
    }
    if (options.paths.length === 0) options.paths.push(".");
    return options;
  }

  if (head === "models") {
    const options: ModelsCommand = { command: "models", at: todayIso() };
    for (let i = 1; i < argv.length; i++) {
      const arg = argv[i] as string;
      switch (arg) {
        case "--at":
          options.at = parseAt(takeValue(argv, ++i, "--at"));
          break;
        case "--provider": {
          const provider = takeValue(argv, ++i, "--provider");
          if (!(PROVIDERS as readonly string[]).includes(provider)) {
            throw new CliError(`--provider expects one of ${PROVIDERS.join(", ")}, got "${provider}"`);
          }
          options.provider = provider as Provider;
          break;
        }
        case "--status": {
          const status = takeValue(argv, ++i, "--status");
          if (status !== "active" && status !== "deprecated" && status !== "retired") {
            throw new CliError(`--status expects active, deprecated or retired, got "${status}"`);
          }
          options.status = status;
          break;
        }
        default:
          throw new CliError(`unknown argument "${arg}" for models`);
      }
    }
    return options;
  }

  if (head === "explain") {
    let model: string | undefined;
    let at = todayIso();
    for (let i = 1; i < argv.length; i++) {
      const arg = argv[i] as string;
      if (arg === "--at") {
        at = parseAt(takeValue(argv, ++i, "--at"));
      } else if (arg.startsWith("-")) {
        throw new CliError(`unknown flag "${arg}"`);
      } else if (model === undefined) {
        model = arg;
      } else {
        throw new CliError("explain expects exactly one model id");
      }
    }
    if (model === undefined) throw new CliError("explain expects a model id");
    return { command: "explain", model, at };
  }

  throw new CliError(`unknown command "${head}"`);
}
