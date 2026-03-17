#!/usr/bin/env node
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// src/cli.ts
var import_commander = require("commander");
var import_chalk = __toESM(require("chalk"));
var import_sdk = require("sdk");
var Table = require("cli-table3");
var program = new import_commander.Command();
program.name("toolhub").description("CLI to interact with the ToolHub AI Tool Registry").version("1.0.0").option("-u, --url <url>", "ToolHub server URL", process.env.TOOLHUB_URL || "http://localhost:3000").option("-t, --token <token>", "Admin Bearer Token", process.env.TOOLHUB_ADMIN_TOKEN || "");
program.command("search <query>").description("Semantic search for tools").action(async (query) => {
  const opts = program.opts();
  const hub = new import_sdk.ToolHub({ baseUrl: opts.url, adminToken: opts.token });
  try {
    console.log(import_chalk.default.blue(`
\u{1F50D} Searching ToolHub for: "${query}"...
`));
    const tools = await hub.search(query, 5);
    if (tools.length === 0) {
      console.log(import_chalk.default.yellow("No matching tools found."));
      return;
    }
    const table = new Table({
      head: [import_chalk.default.cyan("ID / Name"), import_chalk.default.cyan("Category"), import_chalk.default.cyan("Auth"), import_chalk.default.cyan("Score"), import_chalk.default.cyan("Match %")],
      style: { compact: true }
    });
    tools.forEach((t) => {
      table.push([
        `${import_chalk.default.bold(t.name)}
${import_chalk.default.dim(t.id)}`,
        t.category,
        t.auth_type || "none",
        t.security_score.toString(),
        t.semantic_score ? (t.semantic_score * 100).toFixed(1) + "%" : "-"
      ]);
    });
    console.log(table.toString());
    console.log();
  } catch (err) {
    console.error(import_chalk.default.red("\n\u274C Search failed:"), err.message);
  }
});
program.command("info <id>").description("Get detailed info about a specific tool").action(async (id) => {
  const opts = program.opts();
  const hub = new import_sdk.ToolHub({ baseUrl: opts.url, adminToken: opts.token });
  try {
    const tool = await hub.get(id);
    console.log(import_chalk.default.bold.blue(`
\u{1F4E6} ${tool.name} `) + import_chalk.default.dim(`v${tool.version}`));
    console.log(import_chalk.default.cyan("ID:         ") + tool.id);
    console.log(import_chalk.default.cyan("Category:   ") + tool.category);
    console.log(import_chalk.default.cyan("Auth Type:  ") + tool.auth_type);
    console.log(import_chalk.default.cyan("Status:     ") + (tool.status === "degraded" ? import_chalk.default.red(tool.status) : import_chalk.default.green(tool.status)));
    console.log(import_chalk.default.cyan("Score:      ") + tool.security_score + "/100");
    console.log(import_chalk.default.cyan("Usage:      ") + tool.usage_count + " calls");
    console.log(`
${import_chalk.default.italic(tool.description)}
`);
  } catch (err) {
    console.error(import_chalk.default.red("\n\u274C Failed to get tool info:"), err.message);
  }
});
program.parse(process.argv);
//# sourceMappingURL=cli.js.map