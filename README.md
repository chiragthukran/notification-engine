## 🏛️ Architecture

NX sits between tenant applications and external notification providers.

Tenant services submit notification requests to the NX API. The engine validates user preferences, places notifications into priority queues, and uses the routing engine to select the appropriate delivery channel.

```mermaid
flowchart LR

    subgraph TENANTS["Tenant Services"]
        PAYMENT["Payment Service"]
        ORDER["Order Service"]
        RECOMMEND["Recommendation Service"]
    end

    subgraph ENGINE["NX Notification Engine"]
        API["NX API Gateway"]
        PREF{"Preference and Eligibility Check"}
        QUEUE[("RabbitMQ Priority Queues")]
        ROUTER["Intelligent Routing Engine"]
    end

    subgraph CHANNELS["Delivery Channels"]
        PUSH["Push - WebSockets"]
        EMAIL["Email - AWS SES"]
        SMS["SMS - Twilio"]
    end

    subgraph HANDLING["Delivery Handling"]
        DELIVERED(("Delivered"))
        RETRY["Retry and Fallback"]
        OFFLINE["Offline Holding Queue"]
    end

    PAYMENT -->|"POST /notifications"| API
    ORDER -->|"POST /notifications"| API
    RECOMMEND -->|"POST /notifications"| API

    API --> PREF
    PREF --> QUEUE
    QUEUE --> ROUTER

    ROUTER --> PUSH
    ROUTER --> EMAIL
    ROUTER --> SMS

    PUSH -->|"Online"| DELIVERED
    EMAIL -->|"Success"| DELIVERED
    SMS -->|"Success"| DELIVERED

    PUSH -->|"Offline"| OFFLINE
    PUSH -->|"Failure"| RETRY
    EMAIL -->|"Failure"| RETRY
    SMS -->|"Failure"| RETRY

    OFFLINE -.->|"Reconnect or Fallback"| ROUTER
    RETRY -.->|"Retry or Next Channel"| ROUTER
```

---

## 🚀 What NX Does

Multiple isolated tenants can send notification requests through the authenticated NX API.

Instead of communicating directly with providers such as Twilio or AWS SES, tenant applications communicate with NX.

```text
Tenant Service
      |
      v
NX API Gateway
      |
      v
Preference Check
      |
      v
Priority Queue
      |
      v
Routing Engine
      |
      +------ Push
      |
      +------ Email
      |
      +------ SMS
```

NX handles:

- Notification ingestion
- Priority-based queuing
- User preference validation
- Channel eligibility
- Intelligent routing
- Provider communication
- Retries
- Cross-channel fallback
- Offline notification handling
- Delivery tracking
- Real-time monitoring

The API and worker layers are designed to operate asynchronously so that tenant services do not need to wait for external providers to complete delivery.
## 🚀 What NX Does

Multiple isolated tenants send notification requests to NX through its authenticated API. NX processes, queues, routes, retries, and delivers those notifications asynchronously. 

The system provides a **Next.js Real-time Dashboard** that visualizes the current load, queue lengths, delivery successes, and fallback trajectories in real-time using live database state.

### Core Philosophy & Initial Thoughts
Our initial plan was built around reliability and smart degradation. The engine should never lose a notification if a primary channel goes down. If a user is offline for a Push notification, the system should smartly cache it until they return, or automatically degrade (fallback) to an Email or SMS to ensure the message gets delivered. The design is heavily modular to ensure the queue consumers scale entirely independently of the API gateways.

---

## 🚦 Priority Routing & Fallback Logic

Notifications wait in the queue and are processed based on four strict priority levels. The system handles maximum **3 retries per channel (4 total attempts)** before considering a channel "failed".

### 1. Important (Highest)
* **Goal:** Absolute guarantee of delivery as fast as possible.
* **Routing:** Sent independently through **ALL** channels enabled in the user's preferences simultaneously.
* **Fallback:** No cross-channel fallback. Each channel retries itself 3 times if it fails. If Push is offline, it waits in the offline queue without blocking Email or SMS.

### 2. High
* **Goal:** Reliable delivery across the user's preferred fallback chain.
* **Routing:** Uses the user's eligible channel order (Default: `Push ➔ Email ➔ SMS`).
* **Fallback:** Tries Push ➔ retries 3x ➔ if fails, falls back to Email ➔ retries 3x ➔ if fails, falls back to SMS ➔ retries 3x.
* **Offline Push:** Waits a maximum of **3 minutes** for the user to come online before falling back to the next channel.

### 3. Medium
* **Goal:** Standard delivery, but saves money on expensive SMS channels.
* **Routing:** Only `Push` and `Email` are allowed. **SMS is strictly forbidden**.
* **Fallback:** Tries Push ➔ retries 3x ➔ falls back to Email.
* **Offline Push:** Waits a maximum of **72 hours** for the user to come online before falling back to Email. 

### 4. Low (Lowest)
* **Goal:** Non-intrusive updates (e.g., weekly digest tips).
* **Routing:** Uses the **single** most preferred eligible channel.
* **Fallback:** Zero cross-channel fallback. If it fails after 3 retries, it stops.
* **Offline Push:** Waits up to **72 hours**. If they don't come online, it fails.

---

## 🧪 Why Use Simulations & Mock Mode?

By default, the engine boots up with `MOCK_CHANNELS=true` (or you can toggle it off in the Dashboard via the red **🚀 PROD MODE** button). 

**Why do we simulate?**
1. **Cost Efficiency:** Testing fallback chains (e.g., sending an SMS 4 times in a row before it fails) is incredibly expensive using real Twilio APIs.
2. **Network Resilience Testing:** Mock mode allows administrators to dynamically toggle channels ON or OFF on the fly directly from the dashboard. If you turn off the "Push" channel, you can watch the Engine seamlessly pivot all High priority messages over to Email in real-time.
3. **Sandbox Testing:** Trial accounts (like Twilio) have strict limits on sending messages to specific countries or using custom templates. Mock mode lets us bypass third-party rate limits while perfectly testing our internal engine logic.

---

## 🛠️ How to Start the Project

### Prerequisites
You need Docker, Node.js (v18+), and `pnpm` installed.

1. **Start the Infrastructure (PostgreSQL & RabbitMQ):**
   ```bash
   docker-compose up -d
   ```

2. **Install Dependencies:**
   ```bash
   pnpm install
   ```

3. **Configure Environment:**
   Update your `apps/api/.env` if you wish to use real Twilio/AWS SES keys.

4. **Start the Development Servers:**
   ```bash
   pnpm dev
   ```
   This command automatically starts both the NestJS Backend (`http://localhost:3001`) and the Next.js Dashboard (`http://localhost:3000`).

---

## 🎯 How to Test It

Testing NX is incredibly visual and interactive via the built-in Dashboard.

1. **Open the Dashboard:** Go to `http://localhost:3000`.
2. **Tenant Dispatch Studio:** Navigate to the "Tenant Dispatcher" tab on the left.
3. **Dispatch Presets:** Use the "Quick Test Scenarios" buttons to immediately queue up notifications with various priorities (Important, High, Medium, Low).
4. **Watch the Engine Monitor:** Navigate to the "Engine Monitor" tab. Watch the live charts and the "Delivery Status Timeline" to see your notifications queue up, process, and successfully deliver.
5. **Force a Fallback:** In the Engine Monitor, locate the **Channel Simulator** bar. Toggle the **Push** channel to **OFF**. Now go dispatch a High Priority notification and watch the engine automatically detect the failure and fallback to the Email channel!
6. **Test Prod Mode:** If you have real Twilio credentials configured in `.env`, flip the "Prod Mode" toggle in the Simulator Bar and dispatch an SMS to see it arrive on your physical phone!
