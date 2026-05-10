import Anthropic from "@anthropic-ai/sdk";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

const client = new Anthropic();
const repoUrl = process.argv[2];

if (!repoUrl) {
    console.error("Usage: npx tsx index.ts <github-url>");
    process.exit(1);
}

const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
const REPO_PATH = path.join("/tmp", `repo-sage-${Date.now()}`);
execSync(`git clone --depth 1 ${quote(repoUrl)} ${quote(REPO_PATH)}`, { stdio: "ignore" });

// Tool that claude can call
function read_file(filePath: string): string {
    const fullPath = path.join(REPO_PATH, filePath);
    try {
        const content = fs.readFileSync(fullPath, "utf-8");
        return content.trim() || "File is empty";
    } catch {
        return `Error: could not read ${filePath}`;
    }
}

// Tool to get inside directories
function list_directory(dirPath: string): string {
    const fullPath = path.join(REPO_PATH, dirPath);
    try {
        const entries = fs.readdirSync(fullPath).join("\n");
        return entries.trim() || "Directory is empty";
    } catch {
        return `Error: could not list ${dirPath}`;
    }
}

// The agentic loop
const messages: Anthropic.MessageParam[] = [
    { role: "user", content: "Analyze this repo. Start by reading the README." }
];

while (true) {
    const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    tools: [
        {
            name: "read_file",
            description: "Read the contents of a file in the repo",
            input_schema: {
                type: "object" as const,
                properties: {
                    path: { type: "string", description: "File path relative to repo root" }
                },
                required: ["path"]
            }
        },
        {
            name: "list_directory",
            description: "List files and folders in a directory",
            input_schema: {
                type: "object" as const,
                properties: {
                    path: { type: "string", description: "Directory path relative to repo root" }
                },
                required: ["path"]
            }
        }
    ],
    messages
    });

    // Adding Claude's response to the message history
    messages.push({ role: "assistant", content: response.content });

    // If Claude is done print and exit
    if (response.stop_reason === "end_turn") {
        const finalText = response.content.find(b => b.type === "text");
        if (finalText && finalText.type === "text") console.log(finalText.text);
        break;
    }

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of response.content) {
        if (block.type === "tool_use" && block.name === "read_file") {
            const result = read_file((block.input as { path: string }).path);
            toolResults.push({
                type: "tool_result",
                tool_use_id: block.id,
                content: result
            });
        }

        if (block.type === "tool_use" && block.name === "list_directory") {
            const result = list_directory((block.input as { path: string }).path);
            toolResults.push({
                type: "tool_result",
                tool_use_id: block.id,
                content: result
            });
        }
    }

    // If no tool results were collected, Claude is done
    if (toolResults.length === 0) {
    const finalText = response.content.find(b => b.type === "text");
    if (finalText && finalText.type === "text") console.log(finalText.text);
    break;
    }

    // Feed results back to Claude
    messages.push({ role: "user", content: toolResults });
}

execSync(`rm -rf ${quote(REPO_PATH)}`);
