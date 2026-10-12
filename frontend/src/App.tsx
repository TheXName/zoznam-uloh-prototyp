import { FormEvent, useEffect, useState } from 'react';

interface User {
  id: string;
  name: string;
  email: string;
}

interface Task {
  id: string;
  title: string;
  description: string;
  dueAt: string | null;
  googleEventId: string | null;
  calendarError?: string | null;
}

/** Volanie backendu. Prihlasovací token je uložený v prehliadači (localStorage). */
async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token') ?? ''}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message ?? `Chyba ${res.status}`);
  return data;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [checked, setChecked] = useState(false);

  // po otvorení stránky skúsime, či je používateľ ešte prihlásený
  useEffect(() => {
    api<User>('GET', '/auth/me')
      .then(setUser)
      .catch(() => localStorage.removeItem('token'))
      .finally(() => setChecked(true));
  }, []);

  if (!checked) return null;
  if (!user) return <Login onLogin={setUser} />;
  return (
    <Tasks
      user={user}
      onLogout={() => {
        localStorage.removeItem('token');
        setUser(null);
      }}
    />
  );
}

/* ---------- Registrácia / prihlásenie ---------- */

function Login({ onLogin }: { onLogin: (u: User) => void }) {
  const [register, setRegister] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      const r = await api<{ token: string; user: User }>(
        'POST',
        register ? '/auth/register' : '/auth/login',
        register ? { name, email, password } : { email, password },
      );
      localStorage.setItem('token', r.token);
      onLogin(r.user);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <main className="narrow">
      <h1>Zoznam úloh</h1>
      <form className="card" onSubmit={submit}>
        <h2>{register ? 'Registrácia' : 'Prihlásenie'}</h2>
        {register && (
          <label>
            Meno
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
        )}
        <label>
          E-mail
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          Heslo
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="primary">{register ? 'Zaregistrovať sa' : 'Prihlásiť sa'}</button>
        <button
          type="button"
          className="link"
          onClick={() => {
            setRegister(!register);
            setError('');
          }}
        >
          {register ? 'Už mám účet – prihlásiť sa' : 'Nemám účet – zaregistrovať sa'}
        </button>
      </form>
    </main>
  );
}

/* ---------- Úlohy + Google kalendár ---------- */

function Tasks({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [google, setGoogle] = useState({ configured: false, connected: false });
  const [message, setMessage] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueAt, setDueAt] = useState('');

  const load = () => api<Task[]>('GET', '/tasks').then(setTasks);

  useEffect(() => {
    load();
    api<typeof google>('GET', '/google/status').then(setGoogle);
    // návrat zo stránky Google po udelení súhlasu
    const result = new URLSearchParams(location.search).get('google');
    if (result === 'ok') setMessage('Google kalendár je prepojený.');
    if (result === 'chyba') setMessage('Prepojenie s Google kalendárom sa nepodarilo.');
    if (result) history.replaceState(null, '', '/');
  }, []);

  async function connectGoogle() {
    try {
      const { url } = await api<{ url: string }>('GET', '/google/connect');
      location.href = url; // presmerovanie na súhlasnú obrazovku Google
    } catch (e) {
      setMessage((e as Error).message);
    }
  }

  async function addTask(e: FormEvent) {
    e.preventDefault();
    try {
      const task = await api<Task>('POST', '/tasks', {
        title,
        description,
        dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
      });
      setMessage(
        task.calendarError
          ? `Úloha uložená, ale do kalendára sa nezapísala: ${task.calendarError}`
          : task.googleEventId
            ? 'Úloha uložená a zapísaná do Google kalendára.'
            : 'Úloha uložená.',
      );
      setTitle('');
      setDescription('');
      setDueAt('');
      load();
    } catch (err) {
      setMessage((err as Error).message);
    }
  }

  async function deleteTask(id: string) {
    await api('DELETE', `/tasks/${id}`);
    setMessage('Úloha zmazaná.');
    load();
  }

  return (
    <main className="narrow">
      <header>
        <h1>Zoznam úloh</h1>
        <span>
          {user.name} · <button className="link" onClick={onLogout}>Odhlásiť</button>
        </span>
      </header>

      <section className="card google">
        <div>
          <h2>Google kalendár</h2>
          <p className="muted">
            {!google.configured
              ? 'Na serveri chýba GOOGLE_CLIENT_ID a GOOGLE_CLIENT_SECRET (pozri README).'
              : google.connected
                ? 'Prepojený – úlohy s termínom sa zapíšu do vášho kalendára.'
                : 'Po prepojení sa úlohy s termínom zapíšu do vášho Google kalendára.'}
          </p>
        </div>
        <button className={google.connected ? '' : 'primary'} onClick={connectGoogle} disabled={!google.configured}>
          {google.connected ? 'Prepojiť znova' : 'Prepojiť Google kalendár'}
        </button>
      </section>

      <form className="card" onSubmit={addTask}>
        <h2>Nová úloha</h2>
        <label>
          Názov
          <input value={title} onChange={(e) => setTitle(e.target.value)} required />
        </label>
        <label>
          Termín
          <input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
        </label>
        <label>
          Popis
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
        </label>
        <button className="primary">Pridať úlohu</button>
      </form>

      {message && <p className="message">{message}</p>}

      <h2>Moje úlohy ({tasks.length})</h2>
      {tasks.length === 0 && <p className="muted">Zatiaľ žiadne úlohy.</p>}
      <ul className="tasks">
        {tasks.map((t) => (
          <li key={t.id} className="card">
            <div>
              <strong>{t.title}</strong>
              {t.description && <p>{t.description}</p>}
              <small className="muted">
                {t.dueAt ? new Date(t.dueAt).toLocaleString('sk-SK') : 'bez termínu'}
                {t.googleEventId && ' · v Google kalendári'}
              </small>
            </div>
            <button className="link danger" onClick={() => deleteTask(t.id)}>
              Zmazať
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
