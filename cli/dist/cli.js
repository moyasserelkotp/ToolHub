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
var import_axios = __toESM(require("axios"));
var import_inquirer = __toESM(require("inquirer"));
var import_ora = __toESM(require("ora"));
var import_socket = require("socket.io-client");
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
program.command("register").description("Import tools from an OpenAPI spec").requiredOption("--url <url>", "URL to the OpenAPI specification").action(async (options) => {
  const opts = program.opts();
  const serverUrl = opts.url || process.env.TOOLHUB_URL || "http://localhost:3000";
  const specUrl = options.url;
  const { confirm } = await import_inquirer.default.prompt([
    {
      type: "confirm",
      name: "confirm",
      message: `This will fetch ${specUrl} and register all endpoints as AI tools. Proceed?`,
      default: true
    }
  ]);
  if (!confirm) {
    console.log(import_chalk.default.dim("Operation cancelled by user."));
    return;
  }
  const spinner = (0, import_ora.default)("Analyzing spec & registering tools...").start();
  try {
    const res = await import_axios.default.post(`${serverUrl}/tools/import-openapi`, { spec_url: specUrl }, { headers: { "Authorization": `Bearer ${opts.token}` } });
    spinner.succeed("Import process completed!");
    console.log(import_chalk.default.green(`
\u2705 Successfully arrayed ${res.data.imported || 0} tools.`));
    if (res.data.skipped > 0) {
      console.log(import_chalk.default.yellow(`\u26A0\uFE0F  Skipped ${res.data.skipped} tools (duplicates or low security score).`));
    }
  } catch (err) {
    spinner.fail("Failed to process OpenAPI spec");
    console.error(import_chalk.default.red(err.response?.data?.error || err.message));
  }
});
program.command("logs").description("Stream real-time invocation logs from ToolHub").option("--tail", "Tail the live feed indefinitely", false).action((options) => {
  const opts = program.opts();
  const serverUrl = opts.url || process.env.TOOLHUB_URL || "http://localhost:3000";
  console.log(import_chalk.default.blue(`
\u{1F4E1} Connecting to live log stream at ${serverUrl}...`));
  const socket = (0, import_socket.io)(serverUrl);
  socket.on("connect", () => {
    console.log(import_chalk.default.green("\u2705 Connected. Waiting for tool invocations...\n"));
  });
  socket.on("live_call", (data) => {
    const statusStr = data.success ? import_chalk.default.bgGreen.black(" OK ") : import_chalk.default.bgRed.white(" ERR ");
    const latencyStr = `[${data.latency_ms}ms]`;
    console.log(`${import_chalk.default.dim(new Date(data.timestamp).toLocaleTimeString())}  ${statusStr}  ${import_chalk.default.cyan(latencyStr.padEnd(8))}  ${import_chalk.default.bold(data.tool_name)}  ${import_chalk.default.dim("by")} ${data.agent_id}`);
  });
  socket.on("tool_registered", (data) => {
    console.log(`${import_chalk.default.bgBlue.white(" NEW ")}  ${import_chalk.default.bold(data.name)}  ${import_chalk.default.dim("in cat:")} ${data.category}`);
  });
  socket.on("disconnect", () => {
    console.log(import_chalk.default.yellow("\n\u26A0\uFE0F  Disconnected from server. Retrying..."));
  });
});
program.parse(process.argv);
//# sourceMappingURL=cli.js.map