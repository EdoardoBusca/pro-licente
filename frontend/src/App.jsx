import React, { useState } from 'react';
import { trainModel } from './api'; 
import { 
  Upload, Trophy, Database, Activity, Cpu, LineChart as ChartIcon, 
  BarChart3, Download, Eye, RefreshCcw, Lightbulb, CalendarDays, TableProperties
} from 'lucide-react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, BarChart, Bar, Cell 
} from 'recharts';

function App() {
  const [file, setFile] = useState(null);
  const [target, setTarget] = useState('');
  const [headers, setHeaders] = useState([]); 
  
  // --- NEW STATES ---
  const [horizon, setHorizon] = useState(30); // Default to 30 days
  const [previewData, setPreviewData] = useState([]); // Holds first 5 rows for EDA
  const [datasetStats, setDatasetStats] = useState({ rows: 0, cols: 0 }); // Holds total counts
  
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [activeTab, setActiveTab] = useState('battle');

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      setResult(null); 
      
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target.result;
        // Split by line and remove empty lines at the end
        const lines = text.split('\n').filter(line => line.trim() !== '');
        if (lines.length === 0) return;

        const cols = lines[0].split(',').map(c => c.trim());
        setHeaders(cols);
        setTarget(cols[cols.length - 1]); 
        
        // --- NEW: Parse data for the EDA Tab ---
        setDatasetStats({ rows: lines.length - 1, cols: cols.length });
        
        // Grab up to 5 rows to preview
        const parsedData = lines.slice(1, 6).map(line => {
          const values = line.split(',');
          return cols.reduce((obj, col, index) => {
            obj[col] = values[index] ? values[index].trim() : '';
            return obj;
          }, {});
        });
        setPreviewData(parsedData);
      };
      reader.readAsText(selectedFile);
    }
  };

  const handleRunBattle = async () => {
    if (!file || !target) return;
    setLoading(true);
    try {
      const data = await trainModel(file, target, horizon);

      const projection = Array.isArray(data.projection) ? data.projection : [];
      const firstVal = projection.length > 0 ? projection[0].val : 0;
      const lastVal = projection.length > 0 ? projection[projection.length - 1].val : 0;
      const percentChange = firstVal !== 0 ? ((lastVal - firstVal) / firstVal) * 100 : 0;

      let recommendation = "Model training completed.";
      if (projection.length > 1) {
        if (percentChange > 5) {
          recommendation = `Aggressive strategy recommended. The model projects a strong upward trend of +${percentChange.toFixed(1)}% over the next ${horizon} days.`;
        } else if (percentChange < -5) {
          recommendation = `Defensive strategy recommended. The model projects a downward correction of ${percentChange.toFixed(1)}% over the next ${horizon} days. Limit exposure.`;
        } else {
          recommendation = `Hold position. The model projects sideways movement with low variance (${percentChange.toFixed(1)}%) over the next ${horizon} days.`;
        }
      }

      setResult({
        winner: data.winner,
        accuracy: data.accuracy,
        leaderboard: Array.isArray(data.leaderboard) ? data.leaderboard : [{ name: data.winner, r2: parseFloat(String(data.accuracy).replace('%', '')) / 100 }],
        projection,
        advice: recommendation
      });
      // Force switch to battle tab to see results
      setActiveTab('battle'); 
    } catch (err) { alert("Engine Error: Check Backend"); }
    finally { setLoading(false); }
  };

  const handleExportCSV = () => {
    if (!result || !result.projection) return;
    const csvHeaders = ['Day', `Predicted ${target}`];
    const csvRows = result.projection.map(row => `${row.day},${row.val.toFixed(2)}`);
    const csvString = [csvHeaders.join(','), ...csvRows].join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${target}_${horizon}day_forecast.csv`;
    link.click();
  };

  return (
    <div className="min-h-screen bg-[#020617] text-slate-200 p-8 font-sans">
      <div className="max-w-7xl mx-auto flex justify-between items-center mb-10 border-b border-slate-800 pb-6">
        <h1 className="text-3xl font-black text-white italic tracking-tighter">GS-FORECAST <span className="text-blue-500 underline decoration-4">PRO</span></h1>
        <div className="flex gap-2 bg-slate-900 p-1 rounded-xl">
           <button onClick={() => setActiveTab('battle')} className={`px-5 py-2 rounded-lg text-xs font-bold uppercase transition-all ${activeTab === 'battle' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}>Battle Stats</button>
           <button onClick={() => setActiveTab('eda')} className={`px-5 py-2 rounded-lg text-xs font-bold uppercase transition-all ${activeTab === 'eda' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}>Data View</button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* SIDEBAR */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-[#0f172a] border border-slate-800 p-6 rounded-3xl shadow-xl">
            <label className="text-[10px] font-black text-blue-500 uppercase mb-4 block tracking-widest">1. Dataset</label>
            <div className="relative border-2 border-dashed border-slate-800 rounded-2xl p-6 mb-6 text-center hover:border-blue-500 transition-all cursor-pointer bg-slate-900/50">
              <input type="file" accept=".csv" className="absolute inset-0 opacity-0 cursor-pointer" onChange={handleFileChange} />
              <RefreshCcw className="mx-auto mb-2 text-slate-600 w-5 h-5" />
              <p className="text-[10px] font-bold text-slate-400 uppercase leading-tight">{file ? file.name : "Upload CSV"}</p>
            </div>

            <label className="text-[10px] font-black text-blue-500 uppercase mb-2 block tracking-widest">2. Target Variable</label>
            <select 
              value={target} 
              onChange={(e) => setTarget(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl p-4 text-sm font-bold text-white mb-6 outline-none focus:ring-2 focus:ring-blue-600 appearance-none cursor-pointer"
            >
              {headers.length > 0 ? headers.map(h => <option key={h} value={h}>{h.toUpperCase()}</option>) : <option>---</option>}
            </select>

            {/* --- NEW: Horizon Selector --- */}
            <label className="text-[10px] font-black text-blue-500 uppercase mb-2 flex items-center tracking-widest"><CalendarDays className="w-3 h-3 mr-2"/> 3. Forecast Horizon</label>
            <select 
              value={horizon} 
              onChange={(e) => setHorizon(Number(e.target.value))}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl p-4 text-sm font-bold text-white mb-8 outline-none focus:ring-2 focus:ring-blue-600 appearance-none cursor-pointer"
            >
              <option value={7}>7 Days (Short-term)</option>
              <option value={14}>14 Days (Mid-term)</option>
              <option value={30}>30 Days (Long-term)</option>
            </select>

            <button onClick={handleRunBattle} disabled={loading || !file} className="w-full py-5 bg-white text-black font-black uppercase text-xs rounded-2xl shadow-xl hover:bg-blue-600 hover:text-white transition-all disabled:opacity-30">
              {loading ? "Processing..." : "Trigger ML Battle"}
            </button>
          </div>
        </div>

        {/* MAIN AREA */}
        <div className="lg:col-span-3">
          {!file ? (
            <div className="h-[500px] border-2 border-dashed border-slate-800 rounded-[3rem] flex flex-col items-center justify-center space-y-4 opacity-30">
               <Database className="w-16 h-16" />
               <p className="uppercase tracking-[0.5em] text-[10px] font-black italic">Awaiting Data Ingestion</p>
            </div>
          ) : activeTab === 'battle' ? (
            result ? (
              <div className="space-y-6 animate-in fade-in duration-500">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-[#0f172a] border border-slate-800 p-6 rounded-3xl shadow-xl">
                    <h3 className="text-white text-[10px] font-black uppercase mb-6 flex items-center opacity-50"><BarChart3 className="mr-2 text-blue-500 w-4 h-4" /> Competitive Leaderboard</h3>
                    <div className="space-y-4">
                      {result.leaderboard.map((m, idx) => (
                        <div key={m.name} className="flex items-center justify-between">
                          <span className="text-[11px] font-bold text-slate-400">{idx + 1}. {m.name}</span>
                          <div className="flex items-center">
                            <div className="w-24 h-1 bg-slate-800 rounded-full mr-4 overflow-hidden">
                              <div className="h-full bg-blue-500" style={{ width: `${m.r2 * 100}%` }}></div>
                            </div>
                            <span className="text-[10px] font-black text-white">{(m.r2 * 100).toFixed(1)}%</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bg-gradient-to-br from-blue-700 to-indigo-900 p-8 rounded-[2rem] shadow-2xl relative overflow-hidden group flex flex-col justify-center">
                    <Trophy className="absolute -right-6 -bottom-6 w-40 h-40 opacity-10 group-hover:scale-110 transition-transform duration-700" />
                    <p className="text-blue-200 text-[10px] font-black uppercase mb-1 tracking-widest">Winning Bot</p>
                    <h2 className="text-5xl font-black text-white tracking-tighter italic mb-4">{result.winner}</h2>
                    <div className="text-xs font-bold text-blue-200">Confidence Score: <span className="text-white">{result.accuracy}</span></div>
                  </div>
                </div>

                <div className="bg-[#0f172a] border border-slate-800 p-6 rounded-2xl flex items-center gap-4 shadow-lg">
                  <div className="bg-blue-900/30 p-3 rounded-full">
                    <Lightbulb className="text-blue-400 w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-white text-[10px] font-black uppercase tracking-widest mb-1">Business Intel Recommendation</h4>
                    <p className="text-sm text-slate-300 italic">{result.advice}</p>
                  </div>
                </div>

                <div className="bg-[#0f172a] border border-slate-800 p-10 rounded-[3rem] h-[400px] shadow-2xl">
                  <div className="flex justify-between items-center mb-8">
                     <h3 className="text-white font-black uppercase text-xs tracking-widest flex items-center"><ChartIcon className="mr-3 text-blue-500" /> {target} Forecast Trend ({horizon} Days)</h3>
                     <button onClick={handleExportCSV} className="flex items-center gap-2 px-4 py-2 bg-blue-600/10 text-blue-500 rounded-xl text-[10px] font-black uppercase hover:bg-blue-600 hover:text-white transition-all">
                       <Download className="w-3 h-3" /> Export CSV
                     </button>
                  </div>
                  <ResponsiveContainer width="100%" height="80%">
                    <AreaChart data={result.projection}>
                      <defs><linearGradient id="colorP" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/><stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/></linearGradient></defs>
                      <XAxis dataKey="day" stroke="#334155" fontSize={10} fontWeight="900" axisLine={false} tickLine={false} />
                      <YAxis stroke="#334155" fontSize={10} fontWeight="900" axisLine={false} tickLine={false} width={40} />
                      <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px' }} />
                      <Area type="monotone" dataKey="val" stroke="#3b82f6" strokeWidth={4} fill="url(#colorP)" dot={horizon <= 14 ? {r: 4, fill:'#3b82f6'} : false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ) : (
              <div className="h-[500px] border-2 border-dashed border-slate-800 rounded-[3rem] flex flex-col items-center justify-center space-y-4 opacity-30">
                 <Cpu className="w-16 h-16" />
                 <p className="uppercase tracking-[0.5em] text-[10px] font-black italic">Ready to Trigger ML Battle</p>
              </div>
            )
          ) : (
            /* --- UPGRADED EDA TAB --- */
            <div className="space-y-6 animate-in fade-in duration-500">
              <div className="grid grid-cols-2 gap-6">
                <div className="bg-[#0f172a] border border-slate-800 p-6 rounded-3xl shadow-xl flex items-center gap-4">
                  <div className="bg-slate-900 p-4 rounded-full"><Database className="text-blue-500" /></div>
                  <div>
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Total Rows</p>
                    <p className="text-3xl font-black text-white">{datasetStats.rows.toLocaleString()}</p>
                  </div>
                </div>
                <div className="bg-[#0f172a] border border-slate-800 p-6 rounded-3xl shadow-xl flex items-center gap-4">
                  <div className="bg-slate-900 p-4 rounded-full"><TableProperties className="text-blue-500" /></div>
                  <div>
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Total Columns</p>
                    <p className="text-3xl font-black text-white">{datasetStats.cols}</p>
                  </div>
                </div>
              </div>

              <div className="bg-[#0f172a] border border-slate-800 p-8 rounded-3xl overflow-hidden shadow-xl">
                <h3 className="text-white text-xs font-black uppercase mb-6 flex items-center"><Eye className="mr-2 text-blue-500" /> Dataset Preview (First 5 Rows)</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm text-slate-400">
                    <thead className="text-[10px] uppercase bg-slate-900 text-slate-300 font-black tracking-widest">
                      <tr>
                        {headers.map(h => (
                          <th key={h} className="px-4 py-3 rounded-t-sm whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewData.map((row, index) => (
                        <tr key={index} className="border-b border-slate-800 hover:bg-slate-800/50 transition-colors">
                          {headers.map(h => (
                            <td key={h} className="px-4 py-3 font-medium whitespace-nowrap text-slate-200">
                              {row[h]}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;