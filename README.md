# Repo Sage

Repo Sage is a small CLI agent that analyzes public GitHub repositories with Claude.

Give it a GitHub URL, and it will:

- clone the repo into a temporary directory
- let Claude inspect files through local tools
- feed file and directory results back into the conversation
- print Claude's final repo analysis
- clean up the cloned repo afterward

## Setup

Install dependencies:

```bash
npm install
```

Set your Anthropic API key:

```bash
export ANTHROPIC_API_KEY="your-api-key"
```

## Usage

Run Repo Sage with any public GitHub repository URL:

```bash
npx tsx index.ts https://github.com/owner/repo
```

Example:

```bash
npx tsx index.ts https://github.com/vercel/next.js
```

## How It Works

Repo Sage gives Claude two local tools:

- `read_file`: reads a file from the cloned repository
- `list_directory`: lists files and folders inside a repository directory

Claude decides which files to inspect, the CLI executes those tool calls locally, and the results are sent back to Claude until it has enough context to produce a final analysis.

## Notes

- Repositories are cloned with `--depth 1` for speed.
- Clones are stored temporarily under `/tmp`.
- Empty files and directories are handled explicitly.
- The tool is intended for public repositories.
