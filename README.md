# ChatGPT On Steroids ✳️

> [!NOTE]
> This project uses ChatGPT’s official connector feature. It follows ChatGPT’s rules and should not get your account banned.
>
> Everything runs on your computer and on your own Cloudflare account. We have no server and we don't collect data. ChatGPT sees a file only when the agent reads it in your chat.

A custom MCP connector that lets ChatGPT work on your own computer. It can read and search files, write and edit them, and run shell commands.

Every call runs right away with your user's rights, on any folder your account can reach.
A local panel shows each call as it happens.

ChatGPT reaches the server over a small relay on your own free Cloudflare account, so the connector URL never changes. There is no browser extension and no chat scraping.

![The local panel](screenshots/panel.png)

Availability depends on your ChatGPT plan/workspace. Where supported, the add form is at `chatgpt.com/plugins?directoryTab=personal` (Plugins → **Add** (top right) → custom MCP server, **Connection: Server URL**, **Authentication: No authentication**).

## Getting started

Open the folder for your system and use its three files.

| Folder | First time | Start | Stop |
| --- | --- | --- | --- |
| `For-Windows` | `setup.bat` | `start.bat` | `stop.bat` |
| `For-macOS` | `setup.command` | `start.command` | `stop.command` |
| `For-Linux` | `bash setup.sh` | `bash start.sh` | `bash stop.sh` |

Setup installs Node.js, or updates it to the newest patched release from nodejs.org, then the packages the project needs. Run it again any time to pick up Node.js security releases. Start opens the panel in your browser. Its "How to connect" guide walks you through the permanent address and adding the connector in ChatGPT.

On a Mac, run `chmod +x For-macOS/*.command` once in Terminal first, because the files on GitHub do not carry their run permission. If macOS blocks a file, right click it and choose Open. Mac and Linux support is new and not tested yet.

## Permissions

ChatGPT may ask "Reply yes to proceed" in the chat before a change. That is ChatGPT's own rule, and the connector cannot turn it off. The connector itself asks nothing and has no folder limit. A path without a folder starts from your home folder.

## Tools

| Tool | What it does |
| --- | --- |
| `cgt_ping`, `cgt_list_dir`, `cgt_read_file`, `cgt_search` | read and search |
| `cgt_write_file`, `cgt_edit_file`, `cgt_copy_file`, `cgt_move_file`, `cgt_make_dir` | change files (write returns `bytes`, `sha256(first 8)`, `verified`) |
| `cgt_delete_file` | delete a file or folder |
| `cgt_exec_command` | run a shell command |
| `cgt_batch` | run up to 20 calls in one request |
| `cgt_list_sessions`, `cgt_session_log` | read the call history |

## Security

 - The connector URL is `https://<relay>/<id>/mcp/<secret>` — the 64 hex chars are the secret. Treat the whole URL like a password. If it leaks, press **Rotate address** and paste the new URL.
 - If ChatGPT appends `/mcp` once more (`…/<secret>/mcp`), the connector still accepts it.
 - The relay path is only `/mcp/<secret>` (and the tolerant `/mcp/<secret>/mcp`), so a chat can't ask for a different path.
- Anyone with the URL can read, change and delete your files and run commands as your user, with nothing to stop them.
- The panel listens on `127.0.0.1` only and needs the key in its URL.
- The relay runs in your own Cloudflare account and stores only a hash of the secret. Set `CGT_TOKEN` to also require `Authorization: Bearer <token>` (ChatGPT's custom MCP form currently offers no API key option, so leave it unset when connecting from ChatGPT).

## License

PolyForm Strict 1.0.0. See [LICENSE.md](LICENSE.md). You may download and use the software for personal and other noncommercial purposes. You may not change it, build on it, share copies of it, sell it or use it commercially.

## About

Some parts of this project were made with help from AI tools. I guided and checked all of the work and made every final decision.

## How to connect ChatGPT (same steps as in the panel)

1. Start the server and open the panel.
2. **Get a permanent address** (one Cloudflare login, creates a free worker on your account).
3. **Copy URL**.
4. In ChatGPT: **Plugins** (`chatgpt.com/plugins?directoryTab=personal`) → **Add** (top right) → custom MCP server → paste the URL under **Connection > Server URL**, set **Authentication** to **No authentication**, tick **I understand and want to continue**, press **Create as a plugin**.
5. In a chat type **`@`** and pick **ChatGPT On Steroids**. First write: ChatGPT shows its own confirmation; **Allow** once or for the conversation.
6. If the tool list seems stale, **Refresh/Rescan** in ChatGPT’s connectors, or remove and re-add the connector. A `GET /mcp` returns `405` (normal).
