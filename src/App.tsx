import React, { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import { FaCode, FaCheckCircle, FaExclamationCircle, FaGithub, FaSpinner } from "react-icons/fa";
import "./App.css";


type Problem = {
  date: string;
  name: string;
  url: string;
  difficulty: string;
  status: string;
};

const EXTENSION_VERSION = "v1.0.0";

function normalizeDate(dateStr: string): string {
  const now = new Date();
  const utcYear = now.getUTCFullYear();
  const utcMonth = now.getUTCMonth();
  const utcDate = now.getUTCDate();
  const shortDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Today
  if (/today/i.test(dateStr)) {
    return `${utcYear}-${String(utcMonth + 1).padStart(2, "0")}-${String(utcDate).padStart(2, "0")}`;
  }

  // Yesterday
  if (/yesterday/i.test(dateStr)) {
    const yest = new Date(Date.UTC(utcYear, utcMonth, utcDate - 1));
    return `${yest.getUTCFullYear()}-${String(yest.getUTCMonth() + 1).padStart(2, "0")}-${String(yest.getUTCDate()).padStart(2, "0")}`;
  }

  // Weekday names (Mon, Tue, ...)
  if (shortDays.includes(dateStr)) {
    const todayIdx = now.getUTCDay();
    const targetIdx = shortDays.indexOf(dateStr);
    let daysAgo = (todayIdx - targetIdx + 7) % 7;
    const target = new Date(Date.UTC(utcYear, utcMonth, utcDate - daysAgo));
    return `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, "0")}-${String(target.getUTCDate()).padStart(2, "0")}`;
  }

  // "Jun 28" etc.
  const parsed = new Date(Date.parse(`${dateStr} ${utcYear} UTC`));
  if (!isNaN(parsed.getTime())) {
    return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, "0")}-${String(parsed.getUTCDate()).padStart(2, "0")}`;
  }

  // **Any "ago" case (e.g., "an hour ago", "3 minutes ago", etc.): treat as today**
  if (/ago/i.test(dateStr)) {
    return `${utcYear}-${String(utcMonth + 1).padStart(2, "0")}-${String(utcDate).padStart(2, "0")}`;
  }

  // Fallback: treat as today (safe default)
  return `${utcYear}-${String(utcMonth + 1).padStart(2, "0")}-${String(utcDate).padStart(2, "0")}`;
}


const normalizeDifficulty = (diff: string): string => {
  if (/med/i.test(diff)) return "Medium";
  if (/easy/i.test(diff)) return "Easy";
  if (/hard/i.test(diff)) return "Hard";
  return diff;
};

function isWithinLast7Days(dateStr: string): boolean {
  const today = new Date();
  const target = new Date(dateStr);
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  const diff = (today.getTime() - target.getTime()) / (1000 * 60 * 60 * 24);
  return diff >= 0 && diff <= 6;
}


const App: React.FC = () => {
  // Auth states
  const [user, setUser] = useState<any>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");

  // Data states
  const [problems, setProblems] = useState<Problem[]>([]);
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMsg, setStatusMsg] = useState<{type: "success"|"error"|"loading"|""; msg: string}>({type: "", msg: ""});

  // Helper to determine if all/none/some are selected
  const allSelected = problems.length > 0 && problems.every((_, i) => selected[i]);
  const noneSelected = problems.every((_, i) => !selected[i]);
  const someSelected = !allSelected && !noneSelected;

  // Handler for header checkbox
  const handleToggleAll = () => {
    if (allSelected) {
      // Unselect all
      setSelected(Object.fromEntries(problems.map((_, i) => [i, false])));
    } else {
      // Select all
      setSelected(Object.fromEntries(problems.map((_, i) => [i, true])));
    }
  };

  // Check auth on mount
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
  }, []);

  // Email/password login
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError("");
    const { error, data } = await supabase.auth.signInWithPassword({ email, password });
    setAuthLoading(false);
    if (error) {
      setAuthError(error.message);
    } else {
      setUser(data.user);
      setEmail("");
      setPassword("");
    }
  };

  // Logout
  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProblems([]);
    setSelected({});
    setProgress(0);
  };

  // Fetch problems from LeetCode page
  const fetchProblems = () => {
    setStatusMsg({ type: "loading", msg: "Fetching problems..." });
    setLoading(true);
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs: chrome.tabs.Tab[]) => {
      if (!tabs.length) {
        setLoading(false);
        setStatusMsg({ type: "error", msg: "No active tab found." });
        return;
      }
      const tabId = tabs[0].id!;
      chrome.tabs.sendMessage(
        tabId,
        { action: 'extractLeetCodeData' },
        (response: any) => {
          if (chrome.runtime.lastError) {
            setLoading(false);
            setStatusMsg({ type: "error", msg: "Error communicating with content script." });
            return;
          }
          if (!response) {
            setLoading(false);
            setStatusMsg({ type: "error", msg: "Failed to extract data. Are you on the LeetCode progress page?" });
            return;
          }
          // Normalize and filter problems
          const normalized: Problem[] = response.problems
            .filter((p: Problem) => p.status === 'Accepted')
            .map((p: Problem) => ({
              ...p,
              date: normalizeDate(p.date),
              difficulty: normalizeDifficulty(p.difficulty),
            }))
            .filter((p: Problem) => isWithinLast7Days(p.date));

          setProblems(normalized);
          setSelected(Object.fromEntries(normalized.map((_, i) => [i, false])));
          setLoading(false);
          if (normalized.length > 0) {
            setStatusMsg({ type: "success", msg: `Loaded ${normalized.length} problems.` });
          } else {
            setStatusMsg({ type: "error", msg: "No accepted problems found in last 7 days." });
          }
        }
      );
    });
  };


// Checkbox selection
const handleSelect = (i: number) => {
  setSelected(prev => ({ ...prev, [i]: !prev[i] }));
};



const addSolved = async () => {
  setLoading(true);
  setProgress(0);
  setStatusMsg({ type: "loading", msg: "Adding problems..." });

  const toAdd = problems.filter((_, i) => selected[i]);
  let successCount = 0, errorCount = 0;

  for (let i = 0; i < toAdd.length; i++) {
    const p = toAdd[i];
    const { error } = await supabase.from("problems").insert([{
      user_id: user.id, // from Supabase Auth
      title: p.name, // problem name
      difficulty: normalizeDifficulty(p.difficulty), // "Easy", "Medium", "Hard"
      solved_date: p.date, // YYYY-MM-DD
      problem_url: p.url, // optional
      num_of_prbs: 1, // always 1
    }]);
    if (error) {
      console.error("Insert error:", error);
      errorCount++;
    } else {
      successCount++;
    }
    setProgress(Math.round(((i + 1) / toAdd.length) * 100));
  }
  setLoading(false);

  if (successCount > 0 && errorCount === 0) {
    setStatusMsg({ type: "success", msg: `${successCount} problems added!` });
  } else if (successCount > 0 && errorCount > 0) {
    setStatusMsg({ type: "error", msg: `Added ${successCount}, failed ${errorCount}. Check console.` });
  } else if (errorCount > 0) {
    setStatusMsg({ type: "error", msg: `Failed to add problems. Check console.` });
  } else {
    setStatusMsg({ type: "", msg: "" });
  }
};



  // --- UI ---
  if (!user) {
    return (
      <div className="popup-root">
        <form onSubmit={handleLogin} className="login-form">
          <div className="login-header">
            <FaCode size={22} color="#6366f1" />
            <span className="login-title">DSA Uploader</span>
          </div>
          {authError && (
            <div className="status-bar error">
              <FaExclamationCircle size={12} style={{marginRight: 4}} />
              {authError}
            </div>
          )}
          <input
            type="email"
            placeholder="Email"
            autoComplete="email"
            required
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="input-field"
          />
          <input
            type="password"
            placeholder="Password"
            autoComplete="current-password"
            required
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="input-field"
          />
          <button
            type="submit"
            disabled={authLoading}
            className="action-btn"
          >
            {authLoading ? (
              <><FaSpinner className="spin" style={{marginRight: 6}}/>Logging in...</>
            ) : "Login"}
          </button>
          <div className="version" style={{ textAlign: "center", marginTop: 6 }}>
            {EXTENSION_VERSION}
          </div>
          <div className="login-footer">
            <div className="os-dwaidatta">
              <p>
                🧡 This is an Open Source Project from <a href="https://stack-kgec.pages.dev/" target="_blank">STACK, KGEC</a>
                <br />
                🤍 Development, Idea & Debugging: <a href="https://dwaidatta.in/" target="_blank">Dwaipayan Datta</a>
                <br />
                💚 Testing: <a>Abhi Pal</a>, <a>Agniva Hait</a>, <a href="https://dwaidatta.in/" target="_blank">Dwaipayan Datta</a>
              </p>
            </div>
            <div className="login-ftr-btns">
              <button
                className="opensource-btn"
                title="Contribute on GitHub"
                onClick={() => window.open("https://github.com/STACK-KGEC/dsa-uploader-extension", "_blank")}
                >
                <FaGithub /> Contribute on GitHub
              </button>
              <button
                className="report-issue-btn"
                title="Report an Issue"
                onClick={() => window.open("https://github.com/STACK-KGEC/dsa-uploader-extension/issues/new", "_blank")}
              >
                <FaExclamationCircle /> Report an Issue
              </button>
            </div>
        </div>
        </form>
      </div>
    );
  }

  return (
    <div className="popup-root">
      <div className="header">
        <div className="header-top">
          <div className="brand">
            <FaCode size={16} color="#6366f1" />
            <span className="header-title">DSA Uploader</span>
            <span className="version">{EXTENSION_VERSION}</span>
          </div>
          <button
            className="opensource-btn"
            title="Contribute on GitHub"
            onClick={() => window.open("https://github.com/STACK-KGEC/dsa-uploader-extension", "_blank")}
            >
            <FaGithub /> GitHub
          </button>
          <button
            className="report-issue-btn"
            title="Report an Issue"
            onClick={() => window.open("https://github.com/STACK-KGEC/dsa-uploader-extension/issues/new", "_blank")}
          >
            <FaExclamationCircle /> Issue
          </button>
          <button onClick={handleLogout} className="logout-btn" title="Logout">
            Logout
          </button>
        </div>
        <div className="user-row">
          Logged in as 
          <span className="user-email" title={user.email}>
            {user.email}
          </span>
        </div>
        <div className="os-dwaidatta">
          <p>
            🧡 This is an Open Source Project from <a href="https://stack-kgec.pages.dev/" target="_blank">STACK, KGEC</a>
            <br />
            🤍 Development, Idea & Debugging: <a href="https://dwaidatta.in/" target="_blank">Dwaipayan Datta</a>
            <br />
            💚 Testing: <a>Abhi Pal</a>, <a>Agniva Hait</a>, <a href="https://dwaidatta.in/" target="_blank">Dwaipayan Datta</a>
          </p>
        </div>
        <div className={`status-bar ${statusMsg.type}`}>
          {statusMsg.type === "success" && <FaCheckCircle size={12} color="#059669" />}
          {statusMsg.type === "error" && <FaExclamationCircle size={12} color="#dc2626" />}
          {statusMsg.type === "loading" && <FaSpinner className="spin" size={12} color="#6366f1" />}
          {statusMsg.msg}
        </div>
        {loading && (
            <div className="progress-bar-wrap">
              <progress value={progress} max="100" />
              <span style={{ marginLeft: 8 }}>{progress}%</span>
            </div>
          )}
      </div>
      <button
        onClick={fetchProblems}
        disabled={loading}
        className="action-btn"
        style={{ marginBottom: 10, marginTop: 2 }}
      >
        {loading ? (
          <><FaSpinner className="spin" style={{marginRight: 6}}/>Loading...</>
        ) : "Load Accepted (last 7 days)"}
      </button>
      {problems.length > 0 && (
        <div className="table-wrap">
          <table className="problems-table">
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={el => {
                      if (el) el.indeterminate = someSelected;
                    }}
                    onChange={handleToggleAll}
                    title={allSelected ? "Unselect all" : "Select all"}
                  />
                </th>
                <th>Date</th>
                <th>Problem</th>
                <th>Difficulty</th>
              </tr>
            </thead>
            <tbody>
              {problems.map((p, i) => (
                <tr key={i}>
                  <td>
                    <input
                      type="checkbox"
                      checked={!!selected[i]}
                      onChange={() => handleSelect(i)}
                    />
                  </td>
                  <td>{p.date}</td>
                  <td>
                    <a href={p.url} target="_blank" rel="noopener noreferrer">{p.name}</a>
                  </td>
                  <td>
                    {p.difficulty === "Easy" && (
                      <span style={{ color: "#22c55e", fontWeight: 600 }}>{p.difficulty}</span>
                    )}
                    {p.difficulty === "Medium" && (
                      <span style={{ color: "#f59e42", fontWeight: 600 }}>{p.difficulty}</span>
                    )}
                    {p.difficulty === "Hard" && (
                      <span style={{ color: "#ef4444", fontWeight: 600 }}>{p.difficulty}</span>
                    )}
                    {!["Easy", "Medium", "Hard"].includes(p.difficulty) && p.difficulty}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button
            onClick={addSolved}
            disabled={loading || !Object.values(selected).some(v => v)}
            className="action-btn"
            style={{ background: "#22c55e", marginTop: 20 }}
          >
            <FaCheckCircle style={{ verticalAlign: "middle", marginRight: 6 }} />
            Add Solved
          </button>
        </div>
      )}
      {problems.length === 0 && !loading && (
        <div className="status-bar" style={{ color: "#64748b", marginTop: 18 }}>
          No problems loaded yet. Click "Load Accepted" to fetch your recent progress.
        </div>
      )}
    </div>
  );
};

export default App;
