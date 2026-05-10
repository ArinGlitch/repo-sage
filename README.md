# Repo Sage

Repo Sage is a small CLI agent that analyzes public GitHub repositories with a local Ollama model.

Give it a GitHub URL, and it will:

- clone the repo into a temporary directory
- let the model inspect files through local tools
- feed file and directory results back into the conversation
- print the model's final repo analysis
- clean up the cloned repo afterward

## Setup

Install dependencies:

```bash
npm install
```

Make sure Ollama is running and the local model is available:

```powershell
ollama pull gemma4:26b
```

By default the CLI uses `http://localhost:11434` and `gemma4:26b`.
You can override those in PowerShell:

```powershell
$env:OLLAMA_HOST="http://localhost:11434"
$env:OLLAMA_MODEL="gemma4:26b"
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

Repo Sage gives the model two local tools:

- `read_file`: reads a file from the cloned repository
- `list_directory`: lists files and folders inside a repository directory

The model decides which files to inspect, the CLI executes those tool calls locally, and the results are sent back to Ollama until it has enough context to produce a final analysis.

## Notes

- Repositories are cloned with `--depth 1` for speed.
- Clones are stored temporarily in your operating system's temp directory.
- Empty files and directories are handled explicitly.
- The tool is intended for public repositories.
