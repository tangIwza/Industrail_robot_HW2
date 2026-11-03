import os
import serial
import time
import threading
from datetime import datetime
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

try:
    import firebase_admin
    from firebase_admin import credentials, db as firebase_db
    FIREBASE_AVAILABLE = True
except ImportError:
    FIREBASE_AVAILABLE = False

from dobot_api import DobotApiDashboard, DobotApiMove

# ==========================================
# Configuration
# ==========================================
PORT = "COM5"
BAUD_RATE = 115200

ROBOT_IP = "192.168.1.6"
DASHBOARD_PORT = 29999
MOVE_PORT = 30003

FIREBASE_DB_URL = "https://hmiplc-6606a-default-rtdb.asia-southeast1.firebasedatabase.app"
SERVICE_ACCOUNT_PATHS = [
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "serviceAccountKey.json"),
    os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "serviceAccountKey.json"),
    r"c:\Users\DELL\Downloads\serviceAccountKey.json",
]

# Coordinates (X, Y, Z, R)
INITIAL_POSE = (350.0, 0.0, 0.0, 0.0)
P1 = (354.66, 154.48, -10, 35.0)
P2 = (397.85, 145.56, -58.76, 35.0)
P3 = (308.92, 145.56, -58.76, 35.0)
P4 = (308.92, 204.98, -58.76, 35.0)
P5 = (390.24, 204.98, -58.76, 35.0)

FRUIT_CONFIG = {
    "1": {
        "code": "1",
        "color": "Yellow",
        "key": "yellow",
        "fruit_type": "Good Sour Orange",
        "wait_ms": 1000,
        "waypoints": [("P3", P3), ("P2", P2)],
        "sequence_str": "MovL(P1) -> DO(2,ON) -> Wait(1000) -> DO(2,OFF) -> MovL(P3) -> MovL(P2) -> MovL(P1)",
    },
    "2": {
        "code": "2",
        "color": "Red",
        "key": "red",
        "fruit_type": "Apple",
        "wait_ms": 2000,
        "waypoints": [("P4", P4), ("P5", P5)],
        "sequence_str": "MovL(P1) -> DO(2,ON) -> Wait(2000) -> DO(2,OFF) -> MovL(P4) -> MovL(P5) -> MovL(P1)",
    },
    "3": {
        "code": "3",
        "color": "Green",
        "key": "green",
        "fruit_type": "Good sweet Orange",
        "wait_ms": 1000,
        "waypoints": [("P2", P2), ("P3", P3)],
        "sequence_str": "MovL(P1) -> DO(2,ON) -> Wait(1000) -> DO(2,OFF) -> MovL(P2) -> MovL(P3) -> MovL(P1)",
    },
    "4": {
        "code": "4",
        "color": "Blue",
        "key": "blue",
        "fruit_type": "Bad Orange",
        "wait_ms": 2000,
        "waypoints": [("P5", P5), ("P4", P4)],
        "sequence_str": "MovL(P1) -> DO(2,ON) -> Wait(2000) -> DO(2,OFF) -> MovL(P5) -> MovL(P4) -> MovL(P1)",
    },
}


# ==========================================
# Controller & State Manager
# ==========================================
class RobotSortingController:
    def __init__(self):
        self.lock = threading.Lock()
        self.dashboard: Optional[DobotApiDashboard] = None
        self.move: Optional[DobotApiMove] = None
        self.ser: Optional[serial.Serial] = None

        self.robot_connected = False
        self.serial_connected = False
        self.firebase_connected = False
        self.fb_system_ref = None
        self.fb_listener = None
        self._fb_cache: Dict[str, Any] = {}
        self.fb_conveyor: Optional[bool] = None
        self.fb_emergency: Optional[bool] = None
        self._last_local_sync_ts: float = 0.0

        # System Operating Mode: "STOPPED", "RUNNING", "EMERGENCY_STOP"
        self.system_status = "STOPPED"
        # Detailed Machine State description
        self.machine_state = "IDLE (System Ready - Press Start)"
        self.last_state_before_estop = "IDLE"

        # Current task state (supports holding and resuming on Emergency Stop)
        self.active_task: Optional[Dict[str, Any]] = None
        self.pending_code: Optional[str] = None
        self.do2_status: int = 0
        self.do2_before_estop: int = 0
        # Status Tower Lights: Start=Green(DO3), Stop=Yellow(DO4), Emergency=Red(DO5)
        self.do3_status: int = 0  # Green Light (START / RUNNING)
        self.do4_status: int = 1  # Yellow Light (STOP / STOPPED)
        self.do5_status: int = 0  # Red Light (EMERGENCY_STOP)
        self.current_position: str = "InitialPose"

        # Counters
        self.counts = {
            "red": 0,     # Apple
            "green": 0,   # Good sweet Orange
            "blue": 0,    # Bad Orange
            "yellow": 0,  # Good Sour Orange
        }

        # Fruit Logs & System Events
        self.fruit_logs: List[Dict[str, Any]] = []
        self.log_counter = 0

        # Background worker threads
        self._stop_threads = False

    def connect_hardware(self):
        # Connect Robot
        try:
            if self.dashboard:
                try:
                    self.dashboard.close()
                except Exception:
                    pass
            if self.move:
                try:
                    self.move.close()
                except Exception:
                    pass

            print("Connecting to Dobot Robot...")
            self.dashboard = DobotApiDashboard(ROBOT_IP, DASHBOARD_PORT)
            self.move = DobotApiMove(ROBOT_IP, MOVE_PORT)
            self.dashboard.EnableRobot()
            self.dashboard.SpeedFactor(50)
            self.robot_connected = True
            self._update_state_lights()
            print("Robot Connected & Enabled!")
        except Exception as e:
            print(f"Robot offline (Simulation Mode): {e}")
            self.dashboard = None
            self.move = None
            self.robot_connected = False

        # Connect Serial
        try:
            if self.ser and self.ser.is_open:
                self.ser.close()
            self.ser = serial.Serial(PORT, BAUD_RATE, timeout=0.5)
            time.sleep(1.0)
            self.ser.reset_input_buffer()
            self.serial_connected = True
            print(f"Connected to Serial {PORT} at {BAUD_RATE} baud.")
        except Exception as e:
            print(f"Serial {PORT} offline (Manual/UI Trigger Mode available): {e}")
            self.ser = None
            self.serial_connected = False

        # Connect Firebase Realtime Database
        self.connect_firebase()

    def connect_firebase(self):
        if not FIREBASE_AVAILABLE:
            print("firebase-admin not installed; Firebase sync disabled.")
            self.firebase_connected = False
            return

        try:
            key_path = next((p for p in SERVICE_ACCOUNT_PATHS if os.path.exists(p)), None)
            if not key_path:
                print("serviceAccountKey.json not found; Firebase sync disabled.")
                self.firebase_connected = False
                return

            if not firebase_admin._apps:
                cred = credentials.Certificate(key_path)
                firebase_admin.initialize_app(cred, {"databaseURL": FIREBASE_DB_URL})

            self.fb_system_ref = firebase_db.reference("system")
            self.firebase_connected = True
            print(f"Connected to Firebase Realtime Database ({FIREBASE_DB_URL}) using {key_path}")
        except Exception as e:
            print(f"Firebase connection error: {e}")
            self.firebase_connected = False

    def _push_firebase_state(self, updates: Dict[str, Any]):
        """Push local state changes to Firebase /system asynchronously."""
        if not self.firebase_connected or self.fb_system_ref is None:
            return

        def _do_update():
            try:
                payload = dict(updates)
                payload["updated_at"] = time.time()
                self.fb_system_ref.update(payload)
            except Exception as e:
                print(f"Firebase update error: {e}")

        threading.Thread(target=_do_update, daemon=True).start()

    def _apply_firebase_state(self, data: Dict[str, Any]):
        """
        Synchronize machine state with Firebase `/system`:
        1. `emergency`:
           - If True  -> press Emergency Stop (`emergency_stop()`)
           - If False (when currently in EMERGENCY_STOP) -> Resume held task (`start_machine()`)
        2. `conveyor` (when `emergency` is False):
           - If True  -> Start machine (`start_machine()`)
           - If False -> Stop machine (`stop_machine()`)
        """
        conveyor = bool(data.get("conveyor", False))
        emergency = bool(data.get("emergency", False))

        with self.lock:
            current_status = self.system_status
            prev_emergency = self.fb_emergency
            self.fb_conveyor = conveyor
            self.fb_emergency = emergency

        # 1. Emergency state control
        if emergency:
            if current_status != "EMERGENCY_STOP":
                print("[Firebase] emergency=True -> Activating Emergency Stop")
                self.emergency_stop(from_firebase=True)
            return

        # If emergency changed from True -> False (or machine is currently in EMERGENCY_STOP while emergency=False)
        if current_status == "EMERGENCY_STOP" or (prev_emergency is True and not emergency):
            print("[Firebase] emergency=False -> Resuming Held Task (Start Machine)")
            self.start_machine(from_firebase=True)
            if not conveyor:
                with self.lock:
                    self.fb_conveyor = True
                self._push_firebase_state({"conveyor": True, "running": True})
            return

        # 2. Conveyor state control (True = Start Machine, False = Stop Machine)
        if conveyor and current_status != "RUNNING":
            print("[Firebase] conveyor=True -> Starting Machine")
            self.start_machine(from_firebase=True)
        elif (not conveyor) and current_status != "STOPPED":
            print("[Firebase] conveyor=False -> Stopping Machine")
            self.stop_machine(from_firebase=True)

    def firebase_sync_loop(self):
        """Background daemon loop to keep machine state synchronized with Firebase /system."""
        while not self._stop_threads:
            if self.firebase_connected and self.fb_system_ref is not None:
                if (time.time() - self._last_local_sync_ts) >= 0.8:
                    try:
                        data = self.fb_system_ref.get()
                        if isinstance(data, dict):
                            self._apply_firebase_state(data)
                    except Exception as e:
                        print(f"Firebase poll error: {e}")
            time.sleep(0.3)

    def _update_state_lights(self):
        """
        Update Tower/Signal Lights based on system_status:
        - RUNNING (Start)        -> Green ON  (DO3=1, DO4=0, DO5=0)
        - STOPPED (Stop)         -> Yellow ON (DO3=0, DO4=1, DO5=0)
        - EMERGENCY_STOP (EStop) -> Red ON    (DO3=0, DO4=0, DO5=1)
        """
        if self.system_status == "RUNNING":
            self.do3_status = 1
            self.do4_status = 0
            self.do5_status = 0
        elif self.system_status == "STOPPED":
            self.do3_status = 0
            self.do4_status = 1
            self.do5_status = 0
        elif self.system_status == "EMERGENCY_STOP":
            self.do3_status = 0
            self.do4_status = 0
            self.do5_status = 1

        if self.robot_connected and self.dashboard:
            try:
                self.dashboard.DOExecute(3, self.do3_status)
                self.dashboard.DOExecute(4, self.do4_status)
                self.dashboard.DOExecute(5, self.do5_status)
            except Exception as e:
                print(f"Error updating state lights (DO3/DO4/DO5): {e}")

    def start_machine(self, from_firebase: bool = False):
        with self.lock:
            if self.system_status == "EMERGENCY_STOP":
                # Restore DO(2) state if it was ON when Emergency Stop was pressed
                self.do2_status = self.do2_before_estop

                # Resume from Emergency Stop: re-enable & continue robot trajectory & held task
                if self.robot_connected and self.dashboard:
                    try:
                        self.dashboard.ClearError()
                        self.dashboard.EnableRobot()
                        self.dashboard.Continue()
                        if self.do2_before_estop == 1:
                            self.dashboard.DOExecute(2, 1)
                    except Exception as e:
                        print(f"Error sending Continue() to robot: {e}")

                self.system_status = "RUNNING"
                self._update_state_lights()
                if self.active_task:
                    self.active_task["status"] = "IN_PROGRESS"
                    self.machine_state = self.last_state_before_estop
                    # Update log entry status back to IN_PROGRESS
                    for log in self.fruit_logs:
                        if log["id"] == self.active_task.get("log_id"):
                            log["status"] = "IN_PROGRESS"
                            break
                else:
                    self.machine_state = "RUNNING - Waiting for Sensor Signal"

                if not from_firebase:
                    self._last_local_sync_ts = time.time()
                    self.fb_conveyor = True
                    self.fb_emergency = False
                    self._push_firebase_state({"conveyor": True, "emergency": False, "running": True})

                return {
                    "status": "resumed",
                    "machine_state": self.machine_state,
                    "do2_status": self.do2_status,
                    "do3_status": self.do3_status,
                    "do4_status": self.do4_status,
                    "do5_status": self.do5_status,
                }

            if self.robot_connected and self.dashboard:
                try:
                    self.dashboard.ClearError()
                    self.dashboard.EnableRobot()
                except Exception:
                    pass

            self.system_status = "RUNNING"
            self._update_state_lights()
            if not self.active_task:
                self.machine_state = "RUNNING - Waiting for Sensor Signal"

            if not from_firebase:
                self._last_local_sync_ts = time.time()
                self.fb_conveyor = True
                self.fb_emergency = False
                self._push_firebase_state({"conveyor": True, "emergency": False, "running": True})

            return {
                "status": "started",
                "machine_state": self.machine_state,
                "do3_status": self.do3_status,
                "do4_status": self.do4_status,
                "do5_status": self.do5_status,
            }

    def stop_machine(self, from_firebase: bool = False):
        with self.lock:
            self.system_status = "STOPPED"
            self.pending_code = None
            self.do2_status = 0
            self._update_state_lights()
            if self.robot_connected and self.dashboard:
                try:
                    self.dashboard.DOExecute(2, 0)
                    self.dashboard.DO(2, 0)
                except Exception as e:
                    print(f"Error turning off DO(2) on Stop: {e}")

            if self.active_task:
                self.machine_state = f"STOPPING (Finishing {self.active_task['fruit_type']}...) - DO(2, OFF)"
            else:
                self.machine_state = "STOPPED (Standby) - DO(2, OFF)"

            if not from_firebase:
                self._last_local_sync_ts = time.time()
                self.fb_conveyor = False
                self.fb_emergency = False
                self._push_firebase_state({"conveyor": False, "emergency": False, "running": False})

            return {
                "status": "stopped",
                "machine_state": self.machine_state,
                "do2_status": self.do2_status,
                "do3_status": self.do3_status,
                "do4_status": self.do4_status,
                "do5_status": self.do5_status,
            }

    def emergency_stop(self, from_firebase: bool = False):
        with self.lock:
            if self.system_status != "EMERGENCY_STOP":
                self.last_state_before_estop = self.machine_state
                self.do2_before_estop = self.do2_status
            self.system_status = "EMERGENCY_STOP"
            # Immediately turn OFF DO(2) while in Emergency Stop so DO(2) does not keep running
            self.do2_status = 0
            self._update_state_lights()

            # Pause robot hardware and turn off DO(2) immediately
            if self.robot_connected and self.dashboard:
                try:
                    self.dashboard.DOExecute(2, 0)
                    self.dashboard.pause()
                except Exception as e:
                    print(f"Error sending DOExecute(2,0)/pause() to robot: {e}")

            if self.active_task:
                self.active_task["status"] = "HELD (E-STOP)"
                step_info = self.active_task.get("current_step_label", "Holding")
                if self.active_task.get("current_step") == 3:
                    elapsed = self.active_task.get("elapsed_wait_ms", 0)
                    total_w = self.active_task.get("total_wait_ms", 1000)
                    step_info = f"Wait Held at {elapsed}ms / {total_w}ms"
                self.machine_state = (
                    f"EMERGENCY STOP - Holding {self.active_task['fruit_type']} "
                    f"[{step_info}] (DO2 OFF)"
                )
                for log in self.fruit_logs:
                    if log["id"] == self.active_task.get("log_id"):
                        log["status"] = "HELD (E-STOP)"
                        break
            else:
                self.machine_state = f"EMERGENCY STOP - Holding State ({self.last_state_before_estop}) (DO2 OFF)"

            if not from_firebase:
                self._last_local_sync_ts = time.time()
                self.fb_emergency = True
                self._push_firebase_state({"emergency": True, "running": False})

            return {
                "status": "emergency_stop",
                "machine_state": self.machine_state,
                "do2_status": self.do2_status,
                "do3_status": self.do3_status,
                "do4_status": self.do4_status,
                "do5_status": self.do5_status,
                "held_task": self.active_task,
            }

    def set_do2(self, status: int):
        with self.lock:
            self.do2_status = 1 if status else 0
            if self.robot_connected and self.dashboard:
                try:
                    self.dashboard.DOExecute(2, self.do2_status)
                    self.dashboard.DO(2, self.do2_status)
                except Exception as e:
                    print(f"Error setting DO(2): {e}")
            return {"do2_status": self.do2_status}

    def trigger_condition(self, code: str, source: str = "MANUAL"):
        code = code.strip()
        with self.lock:
            if self.system_status == "EMERGENCY_STOP":
                raise ValueError("Cannot trigger while Emergency Stop is active. Press Start (Resume) first.")
            if self.system_status == "STOPPED":
                # Auto start when manually triggered from dashboard
                self.system_status = "RUNNING"
                self._update_state_lights()
                self._last_local_sync_ts = time.time()
                self.fb_conveyor = True
                self.fb_emergency = False
                self._push_firebase_state({"conveyor": True, "emergency": False, "running": True})
            if self.active_task is not None or self.pending_code is not None:
                raise ValueError("Robot is currently busy finishing the active condition.")
            if code not in ("0", "1", "2", "3", "4"):
                raise ValueError(f"Invalid condition code: {code}")

            self.pending_code = f"{code}:{source}"
            return {"queued": code, "source": source}

    def reset_data(self):
        with self.lock:
            if self.active_task is not None:
                raise ValueError("Cannot reset while a sorting sequence is active.")
            self.counts = {"red": 0, "green": 0, "blue": 0, "yellow": 0}
            self.fruit_logs = []
            self.log_counter = 0
            return {"status": "reset"}

    def _wait_if_emergency_stopped(self):
        """If Emergency Stop is active, hold execution here until Start is pressed again."""
        while not self._stop_threads:
            with self.lock:
                if self.system_status != "EMERGENCY_STOP":
                    return
            time.sleep(0.05)

    def _sleep_interruptible(self, total_seconds: float, is_wait_step: bool = False):
        """
        Counts elapsed time from 0 ms up to total_ms (e.g., 1000ms or 2000ms).
        If Emergency Stop is hit at e.g. 500ms, it pauses the counter at 500ms
        (and DO2 is turned OFF by emergency_stop()). When Start is pressed again,
        DO2 turns back ON and the counter continues from 500ms up to total_ms!
        """
        total_ms = int(round(total_seconds * 1000))
        elapsed_ms = 0.0
        slice_sec = 0.02  # 20ms precision slices

        while elapsed_ms < total_ms and not self._stop_threads:
            self._wait_if_emergency_stopped()
            t0 = time.time()
            remaining_sec = max(0.0, (total_ms - elapsed_ms) / 1000.0)
            time.sleep(min(slice_sec, remaining_sec))
            dt_ms = (time.time() - t0) * 1000.0

            with self.lock:
                if self.system_status != "EMERGENCY_STOP":
                    elapsed_ms = min(float(total_ms), elapsed_ms + dt_ms)
                    if is_wait_step and self.active_task:
                        cur_elapsed = int(round(elapsed_ms))
                        cur_rem = max(0, total_ms - cur_elapsed)
                        self.active_task["elapsed_wait_ms"] = cur_elapsed
                        self.active_task["remaining_wait_ms"] = cur_rem
                        self.active_task["current_step_label"] = f"Wait({cur_elapsed}ms / {total_ms}ms)"
                        state_str = (
                            f"Sorting {self.active_task['fruit_type']} ({self.active_task['color']}) - "
                            f"Step 3/7: Wait({cur_elapsed}ms / {total_ms}ms)"
                        )
                        self.machine_state = state_str
                        self.last_state_before_estop = state_str

    def _execute_robot_step(self, step_fn, simulated_duration: float = 0.6):
        """
        Executes a robot movement/IO step and waits for completion,
        holding immediately if Emergency Stop is pressed and re-executing
        the interrupted command upon resume so the robot always reaches its target point.
        """
        self._wait_if_emergency_stopped()
        if self.robot_connected and self.move and self.dashboard:
            step_fn()
            self.move.Sync()
            # If Emergency Stop was pressed while Sync() was running, wait until resumed
            # and then re-issue step_fn() + Sync() to guarantee the robot completes this step
            with self.lock:
                interrupted = (self.system_status == "EMERGENCY_STOP")
            if interrupted:
                self._wait_if_emergency_stopped()
                step_fn()
                self.move.Sync()
        else:
            self._sleep_interruptible(simulated_duration)
        self._wait_if_emergency_stopped()

    def _run_condition_zero(self, source: str):
        with self.lock:
            if self.system_status != "RUNNING":
                return
            self.machine_state = f"Condition 0 ({source}): DO(2, ON)"
            self.do2_status = 1

        if self.robot_connected and self.dashboard and self.move:
            try:
                self.dashboard.DO(2, 1)
                self.move.Sync()
            except Exception as e:
                print(f"Robot DO(2,1) error: {e}")
        else:
            self._sleep_interruptible(0.3)

        with self.lock:
            if self.system_status == "RUNNING":
                self.machine_state = "RUNNING - DO(2, ON) Active | Waiting for Color Sensor"
            elif self.system_status == "STOPPED":
                self.do2_status = 0
                if self.robot_connected and self.dashboard:
                    try:
                        self.dashboard.DOExecute(2, 0)
                        self.dashboard.DO(2, 0)
                    except Exception:
                        pass

    def _run_fruit_sequence(self, code: str, source: str):
        cfg = FRUIT_CONFIG[code]
        wp1_name, wp1_coords = cfg["waypoints"][0]
        wp2_name, wp2_coords = cfg["waypoints"][1]
        wait_sec = cfg["wait_ms"] / 1000.0

        steps = [
            {
                "index": 1,
                "label": "MovL(P1)",
                "desc": "Moving to Pickup Point P1",
                "pos": "P1",
                "action": lambda: self.move.MovL(*P1),
                "sim_time": 0.7,
            },
            {
                "index": 2,
                "label": "DO(2, ON)",
                "desc": "Activating Digital Output DO(2, ON)",
                "pos": "P1",
                "action": lambda: self.dashboard.DOExecute(2, 1),
                "sim_time": 0.1,
            },
            {
                "index": 3,
                "label": f"Wait(0ms / {cfg['wait_ms']}ms)",
                "desc": f"Holding Wait({cfg['wait_ms']} ms)",
                "pos": "P1",
                "action": None,  # Handled via interruptible sleep with live ms counter
                "sim_time": wait_sec,
            },
            {
                "index": 4,
                "label": "DO(2, OFF)",
                "desc": "Deactivating Digital Output DO(2, OFF)",
                "pos": "P1",
                "action": lambda: self.dashboard.DOExecute(2, 0),
                "sim_time": 0.1,
            },
            {
                "index": 5,
                "label": f"MovL({wp1_name})",
                "desc": f"Moving to {wp1_name}",
                "pos": wp1_name,
                "action": lambda: self.move.MovL(*wp1_coords),
                "sim_time": 0.7,
            },
            {
                "index": 6,
                "label": f"MovL({wp2_name})",
                "desc": f"Moving to {wp2_name}",
                "pos": wp2_name,
                "action": lambda: self.move.MovL(*wp2_coords),
                "sim_time": 0.7,
            },
            {
                "index": 7,
                "label": "MovL(P1)",
                "desc": "Returning to Pickup Point P1",
                "pos": "P1",
                "action": lambda: self.move.MovL(*P1),
                "sim_time": 0.7,
            },
        ]

        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        is_sensor_auto = (source == "SERIAL")

        with self.lock:
            if is_sensor_auto:
                self.log_counter += 1
                log_id = f"SRT-{self.log_counter:04d}"
                new_count_preview = self.counts[cfg["key"]] + 1
            else:
                log_id = "MANUAL-STAGE"
                new_count_preview = self.counts[cfg["key"]]

            self.active_task = {
                "log_id": log_id,
                "code": code,
                "color": cfg["color"],
                "fruit_type": cfg["fruit_type"],
                "source": source,
                "current_step": 1,
                "total_steps": len(steps),
                "current_step_label": steps[0]["label"],
                "sequence_str": cfg["sequence_str"],
                "status": "IN_PROGRESS",
                "started_at": now_str,
                "elapsed_wait_ms": 0,
                "total_wait_ms": cfg["wait_ms"],
                "remaining_wait_ms": cfg["wait_ms"],
            }

            if is_sensor_auto:
                log_entry = {
                    "id": log_id,
                    "timestamp": now_str,
                    "code": code,
                    "color": cfg["color"],
                    "fruit_type": cfg["fruit_type"],
                    "fruit_type_count": new_count_preview,
                    "total_count": sum(self.counts.values()) + 1,
                    "source": source,
                    "sequence": cfg["sequence_str"],
                    "status": "IN_PROGRESS",
                }
                self.fruit_logs.insert(0, log_entry)

        # Execute each step sequentially, holding if Emergency Stop is pressed
        for step in steps:
            self._wait_if_emergency_stopped()

            with self.lock:
                self.active_task["current_step"] = step["index"]
                self.active_task["current_step_label"] = step["label"]
                state_str = (
                    f"Sorting {cfg['fruit_type']} ({cfg['color']}) - "
                    f"Step {step['index']}/{len(steps)}: {step['label']}"
                )
                self.machine_state = state_str
                self.last_state_before_estop = state_str
                self.current_position = step["pos"]
                if step["label"] == "DO(2, ON)":
                    self.do2_status = 1
                elif step["label"] == "DO(2, OFF)":
                    self.do2_status = 0

            if step["action"] is None:
                # Wait(1000) or Wait(2000) - count from 0ms to target_ms, pausing & resuming on E-Stop
                self._sleep_interruptible(step["sim_time"], is_wait_step=True)
            else:
                self._execute_robot_step(step["action"], simulated_duration=step["sim_time"])

        # Sequence finished! Increment count and flush serial buffer only if triggered by sensor (SERIAL)
        with self.lock:
            if is_sensor_auto:
                self.counts[cfg["key"]] += 1
                completed_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                for log in self.fruit_logs:
                    if log["id"] == log_id:
                        log["status"] = "COMPLETED"
                        log["timestamp"] = completed_time
                        log["fruit_type_count"] = self.counts[cfg["key"]]
                        log["total_count"] = sum(self.counts.values())
                        break

            self.active_task = None
            if self.system_status == "RUNNING":
                self.machine_state = (
                    f"COMPLETED {cfg['fruit_type']} ({cfg['color']}) - Waiting for Next Sensor Signal"
                )
            elif self.system_status == "STOPPED":
                self.machine_state = "STOPPED (Standby)"

            if self.ser and self.ser.is_open:
                try:
                    self.ser.reset_input_buffer()
                except Exception:
                    pass

    def _confirm_sensor_color(self, first_code: str, extra_samples: int = 2, timeout_sec: float = 2.5) -> Optional[str]:
        """
        When a color is first detected on the moving conveyor (e.g. Yellow '1' at the edge of a Red fruit),
        wait for `extra_samples` (2) more color readings from Serial and use that 3rd reading
        so the sensor reads the true center color of the fruit.
        """
        total_needed = 1 + extra_samples
        samples = [first_code]
        first_color = FRUIT_CONFIG[first_code]["color"]
        print(f"[Sensor] Sample 1/{total_needed}: Code {first_code} ({first_color}) - waiting for {extra_samples} more readings...")

        with self.lock:
            if self.system_status == "RUNNING":
                self.machine_state = (
                    f"Sensor Sampling (1/{total_needed}): {first_color} — Waiting for {extra_samples} more readings..."
                )

        last_sample_time = time.time()

        while len(samples) < total_needed and not self._stop_threads:
            self._wait_if_emergency_stopped()

            with self.lock:
                if self.system_status != "RUNNING":
                    return None

            if self.ser and self.ser.is_open:
                try:
                    if self.ser.in_waiting > 0:
                        raw = self.ser.readline().decode("utf-8", errors="ignore").strip()
                        if raw in FRUIT_CONFIG:
                            samples.append(raw)
                            last_sample_time = time.time()
                            cur_color = FRUIT_CONFIG[raw]["color"]
                            seq_preview = " -> ".join(f"{FRUIT_CONFIG[c]['color']}({c})" for c in samples)
                            print(f"[Sensor] Sample {len(samples)}/{total_needed}: Code {raw} ({cur_color}) [{seq_preview}]")
                            with self.lock:
                                if self.system_status == "RUNNING":
                                    self.machine_state = (
                                        f"Sensor Sampling ({len(samples)}/{total_needed}): {seq_preview}"
                                    )
                except Exception as e:
                    print(f"Serial read error during color sampling: {e}")
                    break

            if (time.time() - last_sample_time) >= timeout_sec:
                print(
                    f"[Sensor] Timeout waiting for sample {len(samples) + 1}/{total_needed}; "
                    f"using latest sample: Code {samples[-1]} ({FRUIT_CONFIG[samples[-1]]['color']})"
                )
                break

            time.sleep(0.01)

        final_code = samples[-1]
        print(
            f"[Sensor] Confirmed Color after {len(samples)} readings ({' -> '.join(samples)}): "
            f"Code {final_code} ({FRUIT_CONFIG[final_code]['color']} - {FRUIT_CONFIG[final_code]['fruit_type']})"
        )
        self._push_firebase_state({"color_sensor": int(final_code)})
        return final_code

    def worker_loop(self):
        while not self._stop_threads:
            # 1. Check if Emergency Stop or Stopped
            with self.lock:
                status = self.system_status
                pending = self.pending_code
                if status == "RUNNING" and pending is not None:
                    self.pending_code = None
                else:
                    pending = None

            if pending:
                code, source = pending.split(":", 1)
                if code == "0":
                    self._run_condition_zero(source)
                elif code in FRUIT_CONFIG:
                    self._run_fruit_sequence(code, source)
                continue

            # 2. Poll Serial Port if RUNNING and no active task
            if status == "RUNNING" and self.ser and self.ser.is_open:
                try:
                    if self.ser.in_waiting > 0:
                        line = self.ser.readline().decode("utf-8", errors="ignore").strip()
                        with self.lock:
                            still_running = (self.system_status == "RUNNING")
                        if still_running and line in ("0", "1", "2", "3", "4"):
                            if line == "0":
                                self._run_condition_zero("SERIAL")
                            else:
                                final_code = self._confirm_sensor_color(line, extra_samples=2)
                                if final_code:
                                    self._run_fruit_sequence(final_code, "SERIAL")
                except Exception as e:
                    print(f"Serial read error: {e}")
                    self.serial_connected = False

            time.sleep(0.02)

    def get_snapshot(self) -> Dict[str, Any]:
        with self.lock:
            total = sum(self.counts.values())
            return {
                "system_status": self.system_status,
                "machine_state": self.machine_state,
                "last_state_before_estop": self.last_state_before_estop,
                "robot_connected": self.robot_connected,
                "serial_connected": self.serial_connected,
                "firebase_connected": self.firebase_connected,
                "fb_conveyor": self.fb_conveyor,
                "fb_emergency": self.fb_emergency,
                "serial_port": PORT,
                "robot_ip": ROBOT_IP,
                "do2_status": self.do2_status,
                "do3_status": self.do3_status,
                "do4_status": self.do4_status,
                "do5_status": self.do5_status,
                "current_position": self.current_position,
                "active_task": self.active_task,
                "counts": {
                    "red": self.counts["red"],
                    "green": self.counts["green"],
                    "blue": self.counts["blue"],
                    "yellow": self.counts["yellow"],
                    "total": total,
                },
                "logs": self.fruit_logs[:100],
                "coordinates": {
                    "InitialPose": INITIAL_POSE,
                    "P1": P1,
                    "P2": P2,
                    "P3": P3,
                    "P4": P4,
                    "P5": P5,
                },
            }


# ==========================================
# FastAPI Application
# ==========================================
app = FastAPI(title="SCG JCMS - Industrial Robot Fruit Sorting Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

controller = RobotSortingController()


@app.on_event("startup")
def on_startup():
    controller.connect_hardware()
    t = threading.Thread(target=controller.worker_loop, daemon=True)
    t.start()
    fb_t = threading.Thread(target=controller.firebase_sync_loop, daemon=True)
    fb_t.start()


@app.get("/api/status")
def get_status():
    return controller.get_snapshot()


@app.post("/api/start")
def start_machine():
    return controller.start_machine()


@app.post("/api/stop")
def stop_machine():
    return controller.stop_machine()


@app.post("/api/emergency-stop")
def emergency_stop():
    return controller.emergency_stop()


@app.post("/api/do2/{status}")
def set_do2(status: int):
    return controller.set_do2(status)


@app.post("/api/trigger/{code}")
def trigger_code(code: str):
    try:
        return controller.trigger_condition(code, source="DASHBOARD")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/reset")
def reset_counts():
    try:
        return controller.reset_data()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/reconnect")
def reconnect_hardware():
    controller.connect_hardware()
    return controller.get_snapshot()


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
