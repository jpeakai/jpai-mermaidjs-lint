// Every way a run can fail on purpose, as a class that says what went wrong.
// A usage error is the caller's to fix and exits 2. A plugin error exits 1.
// Each class carries a stable `code` and the fields a tool needs to act on it,
// so a wrapper can branch on the type instead of reading the message.

export class MermaidLintError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = new.target.name;
  }
}

// --- usage: the invocation or the config is wrong -------------------------

export class UsageError extends MermaidLintError {
  constructor(message: string, code = "usage") {
    super(code, message);
  }
}

// A flag that is missing or has a value it cannot take.
export class FlagError extends UsageError {
  readonly flag: string;

  constructor(flag: string, message: string) {
    super(message, "flag");
    this.flag = flag;
  }
}

// A config file that cannot be read or parsed, or is the wrong kind of file.
export class ConfigFileError extends UsageError {
  readonly file: string;

  constructor(file: string, message: string) {
    super(`${file}: ${message}`, "config-file");
    this.file = file;
  }
}

// --config named a file that is not there.
export class ConfigNotFoundError extends UsageError {
  readonly path: string;

  constructor(path: string) {
    super(`--config ${path}: no such file`, "config-not-found");
    this.path = path;
  }
}

// Two config files at one root, so neither can be picked.
export class AmbiguousConfigError extends UsageError {
  readonly files: string[];

  constructor(root: string, files: string[]) {
    super(`more than one config file at ${root}: ${files.join(", ")}`, "config-ambiguous");
    this.files = files;
  }
}

// The config parsed, but its top-level shape is wrong.
export class ConfigShapeError extends UsageError {
  readonly file: string;
  readonly key: string | null;

  constructor(file: string, message: string, key: string | null = null) {
    super(`${file}: ${message}`, "config-shape");
    this.file = file;
    this.key = key;
  }
}

// One rule's setting is not a severity, or a severity and options.
export class RuleSettingError extends UsageError {
  readonly file: string;
  readonly rule: string;

  constructor(file: string, rule: string, message: string) {
    super(`${file}: rule "${rule}" ${message}`, "rule-setting");
    this.file = file;
    this.rule = rule;
  }
}

// The config names a rule that is not loaded, which also catches a retired id.
export class UnknownRuleError extends UsageError {
  readonly file: string;
  readonly rule: string;
  readonly known: string[];

  constructor(file: string, rule: string, known: string[]) {
    super(
      `${file}: unknown rule "${rule}"; a retired or misspelt id cannot be switched off. Known rules: ${known.join(", ")}`,
      "unknown-rule",
    );
    this.file = file;
    this.rule = rule;
    this.known = known;
  }
}

// A rule option the rule does not take, or a value of the wrong type or range.
export class RuleOptionError extends UsageError {
  readonly file: string;
  readonly rule: string;
  readonly option: string;

  constructor(file: string, rule: string, option: string, message: string) {
    super(`${file}: ${message}`, "rule-option");
    this.file = file;
    this.rule = rule;
    this.option = option;
  }
}

// --- plugins: a source could not be loaded --------------------------------

// A source that failed to load. `source` is what the user would recognise, a
// package name or a path under the project root.
export class PluginLoadError extends MermaidLintError {
  readonly source: string;

  constructor(source: string, reason: string, code = "plugin") {
    super(code, `plugin ${source}: ${reason}`);
    this.source = source;
  }
}

// The module threw, or could not be found, when it was imported.
export class PluginImportError extends PluginLoadError {
  constructor(source: string, reason: string) {
    super(source, `could not be imported: ${reason}`, "plugin-import");
  }
}

// The module loaded but does not meet the contract: shape, version, namespace,
// category, or a rule's declaration.
export class PluginContractError extends PluginLoadError {
  constructor(source: string, reason: string) {
    super(source, reason, "plugin-contract");
  }
}

// Two plugins claim one namespace or one new category.
export class PluginConflictError extends PluginLoadError {
  readonly other: string;

  constructor(source: string, other: string, reason: string) {
    super(source, reason, "plugin-conflict");
    this.other = other;
  }
}

// A dependency the project declares, or a config lists, that is not installed.
export class PluginNotInstalledError extends PluginLoadError {
  readonly root: string;

  constructor(source: string, root: string) {
    super(
      source,
      `is declared or listed but not installed; looked from ${root} upward. Install it, or remove it`,
      "plugin-not-installed",
    );
    this.root = root;
  }
}

// A file the loader cannot read in this runtime, such as TypeScript on a
// runtime that cannot strip types.
export class PluginSourceError extends PluginLoadError {
  constructor(source: string, reason: string) {
    super(source, reason, "plugin-source");
  }
}

// --- plugins: a loaded plugin misbehaved while running --------------------

// A fixer threw or returned something that is not a list of valid edits.
// Unlike a check, this stops the run, because carrying on after a corrupt edit
// is worse than stopping.
export class PluginFixerError extends MermaidLintError {
  readonly rule: string;

  constructor(rule: string, reason: string) {
    super("plugin-fixer", `plugin rule ${rule} ${reason}`);
    this.rule = rule;
  }
}
