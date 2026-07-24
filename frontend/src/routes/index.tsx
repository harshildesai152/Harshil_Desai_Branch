import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import {
  Upload,
  Database,
  Cloud,

  CheckCircle2,
  FileSpreadsheet,
  Server,
  GitBranch,
  Layers,

  Search,
} from "lucide-react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "OrderShard — Sharded Order Ingestion Console" },
      {
        name: "description",
        content:
          "Static UI concept for a Node.js + PostgreSQL sharded order ingestion pipeline with Google Cloud Storage uploads.",
      },
      { property: "og:title", content: "OrderShard — Sharded Order Ingestion Console" },
      {
        property: "og:description",
        content:
          "Upload 10k+ order files, stream them through validation, and route rows into sharded PostgreSQL.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

interface LogItem {
  t: string;
  level: "INFO" | "OK" | "WARN" | "ERROR";
  msg: string;
}

interface Shard {
  name: string;
  host: string;
  rows: string;
  load: number;
  status: "healthy" | "degraded";
}

interface Order {
  id: string;
  customer: string;
  date: string;
  amount: string;
  status: "completed" | "pending" | "failed" | "shipped";
  shard: string;
}

function Index() {

  const [isProcessing, setIsProcessing] = React.useState(false);
  const [dragActive, setDragActive] = React.useState(false);
  const [progress, setProgress] = React.useState(100);
  const [fileName, setFileName] = React.useState("No file selected");
  const [fileSize, setFileSize] = React.useState("0 KB");
  const [parsedRows, setParsedRows] = React.useState(0);
  const [validRows, setValidRows] = React.useState(0);
  const [skippedRows, setSkippedRows] = React.useState(0);
  const [batches, setBatches] = React.useState(0);
  const [totalRows, setTotalRows] = React.useState(0);


  const [searchQuery, setSearchQuery] = React.useState("");

  const [shards, setShards] = React.useState<Shard[]>([
    { name: "shard-0", host: "localhost:5432 (orders_p0)", rows: "0", load: 0, status: "healthy" },
    { name: "shard-1", host: "localhost:5432 (orders_p1)", rows: "0", load: 0, status: "healthy" },
    { name: "shard-2", host: "localhost:5432 (orders_p2)", rows: "0", load: 0, status: "healthy" },
    { name: "shard-3", host: "localhost:5432 (orders_p3)", rows: "0", load: 0, status: "healthy" },
  ]);

  const [logs, setLogs] = React.useState<LogItem[]>([
    { t: new Date().toTimeString().split(" ")[0], level: "INFO", msg: "Console initialized. Ready to receive order uploads." }
  ]);

  const [orders, setOrders] = React.useState<Order[]>([]);


  const fetchOrders = async (customerId?: string) => {
    try {
      const url = customerId
        ? `${API_BASE_URL}/orders?customerId=${encodeURIComponent(customerId)}`
        : `${API_BASE_URL}/orders?limit=30`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setOrders(data.data);
      }
    } catch (error) {
      console.error("Failed to fetch orders:", error);
    }
  };


  const fetchShardStats = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/orders/shards`);
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setShards(data.data);
      }
    } catch (error) {
      console.error("Failed to fetch shard stats:", error);
    }
  };


  React.useEffect(() => {
    fetchOrders();
    fetchShardStats();
  }, []);


  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };


  const handleUploadFile = async (file: File) => {
    if (isProcessing) return;
    setIsProcessing(true);
    setProgress(0);
    setFileName(file.name);
    setFileSize((file.size / (1024 * 1024)).toFixed(1) + " MB");
    setParsedRows(0);
    setValidRows(0);
    setSkippedRows(0);
    setBatches(0);
    setTotalRows(0);


    const timestampStr = () => {
      const now = new Date();
      return now.toTimeString().split(" ")[0];
    };

    setLogs([
      { t: timestampStr(), level: "INFO", msg: `Upload started: ${file.name} (${(file.size / (1024 * 1024)).toFixed(1)} MB)` },
      { t: timestampStr(), level: "OK", msg: "Uploading file to Google Cloud Storage via backend..." },
    ]);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(`${API_BASE_URL}/api/orders/upload`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        throw new Error(`Upload failed with status ${res.status}`);
      }

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message || "Upload failed");
      }

      const jobId = data.jobId;
      const currentT = timestampStr();
      setLogs((prev) => [
        ...prev,
        { t: currentT, level: "OK", msg: `GCS storage write committed successfully (Job ID: ${jobId})` },
        { t: currentT, level: "INFO", msg: "Initializing fast-csv parser & starting stream validation..." },
      ]);

      const interval = setInterval(async () => {
        try {
          const pollRes = await fetch(`${API_BASE_URL}/api/jobs/${jobId}`);
          const pollData = await pollRes.json();
          if (!pollData.success) {
            throw new Error(pollData.message || "Failed to poll job status");
          }

          const tStr = timestampStr();
          const state = pollData.status;
          const progressInfo = pollData.progress;

          if (progressInfo && typeof progressInfo === "object") {
            const { progress: pVal, validCount, invalidCount, totalRecords, batches: bCount } = progressInfo;
            setProgress(pVal || 0);
            setParsedRows(validCount + invalidCount);
            setValidRows(validCount);
            setSkippedRows(invalidCount);
            setBatches(bCount);
            setTotalRows(totalRecords || 0);



            setLogs((prev) => {
              const newLogs = [...prev];
              const lastWarn = prev.filter(l => l.level === "WARN").pop();
              if (invalidCount > 0 && (!lastWarn || !lastWarn.msg.includes(`${invalidCount} invalid`))) {
                newLogs.push({
                  t: tStr,
                  level: "WARN",
                  msg: `Row validation warning: ${invalidCount} invalid rows detected and filtered.`
                });
              }
              return newLogs;
            });
          }

          if (state === "completed") {
            clearInterval(interval);
            setIsProcessing(false);
            setProgress(100);


            fetchOrders();
            fetchShardStats();

            const finalT = timestampStr();

            const result = pollData.result || {};
            const finalValid = result.valid || 0;
            const finalInvalid = result.invalid || 0;
            const finalTotal = finalValid + finalInvalid;

            setParsedRows(finalTotal);
            setValidRows(finalValid);
            setSkippedRows(finalInvalid);
            setTotalRows(finalTotal);

            setLogs((prev) => [
              ...prev,
              { t: finalT, level: "OK", msg: "Ingestion pipeline flush complete. Connections returned to pool." },
              { t: finalT, level: "OK", msg: `Ingest report: ${finalTotal.toLocaleString()} parsed · ${finalValid.toLocaleString()} successfully inserted · ${finalInvalid.toLocaleString()} skipped` },
            ]);
          } else if (state === "failed") {
            clearInterval(interval);
            setIsProcessing(false);
            const finalT = timestampStr();
            setLogs((prev) => [
              ...prev,
              { t: finalT, level: "ERROR", msg: `Ingestion failed: ${pollData.failedReason || "Unknown database/worker error"}` },
            ]);
            fetchOrders();
            fetchShardStats();
          }
        } catch (err: any) {
          clearInterval(interval);
          setIsProcessing(false);
          const finalT = timestampStr();
          setLogs((prev) => [
            ...prev,
            { t: finalT, level: "ERROR", msg: `Polling error: ${err.message}` },
          ]);
        }
      }, 800);
    } catch (err: any) {
      setIsProcessing(false);
      const finalT = timestampStr();
      setLogs((prev) => [
        ...prev,
        { t: finalT, level: "ERROR", msg: `Ingestion failed: ${err.message}` },
      ]);
    }
  };


  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleUploadFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleUploadFile(e.target.files[0]);
    }
  };


  const filteredOrders = orders.filter(
    (o) =>
      o.customer.toLowerCase().includes(searchQuery.toLowerCase()) ||
      o.shard.toLowerCase().includes(searchQuery.toLowerCase()) ||
      o.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-background text-foreground transition-all duration-300 font-sans">

      <div className="absolute top-0 left-1/4 -z-10 h-96 w-96 rounded-full bg-indigo-500/5 blur-[128px] pointer-events-none" />
      <div className="absolute top-[40vh] right-1/4 -z-10 h-[400px] w-[400px] rounded-full bg-emerald-500/5 blur-[160px] pointer-events-none" />


      <header className="sticky top-0 z-50 border-b border-border bg-white/80 backdrop-blur-md transition-all">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 shadow-md shadow-indigo-600/10 text-white">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-bold tracking-tight text-slate-900 flex items-center gap-2">
                OrderShard
                <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-600">
                  PROD
                </span>
              </div>
              <div className="text-xs text-muted-foreground">
                Sharded Ingestion Console · v0.1
              </div>
            </div>
          </div>

          {/* <nav className="hidden items-center gap-6 text-sm font-semibold text-muted-foreground md:flex">
            <span className="text-indigo-600 cursor-pointer transition-colors relative after:absolute after:bottom-[-20px] after:left-0 after:h-[2px] after:w-full after:bg-indigo-600 after:scale-x-100">
              Pipeline
            </span>
            <span className="hover:text-slate-900 cursor-pointer transition-colors">Shards</span>
            <span className="hover:text-slate-900 cursor-pointer transition-colors">Logs</span>
            <span className="hover:text-slate-900 cursor-pointer transition-colors">Docs</span>
          </nav>
           */}
          <div className="flex items-center gap-3">
            {/* <button
              onClick={handleSimulateIngest}
              disabled={isProcessing}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 text-xs font-semibold text-white transition-all hover:bg-indigo-500 active:scale-95 disabled:opacity-50 disabled:pointer-events-none shadow-sm shadow-indigo-600/15"
            >
              <RefreshCw className={`h-3 w-3 ${isProcessing ? "animate-spin" : ""}`} />
              Simulate Ingest
            </button> */}
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-700 font-semibold shadow-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping" />
              ADC connected
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-10 relative">

        <section className="mb-10">
          <div className="flex flex-col gap-2">
            <span className="text-xs font-bold uppercase tracking-widest text-indigo-600">
              POST /upload-orders
            </span>
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">
              Ingest 10,000 orders into a sharded PostgreSQL fleet
            </h1>
            <p className="max-w-2xl text-sm text-muted-foreground leading-relaxed mt-1">
              Streaming CSV/Excel parser · Google Cloud Storage archival via ADC ·
              Application-level hash sharding on <code className="rounded bg-indigo-50 px-2 py-0.5 font-mono text-xs text-indigo-600 font-semibold">customer_id</code>.
            </p>
          </div>
        </section>


        <section className="w-full">

          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm hover:border-slate-300 transition-all">
            <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-900">Upload orders file</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  CSV or XLSX · max 200 MB · streamed to GCS
                </p>
              </div>
              <div>
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-indigo-600 font-mono shadow-sm">
                  <Cloud className="h-3.5 w-3.5 text-indigo-600 animate-pulse" /> gs://ordershard-prod/uploads
                </span>
              </div>
            </div>


            <div
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              className={`relative rounded-xl border-2 border-dashed p-10 text-center transition-all ${dragActive
                ? "border-indigo-500 bg-indigo-500/5 shadow-inner"
                : "border-slate-200 bg-slate-50/50 hover:border-indigo-400"
                }`}
            >
              <input
                type="file"
                id="file-upload"
                className="hidden"
                accept=".csv,.xlsx"
                onChange={handleFileInput}
                disabled={isProcessing}
              />
              <label htmlFor="file-upload" className="cursor-pointer">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 hover:scale-105 transition-transform">
                  <Upload className="h-6 w-6" />
                </div>
                <p className="mt-4 text-sm font-bold text-slate-700">Drop orders.csv here</p>
                <p className="text-xs text-muted-foreground mt-1">or click to browse your files</p>
              </label>
              <button
                onClick={() => document.getElementById("file-upload")?.click()}
                disabled={isProcessing}
                className="mt-5 inline-flex items-center gap-2 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 px-4 py-2 text-xs font-bold text-slate-800 transition-all active:scale-95 disabled:opacity-50 shadow-xs"
              >
                <FileSpreadsheet className="h-4 w-4 text-indigo-600" />
                Select file
              </button>
            </div>


            <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50/50 p-5 relative overflow-hidden">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${isProcessing ? "bg-indigo-500/10 text-indigo-600 animate-spin" : "bg-emerald-500/10 text-emerald-600"}`}>
                    <FileSpreadsheet className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-slate-800 truncate max-w-[200px] md:max-w-xs">{fileName}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {fileSize} · {parsedRows.toLocaleString()} rows · {isProcessing ? "Ingesting..." : "Uploaded just now"}
                    </div>
                  </div>
                </div>
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${isProcessing
                  ? "bg-indigo-50 text-indigo-600"
                  : "bg-emerald-50 text-emerald-600"
                  }`}>
                  {isProcessing ? (
                    <>
                      <span className="h-1.5 w-1.5 rounded-full bg-indigo-600 animate-ping" />
                      Ingesting
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5" /> Ingested
                    </>
                  )}
                </span>
              </div>


              <div className="mt-4">
                <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground font-medium">
                  <span>Streaming · Parse · Validate · Batch insert</span>
                  <span className="font-mono text-slate-700 font-bold">{parsedRows.toLocaleString()} / {totalRows.toLocaleString()}</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full bg-indigo-600 transition-all duration-300 shadow-sm"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>

              <div className="mt-5 grid grid-cols-4 gap-3 text-center">
                {[
                  { label: "Parsed", value: parsedRows.toLocaleString(), color: "text-slate-800" },
                  { label: "Valid", value: validRows.toLocaleString(), color: "text-emerald-600" },
                  { label: "Skipped", value: skippedRows.toLocaleString(), color: "text-amber-600" },
                  { label: "Batches", value: batches.toString(), color: "text-indigo-600" },
                ].map((s) => (
                  <div key={s.label} className="rounded-lg border border-slate-100 bg-white p-2.5 shadow-xs transition-transform hover:scale-102">
                    <div className={`text-sm font-bold ${s.color}`}>{s.value}</div>
                    <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400 mt-0.5">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>


        <section className="mt-10">
          <div className="mb-4 flex flex-col sm:flex-row sm:items-end justify-between gap-2">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Shard fleet</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Application-level sharding · <code className="rounded bg-indigo-50 px-1.5 py-0.5 text-xs text-indigo-600 font-semibold font-mono">shard = hash(customer_id) % N</code>
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-600 font-semibold font-mono self-start sm:self-auto shadow-xs">
              <GitBranch className="h-3.5 w-3.5 text-indigo-600" /> 4 shards · PostgreSQL 16
            </span>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {shards.map((s) => (
              <ShardCard key={s.name} {...s} />
            ))}
          </div>
        </section>


        <section className="mt-10 grid gap-6 lg:grid-cols-5">

          <div className="lg:col-span-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-5 text-base font-bold text-slate-900">Ingestion pipeline architecture</h2>
            <ol className="space-y-4">
              {PIPELINE.map((step, i) => (
                <li key={step.title} className="flex gap-4 group">
                  <div className="flex flex-col items-center">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-50 border border-slate-200 text-xs font-bold text-indigo-600 group-hover:border-indigo-400 group-hover:bg-indigo-50 transition-colors">
                      {i + 1}
                    </div>
                    {i < PIPELINE.length - 1 && (
                      <div className="mt-2 h-full w-px flex-1 bg-slate-200" />
                    )}
                  </div>
                  <div className="pb-4">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-700 group-hover:text-slate-900 transition-colors">{step.title}</span>
                      <span className="rounded-md bg-slate-50 border border-slate-200 px-2 py-0.5 font-mono text-[9px] text-indigo-600 font-semibold">
                        {step.tag}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{step.desc}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>


          <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white p-6 flex flex-col shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900">Live logs</h2>
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                {isProcessing ? "streaming" : "standby"}
              </span>
            </div>
            <div className="flex-1 rounded-xl border border-slate-800 bg-slate-950 p-4 font-mono text-[10.5px] leading-relaxed max-h-[340px] overflow-y-auto shadow-inner custom-scrollbar">
              {logs.map((l, i) => (
                <div key={i} className="flex gap-2.5 py-1 border-b border-slate-900/30 last:border-b-0 hover:bg-slate-900/20 px-1 rounded transition-colors">
                  <span className="text-slate-500 select-none">{l.t}</span>
                  <span className={`${levelClass(l.level)} font-bold w-10 select-none`}>{l.level.padEnd(5)}</span>
                  <span className="text-slate-100 flex-1 break-all">{l.msg}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-10 rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-250 px-6 py-4 gap-3 bg-slate-50/50">
            <div>
              <h2 className="text-base font-bold text-slate-900">Recent records queries</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                GET /orders?customerId= · routed via shard resolver
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Filter client orders/shards..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white pl-8 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500 w-full sm:w-64 transition-all"
                />
              </div>
              <span className="hidden sm:inline-flex rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-muted-foreground shadow-xs">
                Last 24h
              </span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3.5 font-bold">order_id</th>
                  <th className="px-6 py-3.5 font-bold">customer_id</th>
                  <th className="px-6 py-3.5 font-bold">order_date</th>
                  <th className="px-6 py-3.5 font-bold">amount</th>
                  <th className="px-6 py-3.5 font-bold">status</th>
                  <th className="px-6 py-3.5 font-bold text-right">shard</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredOrders.length > 0 ? (
                  filteredOrders.map((o, idx) => (
                    <tr
                      key={o.id + idx}
                      className={`hover:bg-slate-50/50 transition-all ${o.date === "Just Now" ? "bg-indigo-50/50 animate-pulse" : ""
                        }`}
                    >
                      <td className="px-6 py-3.5 font-mono text-xs text-slate-700 font-semibold">{o.id}</td>
                      <td className="px-6 py-3.5 font-mono text-xs text-indigo-600 font-semibold">{o.customer}</td>
                      <td className="px-6 py-3.5 text-xs text-slate-500">{o.date}</td>
                      <td className="px-6 py-3.5 text-xs font-bold text-slate-800">${o.amount}</td>
                      <td className="px-6 py-3.5 text-xs">
                        <StatusPill status={o.status} />
                      </td>
                      <td className="px-6 py-3.5 text-xs text-right">
                        <span className="rounded-md border border-indigo-100 bg-indigo-50 px-2.5 py-0.5 font-mono text-[10.5px] font-bold text-indigo-750 shadow-xs">
                          {o.shard}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="text-center py-10 text-xs text-muted-foreground">
                      No records matched the filter criteria
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>


        <section className="mt-10 grid gap-4 md:grid-cols-3">
          <InfoTile
            icon={<Cloud className="h-4 w-4" />}
            title="Google ADC Integration"
            body="Auth via gcloud application-default credentials — no key files committed to the workspace."
          />
          <InfoTile
            icon={<Database className="h-4 w-4" />}
            title="High-performance batching"
            body="Supports COPY and parameterized multi-row INSERT transactions, optimizing to 500 rows per batch."
          />
          <InfoTile
            icon={<Server className="h-4 w-4" />}
            title="Backpressure-aware Parser"
            body="Utilizes fast-csv Node streams, ensuring memory safety for multi-gigabyte uploads."
          />
        </section>

        <footer className="mt-16 border-t border-slate-200 pt-6 text-center text-xs text-muted-foreground font-semibold">
          OrderShard Ingestion System · Node.js · PostgreSQL · Google Cloud Platform
        </footer>
      </main>
    </div>
  );
}



function MetricCard({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  tone?: "ok" | "warning";
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 hover:border-slate-350 transition-all shadow-sm">
      <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
        <span
          className={
            tone === "ok"
              ? "flex h-6.5 w-6.5 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 shadow-xs border border-emerald-100"
              : tone === "warning"
                ? "flex h-6.5 w-6.5 items-center justify-center rounded-lg bg-indigo-50 text-indigo-650 shadow-xs border border-indigo-100"
                : "flex h-6.5 w-6.5 items-center justify-center rounded-lg bg-slate-100 text-slate-500 shadow-xs"
          }
        >
          {icon}
        </span>
        {label}
      </div>
      <div className="mt-3 text-2xl font-extrabold tracking-tight text-slate-900">{value}</div>
      <div className="mt-1.5 text-[11px] text-slate-500 font-semibold">{sub}</div>
    </div>
  );
}

function ShardCard({
  name,
  host,
  rows,
  load,
  status,
}: {
  name: string;
  host: string;
  rows: string;
  load: number;
  status: "healthy" | "degraded";
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 hover:border-slate-300 transition-all hover:translate-y-[-2px] duration-300 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-indigo-600" />
          <span className="font-mono text-xs font-bold text-slate-800">{name}</span>
        </div>
        <span
          className={
            status === "healthy"
              ? "inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-600 border border-emerald-100"
              : "inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-600 border border-amber-100"
          }
        >
          <span
            className={
              status === "healthy"
                ? "h-1.5 w-1.5 rounded-full bg-emerald-500"
                : "h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse"
            }
          />
          {status}
        </span>
      </div>
      <div className="mt-2.5 truncate font-mono text-[10.5px] text-slate-500 font-semibold">{host}</div>

      <div className="mt-4 space-y-1.5">
        <div className="flex items-center justify-between text-[10.5px] font-semibold text-slate-650">
          <span>Active Connections Load</span>
          <span className="font-mono font-bold text-slate-800">{load}%</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full rounded-full transition-all duration-500 ${status === "healthy" ? "bg-indigo-600" : "bg-amber-500"
              }`}
            style={{ width: `${load}%` }}
          />
        </div>
      </div>

      <div className="mt-4.5 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px]">
        <span className="text-slate-500 font-semibold">Total Rows Cached</span>
        <span className="font-bold text-slate-800 font-mono">{rows}</span>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    completed: "bg-emerald-50 text-emerald-700 border border-emerald-100",
    pending: "bg-amber-50 text-amber-700 border border-amber-100",
    failed: "bg-red-50 text-red-700 border border-red-100",
    shipped: "bg-blue-50 text-blue-700 border border-blue-100",
    processing: "bg-blue-50 text-blue-750 border border-blue-100",
    cancelled: "bg-red-50 text-red-700 border border-red-100",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-bold capitalize ${map[status] ?? "bg-slate-100 text-slate-500"
        }`}
    >
      {status}
    </span>
  );
}

function InfoTile({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 hover:bg-slate-50/50 transition-colors shadow-sm">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 shadow-xs">
          {icon}
        </span>
        <span className="text-xs font-bold text-slate-800">{title}</span>
      </div>
      <p className="mt-2.5 text-xs text-slate-500 leading-relaxed font-semibold">{body}</p>
    </div>
  );
}

function levelClass(level: string) {
  if (level === "ERROR") return "text-red-400";
  if (level === "WARN") return "text-amber-400";
  if (level === "OK") return "text-emerald-400";
  return "text-indigo-400";
}



const PIPELINE = [
  { title: "Multipart Upload & GCS Archival", tag: "POST /api/orders/upload", desc: "Express controller validates file and streams it to Google Cloud Storage (runs in LOCAL_MOCK if keys are missing)." },
  { title: "Queue Background Job in Redis", tag: "BullMQ / ioredis", desc: "Creates a BullMQ job with the file buffer, returning 202 Accepted and Job ID immediately." },
  { title: "Stream CSV Parsing", tag: "csv-parser", desc: "Background worker wakes up asynchronously, streaming lines from the buffer to keep memory usage flat." },
  { title: "Row-by-Row Validation", tag: "csvValidation.service.js", desc: "Checks that customerId, orderDate, orderAmount, and status are present and valid. Skips malformed rows." },
  { title: "Hash Shard Routing", tag: "hash(customer_id) % 4", desc: "Computes MD5 hash of customer_id to determine target PostgreSQL partition (orders_p0 to orders_p3)." },
  { title: "Prisma Batch Insert Transaction", tag: "PostgreSQL PARTITION BY HASH", desc: "Bulk inserts valid rows in batches of 500 inside isolated Prisma transactions using skipDuplicates." },
];
