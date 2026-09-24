# NX — Scalable Multi-Tenant Notification Engine

**NX** is a robust, scalable, multi-tenant notification engine built to intelligently queue, route, and deliver notifications across multiple channels (Push, Email, SMS) based on strict priority rules and user preferences.

---

## 🏛️ Architecture

Our notification engine sits between tenant services (e.g., Payment, Order, Recommendation services) and the actual delivery providers. It absorbs high-throughput requests, queues them, and relies on an intelligent routing engine to guarantee delivery according to the user's specific channel preferences.

```mermaid
flowchart TD
    %% Tenants
    subgraph Tenants [Tenant Services]
        PS(Payment Service)
        OS(Order Service)
        RS(Recommendations)
    end

    %% Engine Core
    subgraph Engine [Notification Engine Core]
        API[NX API Gateway]
        UPC{User Preference & \nChannel Eligibility Check}
        RMQ[(RabbitMQ \nPriority Queues)]
    end

    %% Channels
    subgraph Channels [Delivery Channels]
        SES[Email (AWS SES)]
        TW[SMS (Twilio)]
        WS[Push (WebSockets)]
    end

    %% Flow
    PS -->|POST /notifications| API
    OS -->|POST /notifications| API
    RS -->|POST /notifications| API
    
    API --> UPC
    UPC --> RMQ
    
    RMQ -->|Dequeue & Route| SES
    RMQ -->|Dequeue & Route| TW
    RMQ -->|Dequeue & Route| WS
    
    SES -->|Success| DELIVERED((Delivered))
    SES -->|Fail| SES_RETRY[Retry 3x \nFallback]
    
    TW -->|Success| DELIVERED
    TW -->|Fail| TW_RETRY[Retry 3x \nFallback]
    
    WS -->|User Online| DELIVERED
    WS -->|User Offline| WS_OFFLINE[Offline Holding Queue \n Wait for Reconnect]
```

---

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
