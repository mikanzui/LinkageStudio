import { useState, useEffect, useCallback } from 'react';
import { useMsal, useIsAuthenticated } from '@azure/msal-react';
import { loginScopes } from '../auth/msal-config';
import { listProjects, deleteProject, renameProject } from '../services/onedrive';
import type { OneDriveFile } from '../services/onedrive';
import './ProjectsPage.css';
import { APP_VERSION } from '../app-version';

interface Props {
  onOpenProject: (fileId: string, fileName: string) => void;
  onNewProject: () => void;
  onOpenLocal: () => void;
}

export function ProjectsPage({ onOpenProject, onNewProject, onOpenLocal }: Props) {
  const { instance, accounts } = useMsal();
  const isAuthenticated = useIsAuthenticated();
  const account = accounts[0] ?? null;

  const [files, setFiles] = useState<OneDriveFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ fileId: string; x: number; y: number } | null>(null);

  const loadFiles = useCallback(async () => {
    if (!account) return;
    setLoading(true);
    setError(null);
    try {
      const result = await listProjects(instance, account);
      setFiles(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  }, [instance, account]);

  useEffect(() => {
    if (isAuthenticated && account) void loadFiles();
  }, [isAuthenticated, account, loadFiles]);

  const handleSignIn = () => {
    instance.loginRedirect({ scopes: loginScopes });
  };

  const handleSignOut = () => {
    instance.logoutRedirect();
    setFiles([]);
  };

  const handleDelete = async (file: OneDriveFile) => {
    if (!account) return;
    if (!confirm(`Delete "${file.name.replace('.slinker', '')}"? This cannot be undone.`)) return;
    try {
      await deleteProject(instance, account, file.id);
      setFiles((prev) => prev.filter((f) => f.id !== file.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  const handleRename = async (file: OneDriveFile) => {
    if (!account) return;
    const current = file.name.replace('.slinker', '');
    const newName = prompt('Rename project:', current);
    if (!newName || newName.trim() === current) return;
    try {
      await renameProject(instance, account, file.id, newName.trim());
      void loadFiles();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rename');
    }
  };

  const handleContextMenu = (e: React.MouseEvent, fileId: string) => {
    e.preventDefault();
    setContextMenu({ fileId, x: e.clientX, y: e.clientY });
  };

  useEffect(() => {
    if (!contextMenu) return;
    const dismiss = () => setContextMenu(null);
    window.addEventListener('click', dismiss);
    return () => window.removeEventListener('click', dismiss);
  }, [contextMenu]);

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
  };

  const logoSrc = `${import.meta.env.BASE_URL}icon-192.svg`;

  return (
    <div className="projects-page">
      <div className="projects-panel">
        <div className="projects-header">
          <img className="projects-logo" src={logoSrc} alt="" width={48} height={48} />
          <div className="projects-header-text">
            <h1 className="projects-title">Slinker</h1>
            <span className="projects-version">V{APP_VERSION}</span>
          </div>
          {isAuthenticated && account && (
            <div className="projects-user">
              <span className="projects-user-name">{account.name || account.username}</span>
              <button className="projects-link-btn" onClick={handleSignOut}>Sign out</button>
            </div>
          )}
        </div>

        {isAuthenticated && account ? (
          <>
            <div className="projects-section-header">
              <h2 className="projects-section-title">Your Projects</h2>
              <button className="projects-btn projects-btn-primary" onClick={onNewProject}>
                + New Project
              </button>
            </div>

            {loading && <div className="projects-status">Loading projects...</div>}
            {error && <div className="projects-status projects-error">{error}</div>}

            {!loading && files.length === 0 && !error && (
              <div className="projects-empty">
                <p>No projects yet.</p>
                <p>Create a new project or open a local file to get started.</p>
              </div>
            )}

            {files.length > 0 && (
              <div className="projects-grid">
                {files.map((file) => (
                  <button
                    key={file.id}
                    className="projects-card"
                    onClick={() => onOpenProject(file.id, file.name)}
                    onContextMenu={(e) => handleContextMenu(e, file.id)}
                  >
                    <div className="projects-card-icon">
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="8" cy="8" r="2" />
                        <circle cx="16" cy="8" r="2" />
                        <circle cx="12" cy="16" r="2" />
                        <line x1="10" y1="8" x2="14" y2="8" />
                        <line x1="9" y1="9.7" x2="11" y2="14.3" />
                        <line x1="15" y1="9.7" x2="13" y2="14.3" />
                      </svg>
                    </div>
                    <span className="projects-card-name">{file.name.replace('.slinker', '')}</span>
                    <span className="projects-card-date">{formatDate(file.lastModifiedDateTime)}</span>
                  </button>
                ))}
              </div>
            )}

            <div className="projects-footer-actions">
              <button className="projects-btn projects-btn-secondary" onClick={onOpenLocal}>
                Open Local File
              </button>
              <button className="projects-link-btn" onClick={() => void loadFiles()}>
                Refresh
              </button>
            </div>
          </>
        ) : (
          <div className="projects-signin-section">
            <p className="projects-signin-text">
              Sign in with your Microsoft account to save and sync projects to OneDrive.
            </p>
            <button className="projects-btn projects-btn-ms" onClick={handleSignIn}>
              <svg width="16" height="16" viewBox="0 0 21 21" fill="none">
                <rect x="1" y="1" width="9" height="9" fill="#F25022" />
                <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
                <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
                <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
              </svg>
              Sign in with Microsoft
            </button>
            <div className="projects-divider">
              <span>or</span>
            </div>
            <div className="projects-guest-actions">
              <button className="projects-btn projects-btn-primary" onClick={onNewProject}>
                New Blank Project
              </button>
              <button className="projects-btn projects-btn-secondary" onClick={onOpenLocal}>
                Open Local File
              </button>
            </div>
          </div>
        )}
      </div>

      {contextMenu && (() => {
        const file = files.find((f) => f.id === contextMenu.fileId);
        if (!file) return null;
        return (
          <div
            className="projects-context-menu"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button onClick={() => { setContextMenu(null); onOpenProject(file.id, file.name); }}>Open</button>
            <button onClick={() => { setContextMenu(null); void handleRename(file); }}>Rename</button>
            <button className="danger" onClick={() => { setContextMenu(null); void handleDelete(file); }}>Delete</button>
          </div>
        );
      })()}
    </div>
  );
}
