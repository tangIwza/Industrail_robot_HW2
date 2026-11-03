import { useState, useEffect, useRef, useMemo } from 'react';
import {
  LayoutDashboard,
  ClipboardList,
  Cpu,
  Play,
  Square,
  AlertOctagon,
  RotateCcw,
  RefreshCw,
  Sun,
  Moon,
  Bell,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Radio,
  Search,
  Download,
  Sliders,
  Zap,
  MapPin,
  Clock,
  BarChart3,
  TrendingUp,
  Gauge,
  Timer,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';

const API_BASE = 'http://localhost:8000/api';

type Page = 'dashboard' | 'logs' | 'production-graph' | 'coordinates';
type SystemStatus = 'STOPPED' | 'RUNNING' | 'EMERGENCY_STOP';

interface ActiveTask {
  log_id: string;
  code: string;
  color: string;
  fruit_type: string;
  source: string;
  current_step: number;
  total_steps: number;
  current_step_label: string;
  sequence_str: string;
  status: string;
  started_at: string;
  elapsed_wait_ms?: number;
  total_wait_ms?: number;
  remaining_wait_ms: number;
}

interface LogEntry {
  id: string;
  timestamp: string;
  code: string;
  color: string;
  fruit_type: string;
  fruit_type_count: number;
  total_count: number;
  source: string;
  sequence: string;
  status: 'COMPLETED' | 'IN_PROGRESS' | 'HELD (E-STOP)';
}

interface FruitCounts {
  red: number;
  green: number;
  blue: number;
  yellow: number;
  total: number;
}

const FRUIT_SPECS: Record<
  string,
  {
    code: string;
    color: string;
    key: keyof Omit<FruitCounts, 'total'>;
    fruit_type: string;
    wait_ms: number;
    wp1: string;
    wp2: string;
    sequence: string;
    badgeBg: string;
    dotColor: string;
    cardAccent: string;
  }
> = {
  '1': {
    code: '1',
    color: 'Yellow',
    key: 'yellow',
    fruit_type: 'Good Sour Orange',
    wait_ms: 1000,
    wp1: 'P3',
    wp2: 'P2',
    sequence: 'MovL(P1) → DO(2,ON) → Wait(1000) → DO(2,OFF) → MovL(P3) → MovL(P2)',
    badgeBg: 'bg-amber-50 text-amber-700 ring-amber-600/20',
    dotColor: 'bg-amber-400',
    cardAccent: 'border-l-4 border-l-amber-400',
  },
  '2': {
    code: '2',
    color: 'Red',
    key: 'red',
    fruit_type: 'Apple',
    wait_ms: 2000,
    wp1: 'P4',
    wp2: 'P5',
    sequence: 'MovL(P1) → DO(2,ON) → Wait(2000) → DO(2,OFF) → MovL(P4) → MovL(P5)',
    badgeBg: 'bg-red-50 text-red-700 ring-red-600/20',
    dotColor: 'bg-red-500',
    cardAccent: 'border-l-4 border-l-red-500',
  },
  '3': {
    code: '3',
    color: 'Green',
    key: 'green',
    fruit_type: 'Good sweet Orange',
    wait_ms: 1000,
    wp1: 'P2',
    wp2: 'P3',
    sequence: 'MovL(P1) → DO(2,ON) → Wait(1000) → DO(2,OFF) → MovL(P2) → MovL(P3)',
    badgeBg: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
    dotColor: 'bg-emerald-500',
    cardAccent: 'border-l-4 border-l-emerald-500',
  },
  '4': {
    code: '4',
    color: 'Blue',
    key: 'blue',
    fruit_type: 'Bad Orange',
    wait_ms: 2000,
    wp1: 'P5',
    wp2: 'P4',
    sequence: 'MovL(P1) → DO(2,ON) → Wait(2000) → DO(2,OFF) → MovL(P5) → MovL(P4)',
    badgeBg: 'bg-blue-50 text-blue-800 ring-blue-700/20',
    dotColor: 'bg-blue-500',
    cardAccent: 'border-l-4 border-l-blue-500',
  },
};

const COORDINATES_TABLE = [
  { name: 'InitialPose', x: 350.0, y: 0.0, z: 0.0, r: 0.0, user: 0, tool: 0, role: 'Home / Standby Pose' },
  { name: 'P1', x: 354.66, y: 154.48, z: -24.08, r: 35.0, user: 0, tool: 0, role: 'Sensor Pickup Point (All Fruits)' },
  { name: 'P2', x: 397.85, y: 145.56, z: -58.76, r: 35.0, user: 0, tool: 0, role: 'Green (1st) / Yellow (2nd) Point' },
  { name: 'P3', x: 308.92, y: 145.56, z: -58.76, r: 35.0, user: 0, tool: 0, role: 'Yellow (1st) / Green (2nd) Point' },
  { name: 'P4', x: 308.92, y: 204.98, z: -58.76, r: 35.0, user: 0, tool: 0, role: 'Red (1st) / Blue (2nd) Point' },
  { name: 'P5', x: 390.24, y: 204.98, z: -58.76, r: 35.0, user: 0, tool: 0, role: 'Blue (1st) / Red (2nd) Point' },
];

function formatNow(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(
    now.getHours()
  )}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

const RADIAN = Math.PI / 180;
const renderCustomizedPieLabel = ({
  cx,
  cy,
  midAngle,
  innerRadius,
  outerRadius,
  percent,
}: any) => {
  const radius = innerRadius + (outerRadius - innerRadius) * 0.55;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);

  if (!percent || percent < 0.05) return null;
  return (
    <text
      x={x}
      y={y}
      fill="#ffffff"
      textAnchor="middle"
      dominantBaseline="central"
      className="text-xs font-black pointer-events-none drop-shadow"
    >
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
};

export default function App() {
  const [page, setPage] = useState<Page>('dashboard');
  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isDark, setIsDark] = useState(false);

  // Machine & Telemetry State
  const [backendConnected, setBackendConnected] = useState(false);
  const [robotConnected, setRobotConnected] = useState(false);
  const [serialConnected, setSerialConnected] = useState(false);
  const [firebaseConnected, setFirebaseConnected] = useState(false);
  const [systemStatus, setSystemStatus] = useState<SystemStatus>('STOPPED');
  const [machineState, setMachineState] = useState('IDLE (System Ready - Press Start)');
  const [lastHeldState, setLastHeldState] = useState('IDLE');
  const [do2Status, setDo2Status] = useState<number>(0);
  const [currentPosition, setCurrentPosition] = useState<string>('InitialPose');
  const [activeTask, setActiveTask] = useState<ActiveTask | null>(null);
  const [counts, setCounts] = useState<FruitCounts>({
    red: 0,
    green: 0,
    blue: 0,
    yellow: 0,
    total: 0,
  });
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);

  // Filters for Logs
  const [searchQuery, setSearchQuery] = useState('');
  const [fruitFilter, setFruitFilter] = useState<string>('ALL');

  // Local fallback engine refs (used when Python backend is not running)
  const localStatusRef = useRef<SystemStatus>('STOPPED');
  const localDo2BeforeEstopRef = useRef<number>(0);
  const localTaskRef = useRef<{
    logId: string;
    code: string;
    stepIndex: number;
    elapsedStepMs: number;
    remainingStepMs: number;
    isManual?: boolean;
  } | null>(null);
  const localLogCounterRef = useRef<number>(0);
  const localCountsRef = useRef<FruitCounts>({ red: 0, green: 0, blue: 0, yellow: 0, total: 0 });

  // Poll Backend Status
  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const res = await fetch(`${API_BASE}/status`);
        if (!res.ok) throw new Error('Backend offline');
        const data = await res.json();
        if (!active) return;
        setBackendConnected(true);
        setRobotConnected(Boolean(data.robot_connected));
        setSerialConnected(Boolean(data.serial_connected));
        setFirebaseConnected(Boolean(data.firebase_connected));
        setSystemStatus(data.system_status);
        setMachineState(data.machine_state);
        setLastHeldState(data.last_state_before_estop || 'IDLE');
        setDo2Status(data.do2_status);
        setCurrentPosition(data.current_position);
        setActiveTask(data.active_task);
        setCounts(data.counts);
        setLogs(data.logs || []);
      } catch {
        if (!active) return;
        setBackendConnected(false);
      }
    };

    poll();
    const timer = setInterval(poll, 250);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  // Local Simulation Engine (when backend.py is not running, provides identical behavior)
  useEffect(() => {
    if (backendConnected) return;

    const interval = setInterval(() => {
      if (localStatusRef.current !== 'RUNNING') return;
      const task = localTaskRef.current;
      if (!task) return;

      const spec = FRUIT_SPECS[task.code];
      if (!spec) return;

      const stepDefs = [
        { idx: 1, label: 'MovL(P1)', durationMs: 650, pos: 'P1', do2: 0 },
        { idx: 2, label: 'DO(2, ON)', durationMs: 300, pos: 'P1', do2: 1 },
        { idx: 3, label: `Wait(${spec.wait_ms})`, durationMs: spec.wait_ms, pos: 'P1', do2: 1 },
        { idx: 4, label: 'DO(2, OFF)', durationMs: 300, pos: 'P1', do2: 0 },
        { idx: 5, label: `MovL(${spec.wp1})`, durationMs: 650, pos: spec.wp1, do2: 0 },
        { idx: 6, label: `MovL(${spec.wp2})`, durationMs: 650, pos: spec.wp2, do2: 0 },
        { idx: 7, label: 'MovL(P1)', durationMs: 650, pos: 'P1', do2: 0 },
      ];

      task.remainingStepMs = Math.max(0, task.remainingStepMs - 100);
      task.elapsedStepMs += 100;

      const currentDef = stepDefs[task.stepIndex];
      const stepLabel =
        currentDef.idx === 3
          ? `Wait(${Math.min(task.elapsedStepMs, spec.wait_ms)}ms / ${spec.wait_ms}ms)`
          : currentDef.label;
      const stateText = `Sorting ${spec.fruit_type} (${spec.color}) — Step ${currentDef.idx}/7: ${stepLabel}`;
      setMachineState(stateText);
      setLastHeldState(stateText);
      setCurrentPosition(currentDef.pos);
      setDo2Status(currentDef.do2);

      setActiveTask(prev =>
        prev
          ? {
              ...prev,
              current_step: currentDef.idx,
              current_step_label: stepLabel,
              status: 'IN_PROGRESS',
              elapsed_wait_ms:
                currentDef.idx === 3
                  ? Math.min(task.elapsedStepMs, spec.wait_ms)
                  : prev.elapsed_wait_ms,
              total_wait_ms: spec.wait_ms,
              remaining_wait_ms: Math.max(0, task.remainingStepMs),
            }
          : null
      );

      if (task.remainingStepMs <= 0) {
        const nextStepIdx = task.stepIndex + 1;
        if (nextStepIdx < stepDefs.length) {
          task.stepIndex = nextStepIdx;
          task.elapsedStepMs = 0;
          task.remainingStepMs = stepDefs[nextStepIdx].durationMs;
        } else {
          // Completed sequence! Only increment count & logs if triggered by sensor, not manual button
          if (!task.isManual) {
            const updatedCounts = { ...localCountsRef.current };
            updatedCounts[spec.key] += 1;
            updatedCounts.total += 1;
            localCountsRef.current = updatedCounts;
            setCounts(updatedCounts);

            const finishedAt = formatNow();
            setLogs(prev =>
              prev.map(l =>
                l.id === task.logId
                  ? {
                      ...l,
                      status: 'COMPLETED',
                      timestamp: finishedAt,
                      fruit_type_count: updatedCounts[spec.key],
                      total_count: updatedCounts.total,
                    }
                  : l
              )
            );
          }

          localTaskRef.current = null;
          setActiveTask(null);
          setMachineState(
            `COMPLETED ${spec.fruit_type} (${spec.color}) — Waiting for Next Sensor Signal`
          );
        }
      }
    }, 100);

    return () => clearInterval(interval);
  }, [backendConnected]);

  // Action Handlers
  const handleStart = async () => {
    setAlertMessage(null);
    if (backendConnected) {
      await fetch(`${API_BASE}/start`, { method: 'POST' });
      return;
    }

    // Local fallback
    if (localStatusRef.current === 'EMERGENCY_STOP') {
      localStatusRef.current = 'RUNNING';
      setSystemStatus('RUNNING');
      setDo2Status(localDo2BeforeEstopRef.current);
      if (localTaskRef.current) {
        setMachineState(lastHeldState);
        setActiveTask(prev => (prev ? { ...prev, status: 'IN_PROGRESS' } : null));
        setLogs(prev =>
          prev.map(l =>
            l.id === localTaskRef.current?.logId ? { ...l, status: 'IN_PROGRESS' } : l
          )
        );
      } else {
        setMachineState('RUNNING - Waiting for Sensor Signal');
      }
    } else {
      localStatusRef.current = 'RUNNING';
      setSystemStatus('RUNNING');
      if (!localTaskRef.current) {
        setMachineState('RUNNING - Waiting for Sensor Signal');
      }
    }
  };

  const handleStop = async () => {
    setAlertMessage(null);
    setDo2Status(0);
    if (backendConnected) {
      await fetch(`${API_BASE}/stop`, { method: 'POST' });
      return;
    }

    localStatusRef.current = 'STOPPED';
    setSystemStatus('STOPPED');
    setMachineState('STOPPED (Standby) - DO(2, OFF)');
  };

  const handleEmergencyStop = async () => {
    setAlertMessage(null);
    if (backendConnected) {
      await fetch(`${API_BASE}/emergency-stop`, { method: 'POST' });
      return;
    }

    if (localStatusRef.current !== 'EMERGENCY_STOP') {
      setLastHeldState(machineState);
      localDo2BeforeEstopRef.current = do2Status;
    }
    localStatusRef.current = 'EMERGENCY_STOP';
    setSystemStatus('EMERGENCY_STOP');
    setDo2Status(0);

    if (localTaskRef.current && activeTask) {
      setMachineState(
        `EMERGENCY STOP — Holding ${activeTask.fruit_type} [${activeTask.current_step_label}] (DO2 OFF)`
      );
      setActiveTask(prev => (prev ? { ...prev, status: 'HELD (E-STOP)' } : null));
      setLogs(prev =>
        prev.map(l =>
          l.id === localTaskRef.current?.logId ? { ...l, status: 'HELD (E-STOP)' } : l
        )
      );
    } else {
      setMachineState(`EMERGENCY STOP — Holding State (${machineState}) (DO2 OFF)`);
    }
  };

  const handleToggleDO2 = async (status: number) => {
    setAlertMessage(null);
    setDo2Status(status);
    if (backendConnected) {
      await fetch(`${API_BASE}/do2/${status}`, { method: 'POST' });
    }
  };

  const handleTriggerCondition = async (code: string) => {
    setAlertMessage(null);
    if (backendConnected) {
      const res = await fetch(`${API_BASE}/trigger/${code}`, { method: 'POST' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Trigger failed' }));
        setAlertMessage(err.detail || 'Trigger failed');
      }
      return;
    }

    // Local fallback
    if (localStatusRef.current === 'EMERGENCY_STOP') {
      setAlertMessage('Cannot trigger while Emergency Stop is active. Press Start (Resume) first.');
      return;
    }
    if (localStatusRef.current === 'STOPPED') {
      localStatusRef.current = 'RUNNING';
      setSystemStatus('RUNNING');
    }
    if (localTaskRef.current) {
      setAlertMessage('Robot is currently executing a condition. Wait until it finishes.');
      return;
    }

    if (code === '0') {
      setDo2Status(1);
      setMachineState('Condition 0 (DASHBOARD): DO(2, ON) Active');
      return;
    }

    const spec = FRUIT_SPECS[code];
    if (!spec) return;

    const nowStr = formatNow();

    localTaskRef.current = {
      logId: 'MANUAL-STAGE',
      code,
      stepIndex: 0,
      elapsedStepMs: 0,
      remainingStepMs: 650,
      isManual: true,
    };

    setActiveTask({
      log_id: 'MANUAL-STAGE',
      code,
      color: spec.color,
      fruit_type: spec.fruit_type,
      source: 'MANUAL',
      current_step: 1,
      total_steps: 7,
      current_step_label: 'MovL(P1)',
      sequence_str: spec.sequence,
      status: 'IN_PROGRESS',
      started_at: nowStr,
      elapsed_wait_ms: 0,
      total_wait_ms: spec.wait_ms,
      remaining_wait_ms: spec.wait_ms,
    });
  };

  const handleReset = async () => {
    setAlertMessage(null);
    if (backendConnected) {
      const res = await fetch(`${API_BASE}/reset`, { method: 'POST' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Cannot reset while active' }));
        setAlertMessage(err.detail);
      }
      return;
    }
    if (localTaskRef.current) {
      setAlertMessage('Cannot reset while a sorting sequence is active.');
      return;
    }
    localCountsRef.current = { red: 0, green: 0, blue: 0, yellow: 0, total: 0 };
    localLogCounterRef.current = 0;
    setCounts({ red: 0, green: 0, blue: 0, yellow: 0, total: 0 });
    setLogs([]);
  };

  const handleExportCSV = () => {
    const headers = [
      'Log ID',
      'Timestamp',
      'Condition Code',
      'Color',
      'Fruit Type',
      'Fruit Type Count',
      'Total Sorted Count',
      'Robot Sequence',
      'Source',
      'Status',
    ];
    const rows = logs.map(l => [
      l.id,
      l.timestamp,
      l.code,
      l.color,
      `"${l.fruit_type}"`,
      l.fruit_type_count,
      l.total_count,
      `"${l.sequence}"`,
      l.source,
      l.status,
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fruit_sorting_logs_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredLogs = logs.filter(l => {
    const matchesFruit =
      fruitFilter === 'ALL' || l.color.toUpperCase() === fruitFilter.toUpperCase();
    const matchesSearch =
      !searchQuery ||
      l.fruit_type.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.color.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.timestamp.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFruit && matchesSearch;
  });

  // Real-time minute-by-minute production rate (Last 10 minutes rolling window)
  const minuteProductionData = useMemo(() => {
    const list: { minute: string; throughput: number }[] = [];
    const now = new Date();

    for (let i = 9; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 60 * 1000);
      const pad = (n: number) => String(n).padStart(2, '0');
      const minStr = `${pad(d.getHours())}:${pad(d.getMinutes())}`;

      // Count completed sorting tasks logged in this minute
      const count = logs.filter(l => {
        if (l.status !== 'COMPLETED') return false;
        if (!l.timestamp) return false;
        return l.timestamp.includes(` ${minStr}:`);
      }).length;

      list.push({
        minute: minStr,
        throughput: count,
      });
    }

    return list;
  }, [logs]);

  const currentMinuteRate =
    minuteProductionData.length > 0
      ? minuteProductionData[minuteProductionData.length - 1].throughput
      : 0;

  // Fruit classification distribution for Donut Chart (Graph 3)
  const fruitShareData = useMemo(() => {
    return [
      { name: 'Apple (แดง)', key: 'red', value: counts.red, color: '#ef4444' },
      { name: 'ส้มหวาน (เขียว)', key: 'green', value: counts.green, color: '#10b981' },
      { name: 'ส้มเปรี้ยว (เหลือง)', key: 'yellow', value: counts.yellow, color: '#f59e0b' },
      { name: 'ส้มเสีย (น้ำเงิน)', key: 'blue', value: counts.blue, color: '#3b82f6' },
    ];
  }, [counts]);

  const activeFruitShare = useMemo(() => {
    return fruitShareData.filter(f => f.value > 0);
  }, [fruitShareData]);

  const pageMeta: Record<Page, { title: string; breadcrumb: string[] }> = {
    dashboard: { title: 'Robot Sorting Control & Dashboard', breadcrumb: ['Operations', 'Dashboard'] },
    logs: { title: 'Fruit Sorting Logs & Timestamp History', breadcrumb: ['Operations', 'Sorting Logs'] },
    'production-graph': { title: 'Production Analytics & Performance Graphs', breadcrumb: ['Operations', 'Production Graph'] },
    coordinates: { title: 'Robot Coordinates & Trajectory Logic', breadcrumb: ['Master Data', 'Coordinates'] },
  };

  return (
    <div className={isDark ? 'dark' : ''}>
      <div className="flex h-screen bg-gray-50 dark:bg-[#111c2a] overflow-hidden font-sans">
        {/* Mobile Backdrop */}
        {mobileMenuOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            onClick={() => setMobileMenuOpen(false)}
          />
        )}

        {/* SCG_New_JCMS Style Sidebar */}
        <aside
          style={{ minWidth: collapsed ? '4rem' : '15rem' }}
          className={`${
            collapsed ? 'w-16' : 'w-60'
          } bg-white dark:bg-slate-900 border-r border-gray-200 dark:border-slate-700/60 min-h-screen flex flex-col select-none shrink-0 transition-all duration-300 z-50 fixed inset-y-0 left-0 lg:static lg:translate-x-0 ${
            mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          {/* Brand Header */}
          <div className="border-b border-gray-200 dark:border-slate-700/60 flex items-center justify-center px-4 py-4">
            {collapsed ? (
              <div className="w-9 h-9 rounded-xl bg-blue-900 flex items-center justify-center text-white font-bold text-xs shadow-sm">
                HW2
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1">
                <span className="text-base font-extrabold tracking-tight text-slate-900 dark:text-white text-center">
                  HW2 Sorting system
                </span>
                <p className="text-gray-500 dark:text-slate-400 text-[9px] leading-tight whitespace-nowrap tracking-wide">
                  Industrial Robot Fruit Sorting Experience
                </p>
              </div>
            )}
          </div>

          {/* Collapse Button */}
          <button
            onClick={() => setCollapsed(c => !c)}
            className="flex items-center gap-2 mx-2 mt-2 px-3 py-2 rounded-lg text-gray-500 dark:text-slate-400 hover:text-gray-800 dark:text-white hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors text-xs overflow-hidden whitespace-nowrap"
          >
            <span className="shrink-0">
              {collapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
            </span>
            <span
              className={`overflow-hidden transition-all duration-300 ${
                collapsed ? 'w-0 opacity-0' : 'opacity-100'
              }`}
            >
              Collapse
            </span>
          </button>

          {/* Navigation Links */}
          <nav className="flex-1 py-2 px-2 space-y-1 overflow-y-auto modern-scrollbar-dark">
            {[
              { id: 'dashboard' as Page, label: 'Sorting Dashboard', icon: <LayoutDashboard size={16} /> },
              { id: 'logs' as Page, label: 'Fruit Sorting Logs', icon: <ClipboardList size={16} /> },
              { id: 'production-graph' as Page, label: 'Production Graph', icon: <BarChart3 size={16} /> },
              { id: 'coordinates' as Page, label: 'Coordinates & Logic', icon: <Cpu size={16} /> },
            ].map(item => {
              const active = page === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setPage(item.id);
                    setMobileMenuOpen(false);
                  }}
                  title={collapsed ? item.label : undefined}
                  className={`w-full flex items-center ${
                    collapsed ? 'justify-center p-2.5' : 'gap-2.5 px-3 py-2.5'
                  } rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-blue-900 dark:bg-blue-900/30 text-white dark:text-blue-400 shadow-sm'
                      : 'text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-gray-800 dark:text-white'
                  }`}
                >
                  <span className="shrink-0">{item.icon}</span>
                  {!collapsed && <span>{item.label}</span>}
                </button>
              );
            })}
          </nav>

          {/* Sidebar Footer System Summary */}
          {!collapsed && (
            <div className="p-3 m-2 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Controller Mode
                </span>
                <span
                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                    backendConnected
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-amber-50 text-amber-700'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      backendConnected ? 'bg-emerald-500' : 'bg-amber-500'
                    }`}
                  />
                  {backendConnected ? 'Backend API' : 'Sim Mode'}
                </span>
              </div>
              <div className="text-[11px] text-slate-600 dark:text-slate-400 flex justify-between">
                <span>Serial Port:</span>
                <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                  COM5 (115200)
                </span>
              </div>
              <div className="text-[11px] text-slate-600 dark:text-slate-400 flex justify-between">
                <span>Robot IP:</span>
                <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                  192.168.1.6
                </span>
              </div>
            </div>
          )}
        </aside>

        {/* Main Content Column */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* SCG_New_JCMS Style Header */}
          <header className="bg-white dark:bg-[#0b1520] border-b border-gray-200 dark:border-slate-700/60 px-6 py-3.5 flex items-center justify-between shrink-0 gap-3">
            <div className="flex items-center gap-3 shrink-0 lg:hidden">
              <button
                onClick={() => setMobileMenuOpen(true)}
                className="text-gray-500 hover:text-gray-800 dark:text-white"
              >
                <Menu size={20} />
              </button>
            </div>

            <div className="flex-1 min-w-0 px-2 flex items-baseline gap-2 truncate whitespace-nowrap">
              <h1 className="text-xl font-bold text-gray-800 dark:text-slate-200 truncate">
                {pageMeta[page].title}
              </h1>
            </div>

            {/* Hardware Connection Status Pills */}
            <div className="flex items-center gap-3 shrink-0">
              <div className="hidden md:flex items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${
                    robotConnected
                      ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'
                      : 'bg-gray-100 text-gray-600 ring-gray-500/20'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      robotConnected ? 'bg-emerald-500' : 'bg-gray-400'
                    }`}
                  />
                  Dobot: {robotConnected ? 'Connected' : 'Simulation'}
                </span>

                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${
                    serialConnected
                      ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'
                      : 'bg-gray-100 text-gray-600 ring-gray-500/20'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      serialConnected ? 'bg-emerald-500' : 'bg-gray-400'
                    }`}
                  />
                  COM5: {serialConnected ? 'Online' : 'Standby'}
                </span>

                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${
                    firebaseConnected
                      ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'
                      : 'bg-gray-100 text-gray-600 ring-gray-500/20'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      firebaseConnected ? 'bg-emerald-500 animate-pulse' : 'bg-gray-400'
                    }`}
                  />
                  Firebase: {firebaseConnected ? 'Connected' : 'Offline'}
                </span>
              </div>
            </div>
          </header>

          {/* Main Scrollable Body */}
          <main className="flex-1 overflow-y-auto p-6 space-y-6 modern-scrollbar">
            {/* Emergency Stop Banner if Active */}
            {systemStatus === 'EMERGENCY_STOP' && (
              <div className="bg-red-50 border-2 border-red-500 rounded-xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-sm">
                <div className="flex items-start gap-3">
                  <AlertOctagon className="text-red-600 shrink-0 mt-0.5" size={24} />
                  <div>
                    <h3 className="text-sm font-bold text-red-900 uppercase tracking-wide">
                      Emergency Stop Active — Robot Holding Last State
                    </h3>
                    <p className="text-xs text-red-700 mt-0.5">
                      Held State: <span className="font-semibold">{lastHeldState}</span>
                      {activeTask && (
                        <span>
                          {' '}
                          | Paused at Step {activeTask.current_step}/6 ({activeTask.current_step_label})
                        </span>
                      )}
                    </p>
                    <p className="text-[11px] text-red-600 mt-1">
                      Press the green <strong>START / RESUME</strong> button to continue executing the
                      held task from where it stopped.
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleStart}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold uppercase tracking-wider rounded-lg shadow-sm flex items-center gap-2 shrink-0 transition-colors"
                >
                  <Play size={15} />
                  Resume Held Task
                </button>
              </div>
            )}

            {/* Alert Message Banner */}
            {alertMessage && (
              <div className="bg-amber-50 border border-amber-300 text-amber-800 px-4 py-3 rounded-xl text-xs font-medium flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={16} className="text-amber-600 shrink-0" />
                  <span>{alertMessage}</span>
                </div>
                <button
                  onClick={() => setAlertMessage(null)}
                  className="text-amber-700 hover:text-amber-900 font-bold text-xs"
                >
                  Dismiss
                </button>
              </div>
            )}

            {page === 'dashboard' && (
              <>
                {/* 1. Machine Command & State Control Section */}
                <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm flex flex-col justify-between space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                      <div className="w-1.5 h-4 bg-blue-500 rounded-full" />
                      Machine Command Panel
                    </h2>
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ring-1 ring-inset ${
                        systemStatus === 'RUNNING'
                          ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'
                          : systemStatus === 'EMERGENCY_STOP'
                          ? 'bg-red-50 text-red-700 ring-red-600/20 animate-pulse'
                          : 'bg-gray-100 text-gray-600 ring-gray-500/20'
                      }`}
                    >
                      {systemStatus}
                    </span>
                  </div>

                  {/* 3 Main Control Buttons: START, STOP, EMERGENCY STOP */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <button
                      onClick={handleStart}
                      disabled={systemStatus === 'RUNNING'}
                      className={`flex flex-col items-center justify-center gap-2 p-4 rounded-xl border font-bold text-xs uppercase tracking-wider transition-all ${
                        systemStatus === 'RUNNING'
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-700 cursor-default'
                          : 'bg-emerald-600 hover:bg-emerald-700 border-emerald-700 text-white shadow-sm hover:shadow'
                      }`}
                    >
                      <Play size={22} />
                      <span>
                        {systemStatus === 'EMERGENCY_STOP' ? 'Start (Resume)' : 'Start'}
                      </span>
                    </button>

                    <button
                      onClick={handleStop}
                      disabled={systemStatus === 'STOPPED'}
                      className={`flex flex-col items-center justify-center gap-2 p-4 rounded-xl border font-bold text-xs uppercase tracking-wider transition-all ${
                        systemStatus === 'STOPPED'
                          ? 'bg-gray-100 border-gray-200 text-gray-400 cursor-default'
                          : 'bg-slate-700 hover:bg-slate-800 border-slate-800 text-white shadow-sm hover:shadow'
                      }`}
                    >
                      <Square size={22} />
                      <span>Stop</span>
                    </button>

                    <button
                      onClick={handleEmergencyStop}
                      className={`flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 font-extrabold text-xs uppercase tracking-wider transition-all ${
                        systemStatus === 'EMERGENCY_STOP'
                          ? 'bg-red-700 border-red-900 text-white ring-4 ring-red-500/30'
                          : 'bg-red-600 hover:bg-red-700 border-red-700 text-white shadow-sm hover:shadow-md'
                      }`}
                    >
                      <AlertOctagon size={22} />
                      <span>Emergency Stop</span>
                    </button>
                  </div>
                </div>

                {/* 2. Machine Status Panel (Sensor, Conveyor Belt, Robot Arm) */}
                <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                      <div className="w-1.5 h-4 bg-indigo-600 rounded-full" />
                      Machine Status (สถานะการทำงานของเครื่องจักร)
                    </h2>
                    <span className="text-xs text-slate-500 font-medium flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      Live Telemetry
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Status 1: Color / Vision Sensor */}
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 flex flex-col justify-between space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                            <Radio size={18} />
                          </div>
                          <div>
                            <span className="text-xs font-bold text-slate-800 uppercase tracking-wider block">
                              1. เซนเซอร์ตรวจจับ (Sensor)
                            </span>
                            <span className="text-[10px] text-slate-500 font-mono">
                              Port: COM5 (115200)
                            </span>
                          </div>
                        </div>
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ring-1 ring-inset ${
                            serialConnected || backendConnected
                              ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'
                              : 'bg-amber-50 text-amber-700 ring-amber-600/20'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              serialConnected || backendConnected
                                ? 'bg-emerald-500 animate-pulse'
                                : 'bg-amber-500'
                            }`}
                          />
                          {serialConnected || backendConnected ? 'ONLINE' : 'SIMULATED'}
                        </span>
                      </div>

                      <div className="bg-white p-3 rounded-lg border border-slate-200/70 space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-500">สถานะการตรวจจับ:</span>
                          <span className="font-semibold text-slate-800">
                            {activeTask
                              ? `พบ ${activeTask.fruit_type}`
                              : systemStatus === 'RUNNING'
                              ? 'กำลังตรวจจับ (Listening...)'
                              : 'Standby'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-500">สัญญาณล่าสุด:</span>
                          <span className="font-mono font-bold text-blue-700">
                            {activeTask ? `Condition Code ${activeTask.code} (${activeTask.color})` : 'รอสัญญาณผลไม้'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Status 2: Conveyor Belt DO(2) */}
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 flex flex-col justify-between space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                              do2Status === 1
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-slate-200 text-slate-600'
                            }`}
                          >
                            <Zap size={18} />
                          </div>
                          <div>
                            <span className="text-xs font-bold text-slate-800 uppercase tracking-wider block">
                              2. สายพานลำเลียง (Conveyor Belt)
                            </span>
                            <span className="text-[10px] text-slate-500 font-mono">
                              Digital Output: DO(2)
                            </span>
                          </div>
                        </div>
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ring-1 ring-inset ${
                            do2Status === 1
                              ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'
                              : 'bg-slate-100 text-slate-600 ring-slate-500/20'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              do2Status === 1 ? 'bg-emerald-500 animate-ping' : 'bg-slate-400'
                            }`}
                          />
                          {do2Status === 1 ? 'RUNNING (ON)' : 'STOPPED (OFF)'}
                        </span>
                      </div>

                      <div className="bg-white p-3 rounded-lg border border-slate-200/70 space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-500">สถานะมอเตอร์:</span>
                          <span className={`font-semibold ${do2Status === 1 ? 'text-emerald-700' : 'text-slate-700'}`}>
                            {do2Status === 1 ? 'กำลังหมุนลำเลียงผลไม้' : 'มอเตอร์หยุดนิ่ง'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-500">การหน่วงเวลา:</span>
                          <span className="font-mono text-slate-700">
                            {activeTask && activeTask.total_wait_ms
                              ? `Wait ${activeTask.elapsed_wait_ms || 0}ms / ${activeTask.total_wait_ms}ms`
                              : 'Normal Speed'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Status 3: Dobot MG400 Robot Arm */}
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 flex flex-col justify-between space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
                            <Cpu size={18} />
                          </div>
                          <div>
                            <span className="text-xs font-bold text-slate-800 uppercase tracking-wider block">
                              3. แขนกล (Dobot MG400)
                            </span>
                            <span className="text-[10px] text-slate-500 font-mono">
                              IP: 192.168.1.6
                            </span>
                          </div>
                        </div>
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ring-1 ring-inset ${
                            robotConnected || backendConnected
                              ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'
                              : 'bg-amber-50 text-amber-700 ring-amber-600/20'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              robotConnected || backendConnected ? 'bg-emerald-500' : 'bg-amber-500'
                            }`}
                          />
                          {robotConnected || backendConnected ? 'CONNECTED' : 'STANDBY'}
                        </span>
                      </div>

                      <div className="bg-white p-3 rounded-lg border border-slate-200/70 space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-500">พิกัดปัจจุบัน:</span>
                          <span className="font-mono font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">
                            {currentPosition}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-500">สเตจการทำงาน:</span>
                          <span className="font-medium text-slate-800 truncate max-w-[150px]" title={machineState}>
                            {activeTask
                              ? `Step ${activeTask.current_step}/${activeTask.total_steps || 7}: ${activeTask.current_step_label}`
                              : systemStatus === 'RUNNING'
                              ? 'Standby at P1'
                              : systemStatus}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3. Manual Control Panel Card */}
                <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                      <div className="w-1.5 h-4 bg-amber-500 rounded-full" />
                      Manual Control Panel (การควบคุมแบบ Manual)
                    </h2>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                    {/* DO2 Conveyor Belt Control (Left side) */}
                    <div className="lg:col-span-5 p-4 rounded-xl bg-slate-50 border border-slate-200/80 flex flex-col justify-between space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                          สายพานลำเลียง (Conveyor Belt)
                        </span>
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold ring-1 ring-inset ${
                            do2Status === 1
                              ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'
                              : 'bg-gray-100 text-gray-600 ring-gray-500/20'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              do2Status === 1 ? 'bg-emerald-500' : 'bg-gray-400'
                            }`}
                          />
                          {do2Status === 1 ? 'ON (กำลังหมุน)' : 'OFF (หยุดนิ่ง)'}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => handleToggleDO2(1)}
                          className={`py-2.5 px-3 rounded-lg border text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${
                            do2Status === 1
                              ? 'bg-emerald-600 border-emerald-700 text-white shadow-sm ring-2 ring-emerald-500/30'
                              : 'bg-white border-slate-200 text-slate-700 hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-700'
                          }`}
                        >
                          <Play size={13} />
                          <span>เปิดสายพาน (ON)</span>
                        </button>
                        <button
                          onClick={() => handleToggleDO2(0)}
                          className={`py-2.5 px-3 rounded-lg border text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${
                            do2Status === 0
                              ? 'bg-slate-700 border-slate-800 text-white shadow-sm'
                              : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                          }`}
                        >
                          <Square size={13} />
                          <span>ปิดสายพาน (OFF)</span>
                        </button>
                      </div>
                    </div>

                    {/* Manual Fruit Sorting Triggers (Right side) */}
                    <div className="lg:col-span-7 p-4 rounded-xl bg-slate-50 border border-slate-200/80 flex flex-col justify-between space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                          กดคัดแยกส้ม / ผลไม้แต่ละชนิด (Manual Stage)
                        </span>
                        {activeTask && (
                          <span className="text-[11px] text-blue-700 font-semibold">
                            กำลังรัน: {activeTask.fruit_type}
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {/* Red: Apple */}
                        <button
                          onClick={() => handleTriggerCondition('2')}
                          disabled={Boolean(activeTask)}
                          className="p-2.5 rounded-lg border border-red-200 bg-red-50/70 hover:bg-red-100 text-red-900 font-bold text-xs flex flex-col items-center justify-center gap-1 transition-all shadow-sm hover:shadow disabled:opacity-50"
                        >
                          <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
                          <span>Apple (แดง)</span>
                          <span className="text-[10px] text-red-700 font-normal">Wait 2s → P4 → P5</span>
                        </button>

                        {/* Green: Good Sweet Orange */}
                        <button
                          onClick={() => handleTriggerCondition('3')}
                          disabled={Boolean(activeTask)}
                          className="p-2.5 rounded-lg border border-emerald-200 bg-emerald-50/70 hover:bg-emerald-100 text-emerald-900 font-bold text-xs flex flex-col items-center justify-center gap-1 transition-all shadow-sm hover:shadow disabled:opacity-50"
                        >
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                          <span>ส้มหวาน (เขียว)</span>
                          <span className="text-[10px] text-emerald-700 font-normal">Wait 1s → P2 → P3</span>
                        </button>

                        {/* Blue: Bad Orange */}
                        <button
                          onClick={() => handleTriggerCondition('4')}
                          disabled={Boolean(activeTask)}
                          className="p-2.5 rounded-lg border border-blue-200 bg-blue-50/70 hover:bg-blue-100 text-blue-900 font-bold text-xs flex flex-col items-center justify-center gap-1 transition-all shadow-sm hover:shadow disabled:opacity-50"
                        >
                          <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                          <span>ส้มเสีย (น้ำเงิน)</span>
                          <span className="text-[10px] text-blue-700 font-normal">Wait 2s → P5 → P4</span>
                        </button>

                        {/* Yellow: Good Sour Orange */}
                        <button
                          onClick={() => handleTriggerCondition('1')}
                          disabled={Boolean(activeTask)}
                          className="p-2.5 rounded-lg border border-amber-200 bg-amber-50/70 hover:bg-amber-100 text-amber-900 font-bold text-xs flex flex-col items-center justify-center gap-1 transition-all shadow-sm hover:shadow disabled:opacity-50"
                        >
                          <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                          <span>ส้มเปรี้ยว (เหลือง)</span>
                          <span className="text-[10px] text-amber-700 font-normal">Wait 1s → P3 → P2</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3. Fruit Sorting Counter Cards (SCG_New_JCMS KPI Row Style) */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Fruit Classification Counters
                    </h3>
                    <button
                      onClick={handleReset}
                      className="text-xs font-semibold text-slate-600 hover:text-red-600 flex items-center gap-1 transition-colors"
                    >
                      <RotateCcw size={13} />
                      Reset Counts & Logs
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                    {/* Total Card */}
                    <div className="bg-white p-4 rounded-xl border border-gray-100 border-l-4 border-l-blue-900 shadow-sm flex flex-col justify-start">
                      <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                        TOTAL FRUITS SORTED
                      </span>
                      <div className="mt-1 flex items-baseline gap-2">
                        <span className="text-3xl font-bold text-gray-900">{counts.total}</span>
                        <span className="text-xs text-gray-400 font-medium">pcs</span>
                      </div>
                    </div>

                    {/* Red: Apple */}
                    <div className="bg-white p-4 rounded-xl border border-gray-100 border-l-4 border-l-red-500 shadow-sm flex flex-col justify-start">
                      <span className="text-[11px] font-bold text-red-600 uppercase tracking-wider">
                        RED — APPLE
                      </span>
                      <div className="mt-1 flex items-baseline gap-2">
                        <span className="text-3xl font-bold text-gray-900">{counts.red}</span>
                        <span className="text-xs text-gray-400 font-medium">pcs</span>
                      </div>
                    </div>

                    {/* Green: Good Sweet Orange */}
                    <div className="bg-white p-4 rounded-xl border border-gray-100 border-l-4 border-l-emerald-500 shadow-sm flex flex-col justify-start">
                      <span className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider truncate">
                        GREEN — GOOD SWEET ORANGE
                      </span>
                      <div className="mt-1 flex items-baseline gap-2">
                        <span className="text-3xl font-bold text-gray-900">{counts.green}</span>
                        <span className="text-xs text-gray-400 font-medium">pcs</span>
                      </div>
                    </div>

                    {/* Blue: Bad Orange */}
                    <div className="bg-white p-4 rounded-xl border border-gray-100 border-l-4 border-l-blue-500 shadow-sm flex flex-col justify-start">
                      <span className="text-[11px] font-bold text-blue-600 uppercase tracking-wider">
                        BLUE — BAD ORANGE
                      </span>
                      <div className="mt-1 flex items-baseline gap-2">
                        <span className="text-3xl font-bold text-gray-900">{counts.blue}</span>
                        <span className="text-xs text-gray-400 font-medium">pcs</span>
                      </div>
                    </div>

                    {/* Yellow: Good Sour Orange */}
                    <div className="bg-white p-4 rounded-xl border border-gray-100 border-l-4 border-l-amber-400 shadow-sm flex flex-col justify-start">
                      <span className="text-[11px] font-bold text-amber-600 uppercase tracking-wider truncate">
                        YELLOW — GOOD SOUR ORANGE
                      </span>
                      <div className="mt-1 flex items-baseline gap-2">
                        <span className="text-3xl font-bold text-gray-900">{counts.yellow}</span>
                        <span className="text-xs text-gray-400 font-medium">pcs</span>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* 3. Fruit Sorting Log Table (Shown on Dashboard & Logs Page) */}
            {(page === 'dashboard' || page === 'logs') && (
              <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                    <div className="w-1.5 h-4 bg-blue-500 rounded-full" />
                    Fruit Sorting Log & Timestamp History
                  </h2>

                  <div className="flex flex-wrap items-center gap-2">
                    {/* Search Input */}
                    <div className="relative">
                      <Search
                        size={14}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                      />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder="Search fruit, color, ID..."
                        className="pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      />
                    </div>

                    {/* Filter by Color/Fruit */}
                    <select
                      value={fruitFilter}
                      onChange={e => setFruitFilter(e.target.value)}
                      className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg bg-white text-slate-700 focus:outline-none"
                    >
                      <option value="ALL">All Fruit Types ({logs.length})</option>
                      <option value="RED">Red — Apple ({counts.red})</option>
                      <option value="GREEN">Green — Good sweet Orange ({counts.green})</option>
                      <option value="BLUE">Blue — Bad Orange ({counts.blue})</option>
                      <option value="YELLOW">Yellow — Good Sour Orange ({counts.yellow})</option>
                    </select>

                    <button
                      onClick={handleExportCSV}
                      disabled={logs.length === 0}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 text-slate-700 hover:bg-gray-50 disabled:opacity-40 flex items-center gap-1.5"
                    >
                      <Download size={13} />
                      Export CSV
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-gray-200 bg-slate-50/80 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                        <th className="py-3 px-4">Log ID</th>
                        <th className="py-3 px-4">Timestamp</th>
                        <th className="py-3 px-4">Color</th>
                        <th className="py-3 px-4">Fruit Type</th>
                        <th className="py-3 px-4 text-center">Fruit Type Count</th>
                        <th className="py-3 px-4 text-center">Total Count</th>
                        <th className="py-3 px-4 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-xs">
                      {filteredLogs.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-10 text-center text-gray-400">
                            No fruit sorting logs recorded yet. Press <strong>START</strong> and
                            trigger a sensor condition to log sorting events.
                          </td>
                        </tr>
                      ) : (
                        filteredLogs.map(log => {
                          const spec = FRUIT_SPECS[log.code];
                          return (
                            <tr
                              key={log.id}
                              className="hover:bg-slate-50/80 transition-colors"
                            >
                              <td className="py-3 px-4 font-mono font-bold text-slate-800">
                                {log.id}
                              </td>
                              <td className="py-3 px-4 font-mono text-slate-600 flex items-center gap-1.5">
                                <Clock size={12} className="text-gray-400 shrink-0" />
                                {log.timestamp}
                              </td>
                              <td className="py-3 px-4">
                                <span
                                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${
                                    spec?.badgeBg || 'bg-gray-100 text-gray-700'
                                  }`}
                                >
                                  <span
                                    className={`w-1.5 h-1.5 rounded-full ${
                                      spec?.dotColor || 'bg-gray-400'
                                    }`}
                                  />
                                  {log.color} (Code {log.code})
                                </span>
                              </td>
                              <td className="py-3 px-4 font-bold text-slate-900">
                                {log.fruit_type}
                              </td>
                              <td className="py-3 px-4 text-center">
                                <span className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-md bg-slate-100 font-bold text-slate-800">
                                  #{log.fruit_type_count} ({log.fruit_type})
                                </span>
                              </td>
                              <td className="py-3 px-4 text-center font-mono font-bold text-slate-700">
                                {log.total_count}
                              </td>
                              <td className="py-3 px-4 text-center">
                                <span
                                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${
                                    log.status === 'COMPLETED'
                                      ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'
                                      : log.status === 'HELD (E-STOP)'
                                      ? 'bg-red-50 text-red-700 ring-red-600/20'
                                      : 'bg-blue-50 text-blue-800 ring-blue-700/20'
                                  }`}
                                >
                                  {log.status}
                                </span>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 4. Production Analytics & Performance Graphs Page */}
            {page === 'production-graph' && (
              <div className="space-y-6">
                {/* Top Production Summary Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-white p-4 rounded-xl border border-gray-100 border-l-4 border-l-blue-900 shadow-sm flex items-center justify-between">
                    <div>
                      <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                        Total Output (กำลังผลิตสะสม)
                      </span>
                      <div className="mt-1 flex items-baseline gap-2">
                        <span className="text-3xl font-bold text-gray-900">{counts.total}</span>
                        <span className="text-xs text-gray-400 font-medium">pcs</span>
                      </div>
                    </div>
                    <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-900 flex items-center justify-center">
                      <TrendingUp size={20} />
                    </div>
                  </div>

                  <div className="bg-white p-4 rounded-xl border border-gray-100 border-l-4 border-l-emerald-500 shadow-sm flex items-center justify-between">
                    <div>
                      <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                        Quality Pass Rate (อัตราผลผลิตดี)
                      </span>
                      <div className="mt-1 flex items-baseline gap-2">
                        <span className="text-3xl font-bold text-gray-900">
                          {counts.total > 0
                            ? (((counts.total - counts.blue) / counts.total) * 100).toFixed(1)
                            : '100.0'}
                          %
                        </span>
                      </div>
                    </div>
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
                      <CheckCircle2 size={20} />
                    </div>
                  </div>

                  <div className="bg-white p-4 rounded-xl border border-gray-100 border-l-4 border-l-amber-500 shadow-sm flex items-center justify-between">
                    <div>
                      <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                        Avg Cycle Time (ความเร็วเฉลี่ย/ชิ้น)
                      </span>
                      <div className="mt-1 flex items-baseline gap-2">
                        <span className="text-3xl font-bold text-gray-900">4.1</span>
                        <span className="text-xs text-gray-400 font-medium">sec / pcs</span>
                      </div>
                    </div>
                    <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center">
                      <Timer size={20} />
                    </div>
                  </div>

                  <div className="bg-white p-4 rounded-xl border border-gray-100 border-l-4 border-l-purple-600 shadow-sm flex items-center justify-between">
                    <div>
                      <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                        OEE Efficiency (ประสิทธิภาพโดยรวม)
                      </span>
                      <div className="mt-1 flex items-baseline gap-2">
                        <span className="text-3xl font-bold text-gray-900">89.4%</span>
                        <span className="text-xs text-emerald-600 font-semibold">World Class</span>
                      </div>
                    </div>
                    <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center">
                      <Gauge size={20} />
                    </div>
                  </div>
                </div>

                {/* Row 1: Graph 1 & Graph 2 */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Graph 1: Actual Output vs Production Target by Fruit Type */}
                  <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                        <div className="w-1.5 h-4 bg-blue-500 rounded-full" />
                        1. Fruit Sorting Output vs Target (ยอดผลผลิตแยกตามชนิด)
                      </h3>
                      <span className="text-xs font-semibold text-gray-400">Target vs Actual</span>
                    </div>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={[
                            { name: 'Apple (แดง)', actual: counts.red, target: 20 },
                            { name: 'ส้มหวาน (เขียว)', actual: counts.green, target: 20 },
                            { name: 'ส้มเสีย (น้ำเงิน)', actual: counts.blue, target: 10 },
                            { name: 'ส้มเปรี้ยว (เหลือง)', actual: counts.yellow, target: 20 },
                          ]}
                          margin={{ top: 10, right: 20, left: -10, bottom: 0 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 11 }} />
                          <Tooltip />
                          <Legend wrapperStyle={{ fontSize: 12 }} />
                          <Bar dataKey="actual" name="Actual Sorted (คัดแยกจริง)" fill="#2563eb" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="target" name="Target Plan (เป้าหมาย)" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Graph 2: Minute-by-Minute Production Rate */}
                  <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                        <div className="w-1.5 h-4 bg-emerald-500 rounded-full" />
                        2. Minute-by-Minute Production Rate (อัตราการผลิตรายนาที)
                      </h3>
                      <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                        {currentMinuteRate} Pcs / Min (นาทีนี้)
                      </span>
                    </div>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart
                          data={minuteProductionData}
                          margin={{ top: 10, right: 20, left: -10, bottom: 0 }}
                        >
                          <defs>
                            <linearGradient id="colorMinuteThroughput" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#10b981" stopOpacity={0.8} />
                              <stop offset="95%" stopColor="#10b981" stopOpacity={0.05} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                          <XAxis dataKey="minute" tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 11 }} allowDecimals={false} domain={[0, 'auto']} />
                          <Tooltip
                            formatter={(value: any) => [`${value} ชิ้น / นาที`, 'อัตราการผลิต']}
                            labelFormatter={(label: any) => `เวลา ${label} น.`}
                          />
                          <Legend wrapperStyle={{ fontSize: 12 }} />
                          <Area
                            type="monotone"
                            dataKey="throughput"
                            name="Minute Output (ชิ้น/นาที)"
                            stroke="#10b981"
                            strokeWidth={2.5}
                            fillOpacity={1}
                            fill="url(#colorMinuteThroughput)"
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>

                {/* Row 2: Graph 3 & Graph 4 */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Graph 3: Fruit Yield & Quality Distribution (Solid Pie Chart) */}
                  <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                        <div className="w-1.5 h-4 bg-amber-500 rounded-full" />
                        3. Fruit Classification & Defect Share (สัดส่วนผลผลิตและของเสีย - Pie Chart)
                      </h3>
                      <span className="text-xs font-semibold text-slate-500">
                        {counts.total > 0 ? `รวม ${counts.total} ชิ้น` : '0 ชิ้น'}
                      </span>
                    </div>

                    {counts.total === 0 ? (
                      <div className="h-64 flex flex-col items-center justify-center text-slate-400 space-y-3">
                        <div className="w-28 h-28 rounded-full border-4 border-dashed border-slate-200 flex flex-col items-center justify-center">
                          <span className="text-lg font-black text-slate-300">0</span>
                          <span className="text-[10px] text-slate-400 uppercase font-medium">ไม่มีข้อมูล</span>
                        </div>
                        <p className="text-xs text-slate-400 text-center">
                          ยังไม่มีข้อมูลการคัดแยกผลไม้ในระบบ<br />
                          กด Start หรือกดปุ่มคัดแยกเพื่อเริ่มบันทึก
                        </p>
                      </div>
                    ) : (
                      <div className="w-full h-64 relative">
                        <ResponsiveContainer width="100%" height="100%">
                          <RechartsPieChart margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                            <Pie
                              data={activeFruitShare}
                              cx="50%"
                              cy="50%"
                              innerRadius={0}
                              outerRadius={85}
                              dataKey="value"
                              labelLine={false}
                              label={renderCustomizedPieLabel}
                              isAnimationActive={false}
                            >
                              {activeFruitShare.map((entry) => (
                                <Cell
                                  key={`cell-${entry.name}`}
                                  fill={entry.color}
                                  stroke="#ffffff"
                                  strokeWidth={2}
                                />
                              ))}
                            </Pie>
                            <Tooltip
                              formatter={(value: any, name: any) => [
                                `${value} ชิ้น (${(((Number(value) || 0) / counts.total) * 100).toFixed(1)}%)`,
                                name,
                              ]}
                            />
                            <Legend
                              verticalAlign="bottom"
                              height={36}
                              iconType="circle"
                              wrapperStyle={{ fontSize: 11 }}
                              formatter={(value: string) => {
                                const item = fruitShareData.find(p => p.name === value);
                                const count = item ? item.value : 0;
                                const pct = counts.total > 0 ? ((count / counts.total) * 100).toFixed(0) : '0';
                                return `${value}: ${count} ชิ้น (${pct}%)`;
                              }}
                            />
                          </RechartsPieChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>

                  {/* Graph 4: Cycle Time & Motion Breakdown */}
                  <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                        <div className="w-1.5 h-4 bg-purple-500 rounded-full" />
                        4. Cycle Time & Motion Analysis (เวลาการเคลื่อนที่และหน่วงเวลา)
                      </h3>
                      <span className="text-xs font-semibold text-gray-400">Seconds / Stage</span>
                    </div>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={[
                            { stage: 'Apple (แดง)', motion: 2.8, wait: 2.0 },
                            { stage: 'ส้มหวาน (เขียว)', motion: 2.8, wait: 1.0 },
                            { stage: 'ส้มเสีย (น้ำเงิน)', motion: 2.8, wait: 2.0 },
                            { stage: 'ส้มเปรี้ยว (เหลือง)', motion: 2.8, wait: 1.0 },
                          ]}
                          margin={{ top: 10, right: 20, left: -10, bottom: 0 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                          <XAxis dataKey="stage" tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 11 }} unit="s" />
                          <Tooltip />
                          <Legend wrapperStyle={{ fontSize: 12 }} />
                          <Bar dataKey="motion" name="Robot Motion Time (เวลาเคลื่อนที่)" fill="#6366f1" stackId="a" />
                          <Bar dataKey="wait" name="Gripper/DO2 Wait Time (เวลาหน่วง)" fill="#ec4899" stackId="a" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>

                {/* Row 3: Graph 5 (Full Width) */}
                <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                      <div className="w-1.5 h-4 bg-blue-600 rounded-full" />
                      5. Machine Overall Equipment Effectiveness (OEE ประสิทธิภาพรวมของเครื่องจักร)
                    </h3>
                    <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full">
                      Overall OEE: 89.4% (World Class Standard)
                    </span>
                  </div>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={[
                          { metric: 'Availability (ความพร้อมใช้งาน)', actual: 98.2, benchmark: 90.0 },
                          { metric: 'Performance (สมรรถนะความเร็ว)', actual: 93.5, benchmark: 95.0 },
                          {
                            metric: 'Quality Rate (คุณภาพผลผลิตดี)',
                            actual: counts.total > 0 ? parseFloat((((counts.total - counts.blue) / counts.total) * 100).toFixed(1)) : 96.5,
                            benchmark: 99.0,
                          },
                          { metric: 'Overall OEE Index (ดัชนีรวม)', actual: 89.4, benchmark: 85.0 },
                        ]}
                        layout="vertical"
                        margin={{ top: 10, right: 25, left: 140, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis type="number" domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} />
                        <YAxis dataKey="metric" type="category" tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Bar dataKey="actual" name="Actual Machine Rate (% จริง)" fill="#0ea5e9" radius={[0, 4, 4, 0]} />
                        <Bar dataKey="benchmark" name="Industry Benchmark (% มาตรฐาน)" fill="#cbd5e1" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )}

            {/* 5. Coordinates & Logic Page */}
            {page === 'coordinates' && (
              <div className="space-y-6">
                <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm space-y-4">
                  <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                    <div className="w-1.5 h-4 bg-blue-500 rounded-full" />
                    Dobot MG400 Calibrated Point Coordinates (P1 – P5)
                  </h2>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-gray-200 bg-slate-50 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                          <th className="py-3 px-4">Name</th>
                          <th className="py-3 px-4">X (mm)</th>
                          <th className="py-3 px-4">Y (mm)</th>
                          <th className="py-3 px-4">Z (mm)</th>
                          <th className="py-3 px-4">R (deg)</th>
                          <th className="py-3 px-4">User</th>
                          <th className="py-3 px-4">Tool</th>
                          <th className="py-3 px-4">Operational Role</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 text-xs">
                        {COORDINATES_TABLE.map(pt => (
                          <tr key={pt.name} className="hover:bg-slate-50">
                            <td className="py-3 px-4 font-mono font-bold text-blue-900">
                              {pt.name}
                            </td>
                            <td className="py-3 px-4 font-mono">{pt.x}</td>
                            <td className="py-3 px-4 font-mono">{pt.y}</td>
                            <td className="py-3 px-4 font-mono">{pt.z}</td>
                            <td className="py-3 px-4 font-mono">{pt.r}</td>
                            <td className="py-3 px-4 font-mono">{pt.user}</td>
                            <td className="py-3 px-4 font-mono">{pt.tool}</td>
                            <td className="py-3 px-4 text-slate-600">{pt.role}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Condition Logic Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {Object.values(FRUIT_SPECS).map(spec => (
                    <div
                      key={spec.code}
                      className={`bg-white rounded-xl border border-gray-100 ${spec.cardAccent} p-4 shadow-sm space-y-2`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase text-slate-800">
                          {spec.color} — {spec.fruit_type}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ring-1 ring-inset ${spec.badgeBg}`}
                        >
                          line == "{spec.code}"
                        </span>
                      </div>
                      <pre className="p-3 rounded-lg bg-slate-50 border border-slate-200/70 text-[11px] font-mono text-slate-700 leading-relaxed">
{`-- ${spec.color} (${spec.fruit_type})
MovL(P1)
DO(2,ON)
Wait(${spec.wait_ms})
DO(2,OFF)
MovL(${spec.wp1})
MovL(${spec.wp2})`}
                      </pre>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
