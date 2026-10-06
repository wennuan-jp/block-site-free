# ZenBlock (with Intent)

A minimalist Chrome extension to block distracting websites with local AI discipline.

## Features

- **Two Limitation Levels**:
  - **AI Review (Blocked)**: Requires the user to state their intention. A local LLM evaluates whether the purpose is valid and productive before granting temporary 5-minute access.
  - **Forbidden**: Strictly and permanently restricted sites. No reason is accepted and no bypass is permitted.
- **LM Studio Local LLM Integration** (adopting LibGrow Client's architecture):
  - Configurable Base URL (default: `http://127.0.0.1:1234`).
  - Live model detection and selection dropdown with a dedicated **Refresh Models** button.
  - Support for loaded models auto-detection and custom model identifiers.
  - Transparent display of actual request paths (POST Chat, GET Models).
  - Customizable system evaluation prompt.
- **Whitelist Support**: Allow specific subdomains or URLs while parent domains remain restricted.

## How to Install

1. Open `chrome://extensions/` in your browser.
2. Turn on **Developer mode** in the top right.
3. Click **Load unpacked** and select this directory.

## How to Use

- **Block a site**: Click the extension icon on any webpage, choose limitation level (**AI Review** or **Forbidden**), and click **Confirm Block**.
- **Temporary Access**: On an AI Review blocked page, click **Request 5 Min Access**, enter your intention, and submit. If approved by your local AI, access is granted for 5 minutes.
- **Settings & AI Configuration**: Right-click the extension icon and select **Options** to configure your LM Studio connection, choose models, test connectivity, and manage your block lists.
