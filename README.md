# LinkedIn Automation CLI (li-cli) 👔🤖

A robust, stealthy command-line interface for LinkedIn automation. Designed specifically to be used as a reliable tool by external AI agents using browser automation with advanced anti-bot evasion techniques.

## Features
- 🔐 **Persistent Authentication** (Saves session cookies locally).
- 📜 **Read Feed** (Scrolls and extracts your LinkedIn feed).
- 🔍 **Search** (Finds people or posts).
- ✍️ **Post** (Create posts bypassing bot detection).
- 🤝 **Connect** (Send connection requests with optional notes).

## 🚀 Installation & Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Build the CLI:**
   ```bash
   npm run build
   ```

3. **Link the CLI globally (Optional):**
   ```bash
   npm link
   ```

## 🔑 Authentication

```bash
li-cli auth
```
Logs you in manually and saves cookies to `session.json`.

## 📖 Commands

All commands output structured JSON to `stdout` and output errors to `stderr`.

### 1. Read Feed (`feed`)
```bash
li-cli feed -l 10
```

### 2. Search (`search`)
```bash
li-cli search -q "Software Engineer" -t people -l 5
```

### 3. Post (`post`)
```bash
li-cli post -t "Hello LinkedIn from my AI agent! 🤖"
```

### 4. Connect (`connect`)
```bash
li-cli connect -u "https://www.linkedin.com/in/username/" -m "Hi, let's connect!"
```

*(Remaining commands like `like`, `repost`, `comment`, `message`, `comments` are stubbed in index but require explicit implementation. These initial commands demonstrate the core Agentic AI flow).*
