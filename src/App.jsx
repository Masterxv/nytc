/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Activity, TrendingUp, TrendingDown, Clock, ShieldAlert, BarChart3 } from 'lucide-react';

// --- MATH ENGINE ---

function getStdev(window) {
  if (window.length === 0) return 0;
  const mean = window.reduce((a, b) => a + b, 0) / window.length;
  const variance = window.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / window.length;
  return Math.sqrt(variance);
}

function calculateSma(data, length) {
  if (data.length < length) return new Array(data.length).fill(0);
  const sma = [];
  for (let i = length; i <= data.length; i++) {
    const window = data.slice(i - length, i);
    const sum = window.reduce((a, b) => a + b, 0);
    sma.push(sum / length);
  }
  return [...new Array(length - 1).fill(0), ...sma];
}

function calculateEma(data, length) {
  if (data.length < length) return new Array(data.length).fill(0);
  
  const ema = [];
  const initialSma = data.slice(0, length).reduce((a, b) => a + b, 0) / length;
  ema.push(initialSma);
  
  const multiplier = 2 / (length + 1);
  
  for (let i = length; i < data.length; i++) {
    const val = (data[i] - ema[ema.length - 1]) * multiplier + ema[ema.length - 1];
    ema.push(val);
  }
  
  return [...new Array(length - 1).fill(0), ...ema];
}

function calculateRsi(closes, length = 14) {
  if (closes.length <= length) return 50;
  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }

  let avgGain = gains / length;
  let avgLoss = losses / length;

  for (let i = length + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) {
      avgGain = (avgGain * (length - 1) + diff) / length;
      avgLoss = (avgLoss * (length - 1)) / length;
    } else {
      avgGain = (avgGain * (length - 1)) / length;
      avgLoss = (avgLoss * (length - 1) - diff) / length;
    }
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

// --- INDICATOR ENGINES ---

const BB_PERIODS = 20;
const BB_DEV = 2.0;

function calculateAtr(highs, lows, closes, length = 14) {
  if (closes.length <= length) return 0;
  let trSum = 0;
  for (let i = 1; i < closes.length; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
    if (i >= closes.length - length) trSum += tr;
  }
  return trSum / length;
}

function getMomentumSystem(closes) {
  const rsi = calculateRsi(closes);
  const ema9 = calculateEma(closes, 9);
  const ema21 = calculateEma(closes, 21);
  const last9 = ema9[ema9.length - 1];
  const last21 = ema21[ema21.length - 1];
  
  let signal = 'NEUTRAL';
  let color = 'GRAY';
  let emoji = '⚪';

  if (rsi < 40 && last9 > last21) { signal = 'MOMENTUM BUY'; color = 'LIME'; emoji = '🚀'; }
  else if (rsi > 60 && last9 < last21) { signal = 'MOMENTUM SELL'; color = 'RED'; emoji = '📉'; }
  
  return { name: 'Momentum Scalper', signal, color, emoji, details: `RSI: ${rsi.toFixed(1)}` };
}

function getVolatilitySystem(highs, lows, closes) {
  const sma = calculateSma(closes, BB_PERIODS);
  const lastSma = sma[sma.length - 1];
  const window = closes.slice(-BB_PERIODS);
  const std = getStdev(window);
  const upper = lastSma + (std * BB_DEV);
  const lower = lastSma - (std * BB_DEV);
  const price = closes[closes.length - 1];
  const atr = calculateAtr(highs, lows, closes);

  let signal = 'NEUTRAL';
  let color = 'GRAY';
  let emoji = '⚪';

  if (price <= lower) { signal = 'VOLATILITY BUY'; color = 'LIME'; emoji = '⚡'; }
  else if (price >= upper) { signal = 'VOLATILITY SELL'; color = 'RED'; emoji = '💥'; }

  return { name: 'Volatility Breakout', signal, color, emoji, details: `ATR: ${atr.toFixed(2)}` };
}

function getTrendSystem(closes) {
  const ema50 = calculateEma(closes, 50);
  const ema200 = calculateEma(closes, 200);
  const last50 = ema50[ema50.length - 1];
  const last200 = ema200[ema200.length - 1];
  
  let signal = 'NEUTRAL';
  let color = 'GRAY';
  let emoji = '⚪';

  if (last50 > last200) { signal = 'BULLISH TREND'; color = 'LIME'; emoji = '📈'; }
  else if (last50 < last200) { signal = 'BEARISH TREND'; color = 'RED'; emoji = '📉'; }

  return { name: 'Trend Follower', signal, color, emoji, details: 'EMA 50/200' };
}

function getAkMacdAnalysis(closes) {
  const fast = calculateEma(closes, 12);
  const slow = calculateEma(closes, 26);
  const macd = fast.map((f, i) => f - slow[i]);
  
  const BB_PERIODS_AK = 10;
  const BB_DEV_AK = 1.0;
  
  const window = macd.slice(-BB_PERIODS_AK);
  const smaM = window.reduce((a, b) => a + b, 0) / BB_PERIODS_AK;
  const stdM = getStdev(window);
  
  const upper = smaM + (stdM * BB_DEV_AK);
  const lower = smaM - (stdM * BB_DEV_AK);
  const currMacd = macd[macd.length - 1];

  let signal = 'NEUTRAL';
  let color = 'GRAY';
  let emoji = '⚪';

  if (currMacd >= upper) { signal = 'AK BULLISH'; color = 'LIME'; emoji = '🟢'; }
  else if (currMacd <= lower) { signal = 'AK BEARISH'; color = 'RED'; emoji = '🔴'; }
  
  return { 
    name: 'AK MACD BB', 
    signal, 
    color, 
    emoji, 
    details: `MACD: ${currMacd.toFixed(2)} | Z-Pos: ${currMacd > 0 ? 'Above' : 'Below'}` 
  };
}

async function fetchAndAnalyze(symbol, interval, systemType) {
  try {
    const response = await fetch(`/api/klines?symbol=${symbol}&interval=${interval}&limit=250`);
    if (!response.ok) {
      throw new Error(`Proxy responded with ${response.status}`);
    }
    const data = await response.json();
    
    const highs = data.map((x) => parseFloat(x[2]));
    const lows = data.map((x) => parseFloat(x[3]));
    const closes = data.map((x) => parseFloat(x[4]));
    
    const price = closes[closes.length - 1];
    let systemData;

    if (systemType === 'momentum') systemData = getMomentumSystem(closes);
    else if (systemType === 'volatility') systemData = getVolatilitySystem(highs, lows, closes);
    else if (systemType === 'ak_macd') systemData = getAkMacdAnalysis(closes);
    else systemData = getTrendSystem(closes);
    
    return {
      price,
      ...systemData,
      lastUpdate: new Date().toLocaleTimeString()
    };
  } catch (error) {
    console.error(`Error fetching data for ${systemType}:`, error);
    return null;
  }
}

// --- APP COMPONENT ---

const SYSTEMS = [
  { id: 'ak_1m', interval: '1m', icon: Activity },
  { id: 'ak_5m', interval: '5m', icon: TrendingUp },
  { id: 'ak_15m', interval: '15m', icon: ShieldAlert },
  { id: 'ak_1h', interval: '1h', icon: BarChart3 },
  { id: 'ak_4h', interval: '4h', icon: Clock },
];
const SYMBOL = 'BTCUSDT';

export default function App() {
  const [state, setState] = useState({
    ak_1m: null,
    ak_5m: null,
    ak_15m: null,
    ak_1h: null,
    ak_4h: null,
  });
  const [loading, setLoading] = useState(true);
  const [liteMode, setLiteMode] = useState(false);
  const [lastSentAlert, setLastSentAlert] = useState(null);
  const [alertStatus, setAlertStatus] = useState(null);
  const lastAlerts = useRef({});

  const sendAlert = async (systemId, signal, price) => {
    const time = new Date().toLocaleTimeString();
    const message = `<b>BTC/USDT ${systemId.toUpperCase()} Alert</b>\n` +
                    `Signal: ${signal}\n` +
                    `Price: $${price.toLocaleString()}\n` +
                    `Time: ${time}`;
    
    setAlertStatus({ loading: true });
    try {
      const response = await fetch('/api/alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message })
      });
      const data = await response.json();
      
      if (response.ok) {
        setLastSentAlert({ systemId, signal, price, time });
        setAlertStatus({ 
          whatsapp: data.whatsapp, 
          telegram: data.telegram,
          loading: false 
        });
      } else {
        setAlertStatus({ error: 'Server error', loading: false });
      }
    } catch (error) {
      console.error('Failed to send alert:', error);
      setAlertStatus({ error: 'Network error', loading: false });
    }
  };

  const updateData = async () => {
    const results = await Promise.all(
      SYSTEMS.map(async (sys) => {
        // All systems are now AK MACD BB as per user request
        const data = await fetchAndAnalyze(SYMBOL, sys.interval, 'ak_macd');
        
        // Check for alerts on ANY trend change
        if (data) {
          if (lastAlerts.current[sys.id] !== data.signal) {
            sendAlert(`${sys.interval} ${sys.id.replace('ak_', '').toUpperCase()}`, data.signal, data.price);
            lastAlerts.current[sys.id] = data.signal;
          }
        }

        return { id: sys.id, data };
      })
    );

    const newState = {};
    results.forEach(({ id, data }) => {
      newState[id] = data;
    });

    setState(newState);
    setLoading(false);
  };

  useEffect(() => {
    updateData();
    const intervalId = setInterval(updateData, 10000); // Update every 10 seconds for real-time feel
    return () => clearInterval(intervalId);
  }, []);

  // Get the most recent price from any active system
  const currentPrice = state.ak_1m?.price || state.ak_5m?.price || state.ak_15m?.price || state.ak_1h?.price || state.ak_4h?.price;

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#E4E3E0] font-sans p-8 lg:p-12 overflow-hidden">
      {/* Header */}
      <header className="flex justify-between items-end mb-12 border-b border-[#141414] pb-6">
        <div>
          <h1 className="text-5xl font-bold tracking-tighter mb-2 flex items-center gap-4">
            <Activity className="w-12 h-12 text-emerald-500" />
            BTC/USDT <span className="text-2xl font-mono opacity-50">QUANT SUITE</span>
          </h1>
          <p className="text-sm font-mono opacity-40 uppercase tracking-widest">
            Multi-Indicator Intelligence • Real-time Scanner
          </p>
        </div>
        <div className="text-right flex flex-col items-end gap-2">
          <button 
            onClick={() => setLiteMode(!liteMode)}
            className={`text-[10px] font-mono px-2 py-1 rounded border transition-colors ${
              liteMode ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400' : 'bg-zinc-800 border-zinc-700 text-zinc-500'
            }`}
          >
            {liteMode ? 'LITE MODE: ON' : 'LITE MODE: OFF'}
          </button>
          <div>
            <div className="text-3xl font-mono font-bold text-emerald-400">
              {currentPrice ? `$${currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '---'}
            </div>
            <div className="text-xs font-mono opacity-40 uppercase flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live Market Price
            </div>
          </div>
        </div>
      </header>

      {/* Main Grid */}
      <main className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        <AnimatePresence mode="popLayout">
          {SYSTEMS.map((sys) => (
            <motion.div
              key={sys.id}
              initial={liteMode ? {} : { opacity: 0, y: 20 }}
              animate={liteMode ? {} : { opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="bg-[#111111] border border-[#141414] rounded-2xl p-8 flex flex-col justify-between min-h-[400px] relative overflow-hidden group"
            >
              {/* Background Accent */}
              <div className={`absolute top-0 right-0 w-32 h-32 blur-3xl opacity-10 transition-colors duration-500 ${
                state[sys.id]?.color === 'LIME' ? 'bg-emerald-500' : 
                state[sys.id]?.color === 'RED' ? 'bg-red-500' : 'bg-zinc-500'
              }`} />

              <div>
                <div className="flex justify-between items-start mb-8">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-[#1A1A1A] flex items-center justify-center border border-[#222]">
                      <sys.icon className="w-5 h-5 opacity-60" />
                    </div>
                    <div>
                      <span className="text-xl font-bold block">{state[sys.id]?.name || '---'}</span>
                      <span className="text-xs font-mono opacity-40 uppercase">{sys.interval} Timeframe</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-mono opacity-40 uppercase mb-1">Last Update</div>
                    <div className="text-sm font-mono">{state[sys.id]?.lastUpdate || '--:--:--'}</div>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-mono opacity-40 uppercase">System Status</span>
                    <span className={`text-lg font-bold font-mono ${
                      state[sys.id]?.color === 'LIME' ? 'text-emerald-400' : 
                      state[sys.id]?.color === 'RED' ? 'text-red-400' : 'text-zinc-400'
                    }`}>
                      {state[sys.id]?.signal || 'WAITING...'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-mono opacity-40 uppercase">Key Metric</span>
                    <span className="text-lg font-bold font-mono">
                      {state[sys.id]?.details || '---'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-12 pt-8 border-t border-[#1A1A1A]">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-mono opacity-40 uppercase mb-2">Action Signal</div>
                    <div className={`text-3xl font-bold tracking-tighter ${
                      state[sys.id]?.color === 'LIME' ? 'text-emerald-400' : 
                      state[sys.id]?.color === 'RED' ? 'text-red-400' : 'text-zinc-400'
                    }`}>
                      {state[sys.id]?.emoji} {state[sys.id]?.signal || 'SCANNING...'}
                    </div>
                  </div>
                  {state[sys.id]?.color !== 'GRAY' && state[sys.id] && (
                    <motion.div
                      animate={liteMode ? {} : { scale: [1, 1.2, 1] }}
                      transition={{ repeat: Infinity, duration: 2 }}
                    >
                      <ShieldAlert className={`w-10 h-10 ${
                        state[sys.id]?.color === 'LIME' ? 'text-emerald-500' : 'text-red-500'
                      }`} />
                    </motion.div>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </main>

      {/* Footer Info */}
      <footer className="mt-12 grid grid-cols-1 md:grid-cols-4 gap-8 border-t border-[#141414] pt-8">
        <div className="flex items-center gap-4">
          <BarChart3 className="w-6 h-6 text-emerald-500 opacity-50" />
          <div>
            <div className="text-xs font-mono opacity-40 uppercase">Strategy</div>
            <div className="text-sm">AK MACD BB Multi-Timeframe Intelligence</div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className={`w-2 h-2 rounded-full bg-emerald-500 ${liteMode ? '' : 'animate-pulse'}`} />
          <div>
            <div className="text-xs font-mono opacity-40 uppercase">Status</div>
            <div className="text-sm">Live Scanning {liteMode ? '(Lite)' : 'Active'}</div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <ShieldAlert className={`w-6 h-6 ${lastSentAlert ? 'text-amber-500' : 'text-zinc-500 opacity-30'}`} />
          <div>
            <div className="text-xs font-mono opacity-40 uppercase flex items-center gap-2">
              Last Alert Sent
              {alertStatus?.loading && <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />}
            </div>
            <div className="text-sm font-mono">
              {lastSentAlert ? (
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <span className="text-amber-400">
                      {lastSentAlert.systemId.toUpperCase()}: {lastSentAlert.signal} @ ${lastSentAlert.price.toLocaleString()}
                    </span>
                    <button 
                      onClick={() => sendAlert(lastSentAlert.systemId, lastSentAlert.signal, lastSentAlert.price)}
                      disabled={alertStatus?.loading}
                      className="text-[10px] bg-amber-500/20 hover:bg-amber-500/40 text-amber-400 px-2 py-0.5 rounded border border-amber-500/30 transition-colors disabled:opacity-50"
                    >
                      RESEND
                    </button>
                  </div>
                  <span className="text-[10px] opacity-60">
                    WA: {alertStatus?.whatsapp || '...'} | TG: {alertStatus?.telegram || '...'}
                  </span>
                </div>
              ) : 'NO ALERTS SENT YET'}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs font-mono opacity-40 uppercase">Environment</div>
          <div className="text-sm">Android TV Optimized Dashboard</div>
        </div>
      </footer>

      {loading && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="text-center">
            <div className={`w-16 h-16 border-4 border-emerald-500 border-t-transparent rounded-full mx-auto mb-4 ${liteMode ? '' : 'animate-spin'}`} />
            <div className={`text-xl font-mono ${liteMode ? '' : 'animate-pulse'}`}>INITIALIZING SCANNER...</div>
          </div>
        </div>
      )}
    </div>
  );
}
