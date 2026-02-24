/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Activity, TrendingUp, TrendingDown, Clock, ShieldAlert, BarChart3 } from 'lucide-react';

// --- TYPES ---

type Interval = '5m' | '15m' | '1h';

interface MarketData {
  price: number;
  plotColor: 'LIME' | 'RED' | 'GRAY';
  zeroPos: 'ABOVE' | 'BELOW';
  macdVal: number;
  trend: 'BUY' | 'SELL';
  signal: string;
  emoji: string;
  lastUpdate: string;
}

interface AppState {
  [key: string]: MarketData | null;
}

// --- MATH ENGINE ---

function getStdev(window: number[]): number {
  if (window.length === 0) return 0;
  const mean = window.reduce((a, b) => a + b, 0) / window.length;
  const variance = window.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / window.length;
  return Math.sqrt(variance);
}

function calculateEma(data: number[], length: number): number[] {
  if (data.length < length) return new Array(data.length).fill(0);
  
  const ema: number[] = [];
  const initialSma = data.slice(0, length).reduce((a, b) => a + b, 0) / length;
  ema.push(initialSma);
  
  const multiplier = 2 / (length + 1);
  
  for (let i = length; i < data.length; i++) {
    const val = (data[i] - ema[ema.length - 1]) * multiplier + ema[ema.length - 1];
    ema.push(val);
  }
  
  return [...new Array(length - 1).fill(0), ...ema];
}

// --- INDICATOR ENGINES ---

const BB_PERIODS = 10;
const BB_DEV = 1.0;
const AI_SENSITIVITY = 2.8;

function getAkMacdAnalysis(closes: number[]): { color: 'LIME' | 'RED' | 'GRAY', zeroPos: 'ABOVE' | 'BELOW', macdVal: number } {
  const fast = calculateEma(closes, 12);
  const slow = calculateEma(closes, 26);
  const macd = fast.map((f, i) => f - slow[i]);
  
  const window = macd.slice(-BB_PERIODS);
  const smaM = window.reduce((a, b) => a + b, 0) / BB_PERIODS;
  const stdM = getStdev(window);
  
  const upper = smaM + (stdM * BB_DEV);
  const lower = smaM - (stdM * BB_DEV);
  const currMacd = macd[macd.length - 1];

  let color: 'LIME' | 'RED' | 'GRAY' = 'GRAY';
  if (currMacd >= upper) color = 'LIME';
  else if (currMacd <= lower) color = 'RED';
  
  const zeroPos = currMacd > 0 ? 'ABOVE' : 'BELOW';
  
  return { color, zeroPos, macdVal: currMacd };
}

function getSupertrendSignal(highs: number[], lows: number[], closes: number[]): 'BUY' | 'SELL' {
  const lastHighs = highs.slice(-10);
  const lastLows = lows.slice(-10);
  const atr = (Math.max(...lastHighs) - Math.min(...lastLows)) / 2;
  const up = closes[closes.length - 1] - (AI_SENSITIVITY * atr);
  return closes[closes.length - 1] > up ? 'BUY' : 'SELL';
}

async function fetchAndAnalyze(symbol: string, interval: string): Promise<MarketData | null> {
  try {
    const response = await fetch(`/api/klines?symbol=${symbol}&interval=${interval}&limit=100`);
    if (!response.ok) {
      throw new Error(`Proxy responded with ${response.status}`);
    }
    const data = await response.json();
    
    const highs = data.map((x: any) => parseFloat(x[2]));
    const lows = data.map((x: any) => parseFloat(x[3]));
    const closes = data.map((x: any) => parseFloat(x[4]));
    
    const price = closes[closes.length - 1];
    const { color: plotColor, zeroPos, macdVal } = getAkMacdAnalysis(closes);
    const trend = getSupertrendSignal(highs, lows, closes);
    
    let signal = 'NEUTRAL';
    let emoji = '⚪';
    
    if (plotColor === 'LIME' && zeroPos === 'ABOVE' && trend === 'BUY') {
      signal = 'STRONG BUY';
      emoji = '🟢🔥';
    } else if (plotColor === 'RED' && zeroPos === 'BELOW' && trend === 'SELL') {
      signal = 'STRONG SELL';
      emoji = '🔴🩸';
    }
    
    return {
      price,
      plotColor,
      zeroPos,
      macdVal,
      trend,
      signal,
      emoji,
      lastUpdate: new Date().toLocaleTimeString()
    };
  } catch (error) {
    console.error(`Error fetching data for ${interval}:`, error);
    return null;
  }
}

// --- APP COMPONENT ---

const INTERVALS: Interval[] = ['5m', '15m', '1h'];
const SYMBOL = 'BTCUSDT';

export default function App() {
  const [state, setState] = useState<AppState>({
    '5m': null,
    '15m': null,
    '1h': null,
  });
  const [loading, setLoading] = useState(true);
  const [liteMode, setLiteMode] = useState(false);
  const lastAlerts = useRef<Record<string, string>>({});

  const sendAlert = async (interval: string, signal: string, price: number) => {
    const message = `<b>BTC/USDT ${interval} Signal</b>\n` +
                    `Signal: ${signal}\n` +
                    `Price: $${price.toLocaleString()}\n` +
                    `Time: ${new Date().toLocaleTimeString()}`;
    
    try {
      await fetch('/api/alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message })
      });
    } catch (error) {
      console.error('Failed to send alert:', error);
    }
  };

  const updateData = async () => {
    const results = await Promise.all(
      INTERVALS.map(async (interval) => {
        const data = await fetchAndAnalyze(SYMBOL, interval);
        
        // Check for alerts
        if (data && (data.signal === 'STRONG BUY' || data.signal === 'STRONG SELL')) {
          if (lastAlerts.current[interval] !== data.signal) {
            sendAlert(interval, data.signal, data.price);
            lastAlerts.current[interval] = data.signal;
          }
        } else if (data) {
          // Reset alert state if signal is no longer strong
          lastAlerts.current[interval] = '';
        }

        return { interval, data };
      })
    );

    const newState: AppState = {};
    results.forEach(({ interval, data }) => {
      newState[interval] = data;
    });

    setState(newState);
    setLoading(false);
  };

  useEffect(() => {
    updateData();
    const intervalId = setInterval(updateData, 60000); // Update every minute
    return () => clearInterval(intervalId);
  }, []);

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#E4E3E0] font-sans p-8 lg:p-12 overflow-hidden">
      {/* Header */}
      <header className="flex justify-between items-end mb-12 border-b border-[#141414] pb-6">
        <div>
          <h1 className="text-5xl font-bold tracking-tighter mb-2 flex items-center gap-4">
            <Activity className="w-12 h-12 text-emerald-500" />
            BTC/USDT <span className="text-2xl font-mono opacity-50">CONFLUENCE</span>
          </h1>
          <p className="text-sm font-mono opacity-40 uppercase tracking-widest">
            Triple Confirmation System • Real-time Scanner
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
              {state['1h']?.price ? `$${state['1h'].price.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '---'}
            </div>
            <div className="text-xs font-mono opacity-40 uppercase">Global Reference Price</div>
          </div>
        </div>
      </header>

      {/* Main Grid */}
      <main className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <AnimatePresence mode="popLayout">
          {INTERVALS.map((interval) => (
            <motion.div
              key={interval}
              initial={liteMode ? {} : { opacity: 0, y: 20 }}
              animate={liteMode ? {} : { opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="bg-[#111111] border border-[#141414] rounded-2xl p-8 flex flex-col justify-between min-h-[400px] relative overflow-hidden group"
            >
              {/* Background Accent */}
              <div className={`absolute top-0 right-0 w-32 h-32 blur-3xl opacity-10 transition-colors duration-500 ${
                state[interval]?.signal.includes('BUY') ? 'bg-emerald-500' : 
                state[interval]?.signal.includes('SELL') ? 'bg-red-500' : 'bg-zinc-500'
              }`} />

              <div>
                <div className="flex justify-between items-start mb-8">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-[#1A1A1A] flex items-center justify-center border border-[#222]">
                      <Clock className="w-5 h-5 opacity-60" />
                    </div>
                    <span className="text-2xl font-bold font-mono">{interval}</span>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-mono opacity-40 uppercase mb-1">Last Update</div>
                    <div className="text-sm font-mono">{state[interval]?.lastUpdate || '--:--:--'}</div>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-mono opacity-40 uppercase">MACD Plot</span>
                    <span className={`text-lg font-bold font-mono ${
                      state[interval]?.plotColor === 'LIME' ? 'text-emerald-400' : 
                      state[interval]?.plotColor === 'RED' ? 'text-red-400' : 'text-zinc-400'
                    }`}>
                      {state[interval]?.plotColor || '---'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-mono opacity-40 uppercase">Zero Line</span>
                    <span className="text-lg font-bold font-mono">
                      {state[interval]?.zeroPos || '---'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-mono opacity-40 uppercase">Supertrend</span>
                    <span className={`text-lg font-bold font-mono flex items-center gap-2 ${
                      state[interval]?.trend === 'BUY' ? 'text-emerald-400' : 'text-red-400'
                    }`}>
                      {state[interval]?.trend === 'BUY' ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                      {state[interval]?.trend || '---'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-12 pt-8 border-t border-[#1A1A1A]">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-mono opacity-40 uppercase mb-2">Action Signal</div>
                    <div className={`text-3xl font-bold tracking-tighter ${
                      state[interval]?.signal.includes('BUY') ? 'text-emerald-400' : 
                      state[interval]?.signal.includes('SELL') ? 'text-red-400' : 'text-zinc-400'
                    }`}>
                      {state[interval]?.emoji} {state[interval]?.signal || 'WAITING...'}
                    </div>
                  </div>
                  {state[interval]?.signal !== 'NEUTRAL' && state[interval]?.signal !== 'WAITING...' && (
                    <motion.div
                      animate={liteMode ? {} : { scale: [1, 1.2, 1] }}
                      transition={{ repeat: Infinity, duration: 2 }}
                    >
                      <ShieldAlert className={`w-10 h-10 ${
                        state[interval]?.signal.includes('BUY') ? 'text-emerald-500' : 'text-red-500'
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
      <footer className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-8 border-t border-[#141414] pt-8">
        <div className="flex items-center gap-4">
          <BarChart3 className="w-6 h-6 text-emerald-500 opacity-50" />
          <div>
            <div className="text-xs font-mono opacity-40 uppercase">Strategy</div>
            <div className="text-sm">AK MACD + Supertrend Confluence</div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className={`w-2 h-2 rounded-full bg-emerald-500 ${liteMode ? '' : 'animate-pulse'}`} />
          <div>
            <div className="text-xs font-mono opacity-40 uppercase">Status</div>
            <div className="text-sm">Live Scanning {liteMode ? '(Lite)' : 'Active'}</div>
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
