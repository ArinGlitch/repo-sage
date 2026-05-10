import { execFileSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

type OllamaToolCall = {
    type?: "function";
    function: {
        index?: number;
        name: string;
        description?: string;
        arguments?: Record<string, unknown> | string;
    };
};

type OllamaMessage = {
    role: "user" | "assistant" | "tool";
    content?: string;
    tool_name?: string;
    tool_calls?: OllamaToolCall[];
};

type OllamaChatResponse = {
    message?: OllamaMessage;
    error?: string;
};

const OLLAMA_HOST = (process.env.OLLAMA_HOST ?? "http://localhost:11434").replace(/\/$/, "");
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "gemma4:26b";
const MAX_AGENT_STEPS = 30;
const repoUrl = process.argv[2];

if (!repoUrl) {
    console.error("Usage: npx tsx index.ts <github-url>");
    process.exit(1);
}

const REPO_PATH = fs.mkdtempSync(path.join(os.tmpdir(), "repo-sage-"));

const tools = [
    {
        type: "function",
        function: {
            name: "read_file",
            description: "Read the contents of a file in the repo",
            parameters: {
                type: "object",
                properties: {
                    path: { type: "string", description: "File path relative to repo root" }
                },
                required: ["path"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "list_directory",
            description: "List files and folders in a directory",
            parameters: {
                type: "object",
                properties: {
                    path: { type: "string", description: "Directory path relative to repo root" }
                },
                required: ["path"]
            }
        }
    }
] as const;

function resolveRepoPath(relativePath: string): string {
    const repoRoot = path.resolve(REPO_PATH);
    const fullPath = path.resolve(REPO_PATH, relativePath);

    if (fullPath !== repoRoot && !fullPath.startsWith(repoRoot + path.sep)) {
        throw new Error(`Path escapes repo root: ${relativePath}`);
    }

    return fullPath;
}

function read_file(filePath: string): string {
    try {
        const fullPath = resolveRepoPath(filePath);
        const content = fs.readFileSync(fullPath, "utf-8");
        return content.trim() || "File is empty";
    } catch {
        return `Error: could not read ${filePath}`;
    }
}

function list_directory(dirPath: string): string {
    try {
        const fullPath = resolveRepoPath(dirPath);
        const entries = fs.readdirSync(fullPath).join("\n");
        return entries.trim() || "Directory is empty";
    } catch {
        return `Error: could not list ${dirPath}`;
    }
}

function parseToolArguments(toolCall: OllamaToolCall): Record<string, unknown> {
    const args = toolCall.function.arguments ?? {};

    if (typeof args === "string") {
        try {
            return JSON.parse(args) as Record<string, unknown>;
        } catch {
            return {};
        }
    }

    return args;
}

function runTool(toolCall: OllamaToolCall): string {
    const args = parseToolArguments(toolCall);
    const requestedPath = typeof args.path === "string" ? args.path : "";

    if (!requestedPath) {
        return "Error: tool call is missing a string path argument";
    }

    switch (toolCall.function.name) {
        case "read_file":
            return read_file(requestedPath);
        case "list_directory":
            return list_directory(requestedPath);
        default:
            return `Error: unknown tool ${toolCall.function.name}`;
    }
}

async function chat(messages: OllamaMessage[]): Promise<OllamaMessage> {
    let response: Response;

    try {
        response = await fetch(`${OLLAMA_HOST}/api/chat`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                model: OLLAMA_MODEL,
                messages,
                tools,
                stream: false
            })
        });
    } catch (error) {
        throw new Error(`Could not connect to Ollama at ${OLLAMA_HOST}. Is Ollama running?`, {
            cause: error
        });
    }

    if (!response.ok) {
        const body = await response.text();
        throw new Error(`Ollama request failed (${response.status} ${response.statusText}): ${body}`);
    }

    const data = (await response.json()) as OllamaChatResponse;

    if (data.error) {
        throw new Error(`Ollama error: ${data.error}`);
    }

    if (!data.message) {
        throw new Error("Ollama response did not include a message");
    }

    return data.message;
}

async function main(): Promise<void> {
    execFileSync("git", ["clone", "--depth", "1", repoUrl, REPO_PATH], { stdio: "ignore" });

    const messages: OllamaMessage[] = [
        { role: "user", content: "Analyze this repo. Start by reading the README." }
    ];

    for (let step = 0; step < MAX_AGENT_STEPS; step += 1) {
        const assistantMessage = await chat(messages);
        messages.push(assistantMessage);

        const toolCalls = assistantMessage.tool_calls ?? [];
        if (toolCalls.length === 0) {
            console.log(assistantMessage.content?.trim() || "No final text returned.");
            return;
        }

        for (const toolCall of toolCalls) {
            messages.push({
                role: "tool",
                tool_name: toolCall.function.name,
                content: runTool(toolCall)
            });
        }
    }

    console.error(`Stopped after ${MAX_AGENT_STEPS} agent steps without a final answer.`);
    process.exitCode = 1;
}

try {
    await main();
} finally {
    fs.rmSync(REPO_PATH, { recursive: true, force: true });
}
