import { useState, useEffect, useCallback } from 'react';
import './App.css';

/** Shape of a server entry returned by the master server. */
interface ServerEntry {
  id: string;
  name: string;
  ip: string;
  port: number;
  players: number;
  maxPlayers: number;
}

const MASTER_SERVER_URL = import.meta.env.VITE_MASTER_SERVER_URL ?? 'http://localhost:3000';

async function fetchServerList(): Promise<ServerEntry[]> {
  const res = await fetch(`${MASTER_SERVER_URL}/servers/list`);
  if (!res.ok) throw new Error(`Master server responded with ${res.status}`);
  return res.json() as Promise<ServerEntry[]>;
}

/**
 * Writes connection.json via the Tauri backend and then launches SKSE.
 * TODO (Phase 2): Implement the corresponding Tauri command in src-tauri/src/main.rs
 */
async function joinServer(server: ServerEntry): Promise<void> {
  // Dynamically import Tauri API only at runtime (not available in browser dev mode)
  const { invoke } = await import('@tauri-apps/api/tauri');
  await invoke('join_server', { ip: server.ip, port: server.port });
}

export default function App() {
  const [servers, setServers] = useState<ServerEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchServerList();
      setServers(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => { refresh(); }, [refresh]);

  const filtered = servers.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="app">
      <header className="app-header">
        <h1>SkyMP Launcher</h1>
        <div className="controls">
          <input
            type="text"
            placeholder="Search servers..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="search-input"
          />
          <button onClick={refresh} disabled={loading} className="btn-refresh">
            {loading ? 'Loading…' : '⟳ Refresh'}
          </button>
        </div>
      </header>

      {error && <p className="error">⚠ {error}</p>}

      <main className="server-list">
        {!loading && filtered.length === 0 && (
          <p className="empty">No servers found.</p>
        )}
        {filtered.map(server => (
          <ServerCard key={server.id} server={server} onJoin={joinServer} />
        ))}
      </main>
    </div>
  );
}

interface ServerCardProps {
  server: ServerEntry;
  onJoin: (server: ServerEntry) => Promise<void>;
}

function ServerCard({ server, onJoin }: ServerCardProps) {
  const [joining, setJoining] = useState(false);

  const handleJoin = async () => {
    setJoining(true);
    try {
      await onJoin(server);
    } catch (e) {
      alert(`Failed to join server: ${e instanceof Error ? e.message : e}`);
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="server-card">
      <div className="server-info">
        <h2 className="server-name">{server.name}</h2>
        <span className="server-address">{server.ip}:{server.port}</span>
      </div>
      <div className="server-meta">
        <span className="player-count">
          👥 {server.players}/{server.maxPlayers}
        </span>
        <button onClick={handleJoin} disabled={joining} className="btn-join">
          {joining ? 'Joining…' : 'Join'}
        </button>
      </div>
    </div>
  );
}
