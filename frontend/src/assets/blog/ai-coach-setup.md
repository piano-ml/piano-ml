# Set up your AI piano coach

This guide connects your AI assistant to PianoML, then lets it coach you and drive the player. New to the AI coach? Start with [Getting started with your AI piano coach](/blog/ai-coach).

## What you need

- A PianoML account. Log in at [pianoml.org](https://pianoml.org).
- An AI assistant that supports **MCP** (Model Context Protocol), the standard way to connect assistants to other services. Le Chat, Claude and ChatGPT do, and many other assistants do too.
- For the coach to drive the player: PianoML open in a browser tab, on the computer you practice on.

## The PianoML server address

Every assistant asks for the same address:

```
https://api.pianoml.org/mcp
```

Type it exactly like this, without a slash at the end. It is also on the **Connect an AI coach** page of PianoML (account page → **Connect an AI coach →**), with a Copy button.

## Two ways to connect

| | How it works | For |
|---|---|---|
| **Sign in** | You give the assistant the address. It sends you to PianoML, where you log in and choose what it may do. Nothing to copy. | Le Chat by Mistral, Claude (web, desktop, mobile, Claude Code), ChatGPT, and other assistants that sign in to servers |
| **Access token** | You create an access on PianoML and paste its token into the assistant's settings. | Assistants that let you add a server with a header (Cursor, VS Code, Cline...), or when signing in does not work |

Use **sign in** when your assistant offers it: it is quicker, and you never handle a token.

---

## Mistral (Le Chat)

1. Open [Le Chat](https://chat.mistral.ai) and go to **Connectors** (in the side menu, under **Intelligence**).
2. Choose **Add connector**, then **Custom MCP connector**.
3. Name it `PianoML`, and paste the server address `https://api.pianoml.org/mcp`.
4. For the authentication, choose **OAuth** if Le Chat offers it, then **Connect**. Le Chat sends you to PianoML: log in, check what Le Chat may do, and choose **Allow**.
   If Le Chat asks for a token or a header instead, create an access (see **Access tokens** below) and enter `Authorization` as the header name and `Bearer pml_your_token` as its value.
5. In a new chat, turn on PianoML in the tools menu.

Custom connectors may depend on your Le Chat plan, and the menu names may change over time: see Mistral's help pages if you don't find them.

---

## Claude

### Claude on the web, desktop and mobile

You add PianoML once, on the web, and it works in the Claude desktop and mobile apps too.

1. Open [claude.ai](https://claude.ai) and go to **Settings → Connectors**.
2. Choose **Add custom connector**.
3. Name it `PianoML`, and paste the server address `https://api.pianoml.org/mcp`.
4. Choose **Connect**. Claude sends you to PianoML. Log in if asked.
5. PianoML shows who is asking (Claude, from claude.ai) and what it wants to do. Untick anything you don't want to allow, then choose **Allow**.
6. You are back in Claude. In a new chat, check that PianoML is turned on in the tools menu.

Custom connectors may depend on your Claude plan, and the menu names may change over time: see Anthropic's help pages if you don't find them.

### Claude Code

In a terminal:

```bash
claude mcp add --transport http pianoml https://api.pianoml.org/mcp
```

Then, in Claude Code, type `/mcp`, choose **pianoml** and **Authenticate**. Your browser opens PianoML: log in, check what Claude Code may do, and choose **Allow**.

If you prefer a token (for example on a computer without a browser), create an access first (see **Access tokens** below), then:

```bash
claude mcp add --transport http pianoml https://api.pianoml.org/mcp \
  --header "Authorization: Bearer pml_your_token"
```

---

## ChatGPT

ChatGPT connects to servers like PianoML through **developer mode**.

1. In ChatGPT, open **Settings → Apps & Connectors**, then **Advanced settings**, and turn on **Developer mode**.
2. Back in **Apps & Connectors**, choose **Create** to add a connector.
3. Name it `PianoML`, paste the server address `https://api.pianoml.org/mcp`, and choose **OAuth** as the authentication.
4. Confirm. ChatGPT sends you to PianoML: log in, check what ChatGPT may do, and choose **Allow**.
5. In a new chat, turn on PianoML in the tools menu (the **+** button, then **Developer mode**).

Developer mode depends on your ChatGPT plan and is still labeled beta by OpenAI. The menus may change: see OpenAI's help pages if you don't find them. ChatGPT only connects by signing in: access tokens do not work there.

---

## Other assistants

### Assistants that sign in

If your assistant can add a "remote MCP server" by its address and signs you in (often called OAuth), give it `https://api.pianoml.org/mcp` and follow the steps: you will land on the same PianoML approval page as with Le Chat, Claude and ChatGPT.

### Access tokens

For assistants configured with a server address and a header.

**1. Create an access.** On PianoML, open the account page, then **Access for external tools → New access**.

- **Name of the tool**: for example `Cursor on my laptop`, to recognize it later.
- **What it can do**: Practice history, Score library, Player (see **What the coach can see and do** below).
- **Expires after**: 30, 90, 180 or 365 days.

Choose **Create**, then copy the token (it starts with `pml_`). **It is shown only once**: if you lose it, revoke the access and create a new one.

**2. Configure the assistant.** The **Connect an AI coach** page shows three ready-to-copy configurations, filled with your token right after you create it:

- **Any MCP host**: the three values to type in the assistant's settings:
  ```
  URL: https://api.pianoml.org/mcp
  Transport: Streamable HTTP
  Header: Authorization: Bearer pml_your_token
  ```
- **JSON configuration**: for assistants configured with an `mcpServers` file (Cursor, Cline and others):
  ```json
  {
    "mcpServers": {
      "pianoml": {
        "type": "http",
        "url": "https://api.pianoml.org/mcp",
        "headers": { "Authorization": "Bearer pml_your_token" }
      }
    }
  }
  ```
  Some assistants name the keys differently (VS Code, for example, uses `servers` instead of `mcpServers`): check their documentation.
- **Command-line bridge**: for assistants that can only start programs on your computer, not connect to an address. It needs [Node.js](https://nodejs.org):
  ```json
  {
    "mcpServers": {
      "pianoml": {
        "command": "npx",
        "args": ["-y", "mcp-remote", "https://api.pianoml.org/mcp", "--transport", "http-only", "--header", "Authorization:${AUTH_HEADER}"],
        "env": { "AUTH_HEADER": "Bearer pml_your_token" }
      }
    }
  }
  ```

Keep your token private, like a password: anyone who has it can read your practice history.

---

## Start coaching

Once connected, just talk to your assistant. To get the best start, paste one of the ready-made messages from the **Connect an AI coach** page (step 2, **Start the coach**). Each one tells the assistant how to coach you with PianoML, and it answers in your language:

| Message | What you get |
|---|---|
| **Start a coaching session** | Where you stand, and one thing to practice today |
| **Review my progress** | A review of your last days of practice (you choose how many), without practicing |
| **Practice a piece** | Work on one piece, its weakest passage first |
| **Warm up** | Scales and arpeggios suited to your level and your pieces |
| **Find a new piece** | Three suggestions at the right level, then the chosen one opens |

Some assistants also list these messages in their own menus (as "prompts"), where PianoML offers them too.

## Let the coach drive the player

The coach can open a score or an exercise, set the tempo, the measures, the hands and the loop, start and stop the player, and look at how each take went. All of this happens in your browser, in a PianoML tab you choose:

1. Open PianoML in your browser, logged in.
2. Click the **Remote coach** switch (the AI document icon) and confirm. It is in the page header, next to your account name, and in the practice toolbar, next to the information button. You can also use **Turn on Remote coach** on the **Connect an AI coach** page.
3. Ask your assistant to practice something: *"Open Für Elise, measures 1 to 8, slow, right hand only"*.
4. The first time it starts the player, your browser needs one click before it plays sound: press **Start playback** when it shows up.

The color of the switch tells where it stands: white when off, orange and blinking while it connects, emerald when on, orange when it could not connect. When on, its tooltip shows which assistant controls the tab. Click it again to turn it off at any time. It is also off after you reload the page or log out, so the coach can never take over a tab without you.

The switch only works once an assistant is connected with the **Player** permission: until then it is dimmed and leads to [the presentation of the AI coach](/blog/ai-coach). If your assistant says no PianoML tab is listening, it gives you a link that opens PianoML with the switch ready to confirm.

## What the coach can see and do

You choose this when you approve an assistant or create an access:

| Permission | Allows the assistant to |
|---|---|
| **Practice history** | Read your sessions, accuracy, streaks and level |
| **Score library** | Search and read the scores of the library |
| **Player** | Open scores and start or stop the player in a tab where you turned on Remote coach |

The assistant never sees your password or your email, and cannot change your account, your scores or your playlists.

## Disconnect an assistant

On the account page, in **Access for external tools**, every connected assistant is listed: applications you approved by signing in (marked **Connected application**) and the accesses you created, with their last use. **Revoke** stops it at once.

Access also ends on its own: an access token after the time you chose, an approved application after one year (you then approve it again). Resetting your password disconnects every assistant, and so does deleting your account.

## Troubleshooting

| Problem | What to do |
|---|---|
| The assistant says it is not authorized, or keeps asking to connect | The access was revoked or has expired. Connect again, or create a new access. |
| The assistant says no PianoML tab is listening | Open PianoML in your browser and turn on **Remote coach**, or follow the link the assistant gives. |
| The player does not make any sound | Press **Start playback** in the PianoML tab: browsers need one click before a page can play sound. |
| The assistant says the player did not answer in time | The PianoML tab was closed, asleep or offline. Bring it to the front and ask again. |
| The coach controls the wrong tab | With Remote coach on in several tabs, the one you used last is controlled. Turn the switch off in the others. |
| The assistant says a permission is missing | It was not allowed when you connected. Revoke it and connect again, ticking that permission. |
| The assistant is slowed down | Each access can make 60 requests a minute. Wait a moment. |

For developers and technical details (tools, limits, testing with `curl`), see [`coach-mcp-setup.md`](https://github.com/piano-ml/piano-ml/blob/main/docs/coach-mcp-setup.md).
