# OpenClaw Digital Employee Fleet — Deployment Guide

This directory contains per-device Docker Compose stacks for running a fleet of OpenClaw digital employees. Each subdirectory represents one physical or virtual "device" — an isolated OpenClaw process responsible for one named agent.

## Multi-Device Deployment Pattern

In a digital employee fleet, each agent runs on its own device (container stack). This gives you:

- **Isolation**: Alice's Telegram bot and Bob's WhatsApp bot run in separate processes with separate credentials.
- **Independent scaling**: Restart or redeploy one agent without touching others.
- **Per-agent secrets**: Each device has its own `.env` file with only the tokens it needs.
- **Clear ownership**: One device = one agent = one `openclaw.json` config.

```
deploy/
├── device-alice/          # Sales Development Representative
│   ├── docker-compose.yml
│   └── config/
│       ├── openclaw.json
│       └── .env           # (created from .env.example, never committed)
├── device-bob/            # Customer Support Agent
│   ├── docker-compose.yml
│   └── config/
│       ├── openclaw.json
│       └── .env
└── device-manager/        # Orchestration / Routing Agent
    ├── docker-compose.yml
    └── config/
        ├── openclaw.json
        └── .env
```

## How it Works

Each `docker-compose.yml` mounts `./config` into `/home/node/.openclaw` inside the container. OpenClaw reads `openclaw.json` from that directory on startup.

The `bindings` array in `openclaw.json` routes incoming messages on each channel to the correct agent. The `cron.jobs` array drives proactive, scheduled tasks (reports, inbox polling, etc.).

## Getting Started

1. Copy `.env.example` to `.env` in each device's `config/` directory.
2. Fill in the real API keys and tokens.
3. Start a device:

```bash
cd deploy/device-alice
cp config/.env.example config/.env
# edit config/.env with real values
docker compose up -d
```

4. Check logs:

```bash
docker compose logs -f
```

## Shared Image

All devices use the same `openclaw` image. Override the image tag via the `OPENCLAW_IMAGE` environment variable:

```bash
OPENCLAW_IMAGE=openclaw:v2.1.0 docker compose up -d
```

## Networking

By default each device exposes port `18789` (the OpenClaw gateway). If you run multiple devices on the same host, use different host-side port mappings or a reverse proxy. The manager agent can reach Alice and Bob via their respective gateway URLs for sub-agent orchestration.

## Adding a New Agent

1. Create a new `deploy/device-<name>/` directory.
2. Copy an existing `docker-compose.yml` and `config/` as a starting point.
3. Edit `openclaw.json`: update the agent id, name, model, skills, bindings, and cron jobs.
4. Create `config/.env` from `.env.example`.
5. Run `docker compose up -d`.
