# NX — Scalable Multi-Tenant Notification Engine

A production-grade notification engine supporting multiple tenants, priority-based queuing (Important/High/Medium/Low), multi-channel delivery (Push/Email/SMS), intelligent retry/fallback logic, and a real-time dashboard.

## Architecture

```
┌─────────────────┐    ┌──────────────────────────────────────────────────────────┐
│   Tenant A      │    │                    NX ENGINE                            │
│   (Postman)     │───▶│                                                          │
├─────────────────┤    │  ┌─────────┐    ┌──────────┐    ┌──────────────────────┐ │
│   Tenant B      │───▶│  │  REST   │───▶│ RabbitMQ │───▶│  Notification Engine │ │
│   (Postman)     │    │  │  API    │    │ Priority │    │                      │ │
├─────────────────┤    │  │         │    │  Queue   │    │  ┌─ Important ──▶ ALL│ │
│   Tenant C      │───▶│  └─────────┘    └──────────┘    │  ├─ High ──▶ Fallback│ │
│   (Postman)     │    │                                  │  ├─ Medium ──▶ P+E  │ │
└─────────────────┘    │  ┌─────────────────────────────┐ │  └─ Low ──▶ Single  │ │
                       │  │      Channel Providers      │ │                      │ │
                       │  │  ┌──────┬───────┬─────────┐ │ └──────────────────────┘ │
                       │  │  │ Push │ Email │   SMS   │ │                          │
                       │  │  │  WS  │  SES  │ Twilio  │ │  ┌──────────────────┐    │
                       │  │  └──────┴───────┴─────────┘ │  │   PostgreSQL     │    │
                       │  └─────────────────────────────┘  │   (Persistence)  │    │
                       │                                    └──────────────────┘    │
                       └───────────────────────────────────────────────────────────┘
                                              │
                       ┌──────────────────────────────────┐
                       │      Next.js Dashboard           │
                       │  Stats · Charts · Live Table     │
                       └──────────────────────────────────┘
```

## Quick Start

### Prerequisites

- **Node.js** 18+
- **pnpm** (`npm install -g pnpm`)
- **Docker** (for PostgreSQL + RabbitMQ)

### 1. Start Infrastructure

```bash
# Start PostgreSQL and RabbitMQ
docker run -d --name nx-postgres -p 5432:5432 \
  -e POSTGRES_USER=nx -e POSTGRES_PASSWORD= \
  -e POSTGRES_DB=nx_db postgres:16-alpine

docker run -d --name nx-rabbitmq -p 5672:5672 -p 15672:15672 \
  rabbitmq:3.13-management-alpine
```

Or using Docker Compose:
```bash
docker compose up -d
```

### 2. Install & Run

```bash
# Install dependencies
pnpm install

# Start API (port 3001)
pnpm dev:api

# Start Dashboard (port 3000) — in another terminal
pnpm dev:web

# Or start both simultaneously
pnpm dev
```

### 3. Verify

- **API**: http://localhost:3001/api/dashboard/stats
- **Dashboard**: http://localhost:3000
- **RabbitMQ UI**: http://localhost:15672 (guest/guest)

---

## API Reference

All tenant-scoped endpoints require `x-api-key` header.

### Tenants (No auth required)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/tenants` | Register tenant (returns API key) |
| GET | `/api/tenants` | List all tenants |
| GET | `/api/tenants/:id` | Get tenant |

```bash
# Register a tenant
curl -X POST http://localhost:3001/api/tenants \
  -H "Content-Type: application/json" \
  -d '{"name": "Acme Corp", "description": "E-commerce platform"}'
```

### Users (Requires `x-api-key`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/users` | Create user |
| GET | `/api/users` | List users |
| GET | `/api/users/:id` | Get user |
| PUT | `/api/users/:id/preferences` | Update channel preferences |

```bash
# Create user
curl -X POST http://localhost:3001/api/users \
  -H "Content-Type: application/json" \
  -H "x-api-key: nx_your_api_key_here" \
  -d '{"externalId": "user-001", "email": "john@example.com", "phone": "+1234567890"}'

# Update preferences (disable SMS, reorder channels)
curl -X PUT http://localhost:3001/api/users/:userId/preferences \
  -H "Content-Type: application/json" \
  -H "x-api-key: nx_your_api_key_here" \
  -d '{"smsEnabled": false, "channelOrder": ["email", "push", "sms"]}'
```

### Notifications (Requires `x-api-key`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/notifications` | Send notification |
| GET | `/api/notifications` | List notifications (filters: status, priority, limit) |
| GET | `/api/notifications/:id` | Get notification with delivery attempts |

```bash
# Send a HIGH priority notification
curl -X POST http://localhost:3001/api/notifications \
  -H "Content-Type: application/json" \
  -H "x-api-key: nx_your_api_key_here" \
  -d '{
    "userId": "user-uuid-here",
    "priority": "high",
    "title": "Order Shipped",
    "body": "Your order #12345 has been shipped!",
    "data": {"orderId": "12345"}
  }'
```

### Dashboard (No auth)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/dashboard/stats` | Complete dashboard statistics |

---

## Priority System

| Priority | Behavior | Channels | Fallback |
|----------|----------|----------|----------|
| **Important** | Send to ALL enabled channels in parallel | Push + Email + SMS | Each retries independently; no cross-channel fallback |
| **High** | Sequential fallback chain | Push → Email → SMS | Full chain with 3 retries each |
| **Medium** | Push and Email only | Push → Email | No SMS ever; skip if both disabled |
| **Low** | Single channel only | First eligible | No fallback; 3 retries then fail |

### Push Offline Behavior

| Priority | Wait Time | On Timeout |
|----------|-----------|------------|
| Important | 3 min (Push); Email/SMS not blocked | Push marked pending |
| High | 3 min | Fallback to next channel |
| Medium | 72 hours | Fallback to Email |
| Low | 72 hours | Failed (no fallback) |

---

## WebSocket (Push Notifications)

Connect with Socket.IO:

```javascript
const socket = io("http://localhost:3001", {
  auth: { userId: "user-uuid-here" }
});

socket.on("notification", (data) => {
  console.log("Received:", data);
  // { id, title, body, priority, data, timestamp }
});
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DB_HOST` | localhost | PostgreSQL host |
| `DB_PORT` | 5432 | PostgreSQL port |
| `DB_USERNAME` | nx | Database user |
| `DB_PASSWORD` | nx_password | Database password |
| `DB_DATABASE` | nx_db | Database name |
| `RABBITMQ_URL` | amqp://guest:guest@localhost:5672 | RabbitMQ URL |
| `MOCK_CHANNELS` | true | Use mock channel providers |
| `API_PORT` | 3001 | API server port |
| `AWS_REGION` | us-east-1 | AWS SES region |
| `AWS_ACCESS_KEY_ID` | | SES access key |
| `AWS_SECRET_ACCESS_KEY` | | SES secret key |
| `SES_FROM_EMAIL` | noreply@example.com | Sender email |
| `TWILIO_ACCOUNT_SID` | | Twilio SID |
| `TWILIO_AUTH_TOKEN` | | Twilio auth token |
| `TWILIO_PHONE_NUMBER` | | Twilio sender number |

---

## Project Structure

```
NX/
├── apps/
│   ├── api/                    # NestJS backend
│   │   └── src/
│   │       ├── auth/           # API key authentication
│   │       ├── channels/       # Push, Email, SMS providers
│   │       ├── common/         # Shared enums & constants
│   │       ├── config/         # Configuration
│   │       ├── dashboard/      # Dashboard statistics API
│   │       ├── database/       # TypeORM entities
│   │       ├── engine/         # Core notification engine
│   │       │   └── strategies/ # Important/High/Medium/Low
│   │       ├── notifications/  # Notification CRUD
│   │       ├── queue/          # RabbitMQ producer/consumer
│   │       ├── tenants/        # Tenant management
│   │       ├── users/          # User management
│   │       └── websocket/      # WebSocket gateway
│   └── web/                    # Next.js dashboard
│       └── src/app/            # Dashboard UI
├── docker-compose.yml          # PostgreSQL + RabbitMQ
└── pnpm-workspace.yaml         # Monorepo config
```
