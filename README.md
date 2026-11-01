# Industrial Robot Fruit Sorting System (HW2)

An automated industrial fruit sorting and classification system combining a **Dobot MG400** 4-axis industrial robot arm, conveyor belt control, Arduino color sensor integration, a real-time **FastAPI** backend, and a modern **React + Vite + TailwindCSS** web dashboard with **Firebase Realtime Database** cloud synchronization.

---

## 🚀 Key Features

- **Automated Fruit Sorting Sequences**:
  - **Apple (Red)**: `MovL(P1) -> DO(2,ON) -> Wait(2000) -> DO(2,OFF) -> MovL(P4) -> MovL(P5) -> MovL(P1)`
  - **Good Sour Orange (Green)**: `MovL(P1) -> DO(2,ON) -> Wait(1000) -> DO(2,OFF) -> MovL(P2) -> MovL(P3) -> MovL(P1)`
  - **Bad Orange (Blue)**: `MovL(P1) -> DO(2,ON) -> Wait(2000) -> DO(2,OFF) -> MovL(P5) -> MovL(P4) -> MovL(P1)`
  - **Good Sweet Orange (Yellow)**: `MovL(P1) -> DO(2,ON) -> Wait(1000) -> DO(2,OFF) -> MovL(P3) -> MovL(P2) -> MovL(P1)`
- **Color Sensor Triple-Verification**:
  - Automatically samples 2 additional consecutive readings after first detection to prevent false sorting caused by fruit edges.
- **Hardware State Tower Lights**:
  - **Start / Running**: Green Light (`DO3: ON`)
  - **Stop / Standby**: Yellow Light (`DO4: ON`)
  - **Emergency Stop**: Red Light (`DO5: ON`)
- **Emergency Stop & Resume**:
  - Immediately stops conveyor belt (`DO2: OFF`), pauses robot arm, and preserves active waypoint/wait progress.
  - Resume button seamlessly continues trajectory from the exact paused millisecond.
- **Firebase Cloud Two-Way Control**:
  - Real-time cloud sync with Firebase Realtime Database (`/system`):
    - `conveyor: true` -> Start machine
    - `conveyor: false` -> Stop machine
    - `emergency: true` -> Activate emergency stop
    - `emergency: false` -> Resume held task
- **SCG JCMS Style Operations Dashboard**:
  - Real-time machine status and live telemetry.
  - Performance graphs, cycle time analysis, OEE metrics, and fruit classification solid pie chart.
  - Export sorting history logs to CSV.

---

## 🛠 Tech Stack

- **Robot**: Dobot MG400 (`dobot_api.py`, TCP Port 29999 / 30003)
- **Sensor**: Arduino Color Sensor over Serial (COM5 @ 115200 baud)
- **Backend**: Python 3, FastAPI, Uvicorn, PySerial, Firebase Admin SDK
- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, Lucide React, Recharts

---

## 📦 Getting Started

### 1. Backend Setup
```bash
# Install Python dependencies
pip install fastapi uvicorn pyserial firebase-admin

# Run FastAPI backend
python backend.py
```
Backend API runs on `http://localhost:8000`.

### 2. Dashboard Setup
```bash
cd robot-sorting-dashboard
npm install
npm run dev
```
Dashboard runs on `http://localhost:5173`.
