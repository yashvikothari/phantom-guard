#!/usr/bin/env node
import { main } from './main.js';
import { createProcessIo } from './process-io.js';

// Set the exit code instead of calling process.exit(), so buffered output is flushed.
process.exitCode = await main(process.argv.slice(2), createProcessIo());
