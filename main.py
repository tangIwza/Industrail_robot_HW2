import serial
import time
from dobot_api import DobotApiDashboard, DobotApiMove

# กำหนดพอร์ต COM5 และ Baud rate 115200 ตามที่ระบุ
PORT = "COM5"
BAUD_RATE = 115200

ROBOT_IP = "192.168.1.6"
DASHBOARD_PORT = 29999
MOVE_PORT = 30003

# พิกัดจุดต่างๆ (X, Y, Z, R) จากตาราง
INITIAL_POSE = (350.0, 0.0, 0.0, 0.0)
P1 = (354.66, 154.48, -24.08, 35.0)
P2 = (397.85, 145.56, -58.76, 35.0)
P3 = (308.92, 145.56, -58.76, 35.0)
P4 = (308.92, 204.98, -58.76, 35.0)
P5 = (390.24, 204.98, -58.76, 35.0)


def connect_robot():
    try:
        print("Connecting to Robot...")
        dashboard = DobotApiDashboard(ROBOT_IP, DASHBOARD_PORT)
        move = DobotApiMove(ROBOT_IP, MOVE_PORT)
        print("Robot Connected!")
        return dashboard, move
    except Exception as e:
        print(f"Failed to connect robot: {e}")
        return None, None


def confirm_sensor_color(ser, first_code, extra_samples=2, timeout_sec=2.5):
    """เมื่อเจอค่าสีครั้งแรก (1-4) ให้รอรับค่าสีอีก 2 ค่า แล้วนำค่าที่ 3 มาใช้งาน"""
    total_needed = 1 + extra_samples
    samples = [first_code]
    print(f"[Sensor] เจอค่าสีครั้งที่ 1/{total_needed}: {first_code} -> รออีก {extra_samples} ค่า...")
    last_time = time.time()

    while len(samples) < total_needed:
        if ser.in_waiting > 0:
            raw = ser.readline().decode('utf-8', errors='ignore').strip()
            if raw in ("1", "2", "3", "4"):
                samples.append(raw)
                last_time = time.time()
                print(f"[Sensor] ค่าสีครั้งที่ {len(samples)}/{total_needed}: {raw} ({' -> '.join(samples)})")
        if (time.time() - last_time) >= timeout_sec:
            print(f"[Sensor] หมดเวลารอค่าถัดไป ใช้ค่าล่าสุด: {samples[-1]}")
            break
        time.sleep(0.01)

    final_code = samples[-1]
    print(f"[Sensor] ยืนยันค่าสีที่ใช้คัดแยก: {final_code} (จากลำดับ {' -> '.join(samples)})")
    return final_code


def main():
    # เชื่อมต่อหุ่นยนต์
    dashboard, move = connect_robot()
    if dashboard:
        dashboard.EnableRobot()
        dashboard.SpeedFactor(50)
        print("Robot Enabled.")
    else:
        print("Running in Serial-Only mode (No Robot)")

    try:
        # เปิดการเชื่อมต่อ Serial
        ser = serial.Serial(PORT, BAUD_RATE, timeout=1)
        print(f"เชื่อมต่อกับ {PORT} ที่ความเร็ว {BAUD_RATE} สำเร็จ!")
        time.sleep(2)  # หน่วงเวลาสั้นๆ เพื่อให้การเชื่อมต่อเสถียร
        ser.reset_input_buffer()

        while True:
            if ser.in_waiting > 0:
                # อ่านข้อมูลบรรทัดที่ส่งมาจาก Arduino และตัดช่องว่าง/ขึ้นบรรทัดใหม่ออก
                line = ser.readline().decode('utf-8', errors='ignore').strip()

                if line:
                    if line == "0":
                        print("State 0: DO(2, ON)")
                        if dashboard and move:
                            dashboard.DO(2, 1)
                            move.MovL(*P1)
                            move.Sync()
                        continue

                    if line in ("1", "2", "3", "4"):
                        line = confirm_sensor_color(ser, line, extra_samples=2)

                    if line == "1":
                        # -- Yellow
                        print("Yellow - Starting sequence...")
                        if move and dashboard:
                            move.MovL(*P1)
                            move.Sync()
                            dashboard.DO(2, 1)
                            move.Sync()
                            time.sleep(1.0)  # Wait(1000)
                            dashboard.DO(2, 0)
                            move.Sync()
                            move.MovL(*P3)
                            move.MovL(*P2)
                            move.Sync()  # รอให้เคลื่อนที่ครบทุกจุดก่อนทำคำสั่งถัดไป
                        print("Yellow - Completed!")
                        ser.reset_input_buffer()  # ล้างค่า Serial ที่ค้างอยู่ระหว่างหุ่นยนต์กำลังทำงาน

                    elif line == "2":
                        # -- Red
                        print("Red - Starting sequence...")
                        if move and dashboard:
                            move.MovL(*P1)
                            move.Sync()
                            dashboard.DO(2, 1)
                            move.Sync()
                            time.sleep(2.0)  # Wait(2000)
                            dashboard.DO(2, 0)
                            move.Sync()
                            move.MovL(*P4)
                            move.MovL(*P5)
                            move.Sync()  # รอให้เคลื่อนที่ครบทุกจุดก่อนทำคำสั่งถัดไป
                        print("Red - Completed!")
                        ser.reset_input_buffer()  # ล้างค่า Serial ที่ค้างอยู่ระหว่างหุ่นยนต์กำลังทำงาน

                    elif line == "3":
                        # -- Green
                        print("Green - Starting sequence...")
                        if move and dashboard:
                            move.MovL(*P1)
                            move.Sync()
                            dashboard.DO(2, 1)
                            move.Sync()
                            time.sleep(1.0)  # Wait(1000)
                            dashboard.DO(2, 0)
                            move.Sync()
                            move.MovL(*P2)
                            move.MovL(*P3)
                            move.Sync()  # รอให้เคลื่อนที่ครบทุกจุดก่อนทำคำสั่งถัดไป
                        print("Green - Completed!")
                        ser.reset_input_buffer()  # ล้างค่า Serial ที่ค้างอยู่ระหว่างหุ่นยนต์กำลังทำงาน

                    elif line == "4":
                        # -- Blue
                        print("Blue - Starting sequence...")
                        if move and dashboard:
                            move.MovL(*P1)
                            move.Sync()
                            dashboard.DO(2, 1)
                            move.Sync()
                            time.sleep(2.0)  # Wait(2000)
                            dashboard.DO(2, 0)
                            move.Sync()
                            move.MovL(*P5)
                            move.MovL(*P4)
                            move.Sync()  # รอให้เคลื่อนที่ครบทุกจุดก่อนทำคำสั่งถัดไป
                        print("Blue - Completed!")
                        ser.reset_input_buffer()  # ล้างค่า Serial ที่ค้างอยู่ระหว่างหุ่นยนต์กำลังทำงาน

                    else:
                        print("Error")

            time.sleep(0.01)

    except serial.SerialException as e:
        print(f"เกิดข้อผิดพลาดในการเชื่อมต่อ Serial: {e}")
        print("คำแนะนำ: ตรวจสอบว่าได้ปิด Serial Monitor ใน Arduino IDE แล้วหรือยังก่อนรัน Python")
    except KeyboardInterrupt:
        print("\nหยุดการทำงานของโปรแกรม")
    finally:
        if 'ser' in locals() and ser.is_open:
            ser.close()
            print("ปิดการเชื่อมต่อพอร์ตเรียบร้อยแล้ว")


if __name__ == "__main__":
    main()