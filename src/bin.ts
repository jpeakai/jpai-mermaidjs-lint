#!/usr/bin/env node
import { describeError, main } from "./cli.ts";

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error(describeError(err));
    process.exit(1);
  },
);
