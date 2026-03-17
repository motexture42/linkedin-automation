# LinkedIn Automation CLI (li-cli) 👔🤖

A robust, stealthy command-line interface for LinkedIn automation. Designed specifically to be used as a reliable tool by external AI agents using browser automation with advanced anti-bot evasion techniques. All commands output structured JSON, making it perfectly suited for script integration and programmatic workflows.

> **⚠️ WARNING:** Using browser automation tools on LinkedIn violates their Terms of Service. Even with stealth plugins, LinkedIn employs sophisticated bot detection and may issue warnings, restrict, or permanently ban your account. **Use this tool entirely at your own risk.**

## Features
- 🔐 **Persistent Authentication:** Saves session cookies locally to `session.json` to bypass repetitive logins.
- 📜 **Feed Extraction:** Scrolls and extracts your LinkedIn feed.
- 🔍 **Intelligent Search:** Bypasses DOM obfuscation by intercepting GraphQL payloads to accurately find people and posts.
- ✍️ **Create Posts:** Creates text and media posts, returning the newly created `postUrl` via Toast interception.
- 🤝 **Connect:** Robust connection requests supporting various localized UI buttons and personalized notes.
- 💬 **Messaging:** Opens user profiles and sends direct messages directly from the overlay.
- 🗣️ **Comments Scraper:** Accurately parses the DOM to extract comments and builds direct `commentUrl`s using internal URNs.
- 🔄 **Interaction Hub (`interact`):** Likes, comments, reposts, and uniquely supports **replying directly to nested comments** using URNs.
- 📊 **Analytics:** Extracts vital engagement metrics (likes, comments, reposts) for posts and specific comments.

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
   *(If linked, you can run `li-cli` from anywhere instead of `node dist/index.js`)*

---

## 🔑 Authentication

```bash
li-cli auth
```
Launches an interactive, visible browser session. Log in manually. Once logged in, the script saves your cookies to `session.json` and closes the browser. All subsequent commands will use this session automatically.

---

## 📖 Command Reference

*Note: All commands accept a `--headless false` flag if you wish to observe the browser actions visually for debugging.*

### 1. Read Feed (`feed`)
Reads posts directly from your LinkedIn feed.
```bash
li-cli feed -l 10
```

### 2. Search (`search`)
Search for `people` or `posts`. Returns accurate URLs and text snippets by intercepting background API payloads.
```bash
# Search for people
li-cli search -q "Software Engineer" -t people -l 5

# Search for posts
li-cli search -q "AI Agents" -t posts -l 10
```

### 3. Create a Post (`post`)
Create a new post on your profile. The CLI intercepts the success toast and returns the new post's URL.
```bash
li-cli post -t "Hello LinkedIn from my AI agent! 🤖" -m "./optional_image.jpg"
```

### 4. Connect (`connect`)
Send a connection request. Handles various connection modal pop-ups dynamically.
```bash
li-cli connect -u "https://www.linkedin.com/in/username/" -m "Hi, I'd love to connect!"
```

### 5. Send a Message (`message`)
Send a direct message to someone you are already connected with.
```bash
li-cli message -u "https://www.linkedin.com/in/username/" -m "Checking in, how have you been?"
```

### 6. Scrape Comments (`comments`)
Extracts comments from a specific post, including the internal `urn` which is required for replying to specific threads.
```bash
li-cli comments -u "https://www.linkedin.com/feed/update/urn:li:activity:..." -l 20
```

### 7. Interact (`interact`)
The unified command for interacting with a post. You can combine multiple flags.
```bash
# Like and Comment
li-cli interact -u "https://www.linkedin.com/feed/update/urn:li:activity:..." --like --comment "Great insights!"

# Repost
li-cli interact -u "https://www.linkedin.com/feed/update/urn:li:activity:..." --repost

# Reply to a specific comment (requires the URN extracted from the `comments` command)
li-cli interact -u "https://www.linkedin.com/feed/update/urn:li:activity:..." --reply-to "urn:li:comment:..." --reply "I totally agree!"
```

### 8. Analytics (`analytics`)
Extract engagement metrics (likes, comments, reposts) for a main post or see if a specific comment has been liked/replied to.
```bash
# Main post analytics
li-cli analytics -u "https://www.linkedin.com/feed/update/urn:li:activity:..." --post

# Specific comment analytics
li-cli analytics -u "https://www.linkedin.com/feed/update/urn:li:activity:..." --comment "urn:li:comment:..."
```