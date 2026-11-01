import serial
import time
import threading

from dobot_api import DobotApiDashboard, DobotApiMove

SERIAL_PORT = 'COM7'   
BAUD_RATE = 115200

ROBOT_IP = "192.168.1.6" 
DASHBOARD_PORT = 29999
MOVE_PORT = 30003

state = 0
offset = 0

x_offset = [0, -40, -80, 0, -40]    
y_offset = [0, 0, 0, 40, 40]   
   


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

def main():
    global state
    global offset
    # เชื่อมต่อหุ่นยนต์
    dashboard, move = connect_robot()
    if dashboard:
        dashboard.EnableRobot()
        dashboard.SpeedFactor(50)
        print("Robot Enabled.")
    else:
        print("Running in Serial-Only mode (No Robot)")

    try:
        ser = serial.Serial(SERIAL_PORT, BAUD_RATE, timeout=1)
        print(f"Connected to {SERIAL_PORT} successfully!")
        print("Waiting for sensor data...")

        while True:
            if ser.in_waiting > 0:
                raw_data = ser.readline()
                try:
                    line = raw_data.decode('utf-8').strip()
                    value = float(line)

                    if offset < 3:
                        x = x_offset[offset]
                        y = y_offset[offset]
                    else:
                        offset = 0 

                    print(f"Distance: {value} cm | Current State: {state} | Offset: {offset}")
                    # กำหนดเงื่อนไขระยะทาง 5 ระดับ
                    if value < 10 and state == 0:
                        move.MovL(261, 140, 136, 231) #middle position
                        move.MovL(233, 252, -70, 268) #pickup position
                        move.RelMovL(x,y,0,0)
                        state = 1
                    elif value < 15 and value >= 10 and state == 1:
                        move.RelMovL(0,0,-7,0)
                        dashboard.DO(9,1)
                        time.sleep(0.5)
                        dashboard.DO(9,0)
                        time.sleep(0.5)
                        state = 2
                    elif value < 20 and value >= 15 and state == 2:
                        move.RelMovL(0,0,15,0) 
                        move.MovL(261, 140, 136, 231) #middle position
                        move.MovL(357, -38, 146, 201) #drop position
                        time.sleep(0.5)
                        state = 3
                    elif value < 25 and value >= 20 and state == 3:
                        move.RelMovL(0,0,-6,0)
                        dashboard.DO(10,1)
                        time.sleep(0.5)
                        dashboard.DO(10,0)
                        time.sleep(0.5)
                        state = 4
                    elif value < 30 and value >= 25 and state == 4:
                        dashboard.DO(1,1)
                        time.sleep(5)
                        dashboard.DO(1,0)
                        dashboard.DO(2,1)
                        time.sleep(2)
                        dashboard.DO(2,0)
                        time.sleep(0.5)
                        state = 0
                        offset += 1
                    elif state == 0:
                        move.MovL(261, 140, 136, 231) #middle position
                    else:
                        pass

                except ValueError:
                    pass
                except UnicodeDecodeError:
                    pass

            time.sleep(0.01)

    except serial.SerialException:
        print(f"Error: Could not open port {SERIAL_PORT}.")
    except KeyboardInterrupt:
        print("\nStopping...")
        if 'ser' in locals() and ser.is_open: ser.close()

if __name__ == '__main__':
    main()