'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  SUBJECT_PRESETS,
  SHOT_TYPE_PRESETS,
  MOOD_PRESETS,
  CAMPAIGN_PRESETS,
  OUTPUT_FORMAT_PRESETS,
  DS_MODELS,
} from '@/lib/brand-config';
import type { PromptGenerateRequest } from '@/app/api/prompt-generate/route';
import type { StoryBuildRequest, StoryBuildResponse, StoryboardClip, MusicSuggestion } from '@/app/api/story-build/route';

// ── Types ───────────────────────────────────────────────────────────────────
interface Asset {
  id: string; filePath: string; fileName: string; fileSize: number;
  mediaType: 'video' | 'image'; durationSeconds: number | null;
  subject: string; handZone: string | null; dsModel: string | null;
  purpose: string; campaign: string; shotType: string; finalStatus: string;
  colorLabel: string | null; priority: string; mood: string; colorGrade: string;
  aiDescription: string; aiKeywords: string; thumbPath: string | null;
  orientation: string | null; aspectRatio: string | null;
  width: number | null; height: number | null; codec: string | null;
  fps: number | null; updatedAt: number;
}
interface Stats { total: number; finals: number; highPriority: number; }
interface DraftMeta { id: string; name: string; createdAt: number; updatedAt: number; }

// ── Constants ───────────────────────────────────────────────────────────────
const COLOR_CHIPS: Record<string, { bg: string; label: string }> = {
  red: { bg: '#ef4444', label: 'Red' }, orange: { bg: '#f97316', label: 'Orange' },
  yellow: { bg: '#eab308', label: 'Yellow' }, green: { bg: '#22c55e', label: 'Green' },
  blue: { bg: '#3b82f6', label: 'Blue' }, purple: { bg: '#a855f7', label: 'Purple' },
  gray: { bg: '#6b7280', label: 'Gray' },
};
const SUBJECTS = ['hands', 'piano-keys', 'piano-full', 'talking-head', 'lifestyle', 'product', 'abstract', 'mixed'];
const PURPOSES = ['education', 'marketing', 'social-reel', 'product-demo', 'testimonial', 'b-roll'];
const CAMPAIGNS = ['CEO Spotlight', 'Piano Comparison', 'Handspan Measurement', 'La Campanella', 'NAMM', 'Duel Piano', 'Other'];
const SHOT_TYPES = ['close-up', 'medium', 'wide', 'overhead', 'POV', 'detail'];
const ROLE_COLORS: Record<string, string> = {
  hook: '#ef4444', proof: '#3b82f6', demo: '#a855f7', emotion: '#f97316', cta: '#22c55e',
};
const FORMATS = [
  { id: 'instagram-reel', label: '📱 Instagram Reel', sec: 30 },
  { id: 'tiktok', label: '🎵 TikTok', sec: 30 },
  { id: 'youtube-short', label: '▶️ YouTube Short', sec: 45 },
  { id: 'facebook-ad', label: '📢 Facebook Ad', sec: 20 },
  { id: 'custom', label: '🎬 Custom', sec: 60 },
];

function formatDuration(s: number | null): string {
  if (!s) return ''; if (s < 60) return `${s.toFixed(1)}s`;
  return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
}
function formatBytes(b: number): string {
  if (b > 1e9) return `${(b / 1e9).toFixed(1)} GB`;
  if (b > 1e6) return `${(b / 1e6).toFixed(1)} MB`;
  return `${(b / 1e3).toFixed(0)} KB`;
}
function thumbUrl(asset: Asset | { thumbPath: string | null }): string {
  if (asset.thumbPath) return `/api/thumb?path=${encodeURIComponent(asset.thumbPath)}`;
  return '';
}

// ── Multi-select chip helper ─────────────────────────────────────────────────
function MultiChip({ id, label, selected, onToggle, colorClass }: {
  id: string; label: string; selected: boolean; onToggle: (id: string) => void; colorClass?: string;
}) {
  return (
    <button
      className={`preset-chip ${colorClass ?? ''} ${selected ? 'active' : ''}`}
      onClick={() => onToggle(id)}
    >{label}</button>
  );
}

// ── Prompt Box (multi-select) ────────────────────────────────────────────────
function PromptBox() {
  const [isOpen, setIsOpen] = useState(false);
  const [subjects, setSubjects] = useState<string[]>([]);
  const [shots, setShots] = useState<string[]>([]);
  const [moods, setMoods] = useState<string[]>([]);
  const [campaigns, setCampaigns] = useState<string[]>([]);
  const [dsModels, setDsModels] = useState<string[]>([]);
  const [formats, setFormats] = useState<string[]>([]);
  const [customNotes, setCustomNotes] = useState('');
  const [generatedPrompt, setGeneratedPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [copyMsg, setCopyMsg] = useState('');
  const [error, setError] = useState('');

  function toggle(arr: string[], setArr: (v: string[]) => void, id: string) {
    setArr(arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id]);
  }

  async function handleGenerate() {
    setIsGenerating(true); setError(''); setGeneratedPrompt('');
    const body: PromptGenerateRequest = {
      subjectPrompt: subjects.map(id => SUBJECT_PRESETS.find(p => p.id === id)?.prompt ?? '').filter(Boolean).join('; '),
      shotTypePrompt: shots.map(id => SHOT_TYPE_PRESETS.find(p => p.id === id)?.prompt ?? '').filter(Boolean).join('; '),
      moodPrompt: moods.map(id => MOOD_PRESETS.find(p => p.id === id)?.prompt ?? '').filter(Boolean).join('; '),
      campaignPrompt: campaigns.filter(id => id !== 'none').map(id => CAMPAIGN_PRESETS.find(p => p.id === id)?.prompt ?? '').filter(Boolean).join('; '),
      dsModel: dsModels.join(', '),
      dsModelDescription: dsModels.map(k => DS_MODELS[k as keyof typeof DS_MODELS]?.description ?? '').filter(Boolean).join('; '),
      outputFormat: formats.map(id => OUTPUT_FORMAT_PRESETS.find(p => p.id === id)?.prompt ?? '').filter(Boolean).join('; '),
      customNotes,
    };
    try {
      const res = await fetch('/api/prompt-generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setGeneratedPrompt(data.prompt);
    } catch (err) { setError(String(err)); }
    setIsGenerating(false);
  }

  function handleReset() {
    setSubjects([]); setShots([]); setMoods([]); setCampaigns([]);
    setDsModels([]); setFormats([]); setCustomNotes(''); setGeneratedPrompt(''); setError('');
  }

  const hasSelections = subjects.length || shots.length || moods.length || dsModels.length;

  return (
    <div className={`prompt-box ${isOpen ? 'open' : ''}`}>
      <button className="prompt-toggle" onClick={() => setIsOpen(v => !v)}>
        <span className="prompt-toggle-left">
          <span className="prompt-icon">✨</span>
          <span className="prompt-toggle-title">Prompt Builder</span>
          <span className="prompt-toggle-sub">Generate brand-accurate AI prompts — multi-select any category</span>
        </span>
        <span className="prompt-toggle-chevron">{isOpen ? '▲' : '▼'}</span>
      </button>
      {isOpen && (
        <div className="prompt-body">
          <div className="prompt-presets-grid">
            <div className="preset-group">
              <div className="preset-label">Subject {subjects.length > 1 && <span className="preset-count">{subjects.length}</span>}</div>
              <div className="preset-chips">{SUBJECT_PRESETS.map(p => <MultiChip key={p.id} id={p.id} label={p.label} selected={subjects.includes(p.id)} onToggle={id => toggle(subjects, setSubjects, id)} />)}</div>
            </div>
            <div className="preset-group">
              <div className="preset-label">DS Model {dsModels.length > 1 && <span className="preset-count">{dsModels.length}</span>}</div>
              <div className="preset-chips">{Object.entries(DS_MODELS).map(([key, val]) => <MultiChip key={key} id={key} label={val.label} selected={dsModels.includes(key)} onToggle={id => toggle(dsModels, setDsModels, id)} colorClass="ds" />)}</div>
            </div>
            <div className="preset-group">
              <div className="preset-label">Shot Type {shots.length > 1 && <span className="preset-count">{shots.length}</span>}</div>
              <div className="preset-chips">{SHOT_TYPE_PRESETS.map(p => <MultiChip key={p.id} id={p.id} label={p.label} selected={shots.includes(p.id)} onToggle={id => toggle(shots, setShots, id)} />)}</div>
            </div>
            <div className="preset-group">
              <div className="preset-label">Mood / Style {moods.length > 1 && <span className="preset-count">{moods.length}</span>}</div>
              <div className="preset-chips">{MOOD_PRESETS.map(p => <MultiChip key={p.id} id={p.id} label={p.label} selected={moods.includes(p.id)} onToggle={id => toggle(moods, setMoods, id)} />)}</div>
            </div>
            <div className="preset-group">
              <div className="preset-label">Campaign {campaigns.length > 1 && <span className="preset-count">{campaigns.length}</span>}</div>
              <div className="preset-chips">{CAMPAIGN_PRESETS.map(p => <MultiChip key={p.id} id={p.id} label={p.label} selected={campaigns.includes(p.id)} onToggle={id => toggle(campaigns, setCampaigns, id)} />)}</div>
            </div>
            <div className="preset-group">
              <div className="preset-label">Output Format {formats.length > 1 && <span className="preset-count">{formats.length}</span>}</div>
              <div className="preset-chips">{OUTPUT_FORMAT_PRESETS.map(p => <MultiChip key={p.id} id={p.id} label={p.label} selected={formats.includes(p.id)} onToggle={id => toggle(formats, setFormats, id)} />)}</div>
            </div>
          </div>
          <div className="prompt-notes-row">
            <textarea className="prompt-notes" placeholder="Extra context… (e.g. 'show the sustain pedal', 'blue ambient lighting')" value={customNotes} onChange={e => setCustomNotes(e.target.value)} rows={2} />
          </div>
          <div className="prompt-actions">
            <button className="prompt-generate-btn" onClick={handleGenerate} disabled={isGenerating || !hasSelections}>
              {isGenerating ? <><span className="prompt-spinner" />Generating…</> : '✨ Generate Prompt'}
            </button>
            {(hasSelections || generatedPrompt) && <button className="prompt-reset-btn" onClick={handleReset}>↺ Reset</button>}
          </div>
          {isGenerating && <div className="prompt-output-shimmer"><div className="shimmer-bar w80" /><div className="shimmer-bar w60" /><div className="shimmer-bar w90" /><div className="shimmer-bar w50" /></div>}
          {error && <div className="prompt-error">⚠ {error}</div>}
          {generatedPrompt && !isGenerating && (
            <div className="prompt-output-wrap">
              <div className="prompt-output-header">
                <span className="prompt-output-label">Generated Prompt</span>
                <button className="prompt-copy-btn" onClick={() => { navigator.clipboard.writeText(generatedPrompt); setCopyMsg('Copied!'); setTimeout(() => setCopyMsg(''), 2000); }}>{copyMsg || '📋 Copy'}</button>
              </div>
              <textarea className="prompt-output" readOnly value={generatedPrompt} rows={5} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Sequential Video Player (Spotify edition) ──────────────────────────────
interface SeqClip { clip: { role: string; suggestedStartSec: number; suggestedEndSec: number; overlayText?: string }; asset: Asset | undefined; }

interface SpotifyTrack { name: string; artist: string; previewUrl: string | null; albumArt: string | null; spotifyUrl: string | null; }

function SequentialPlayer({ clips: initialClips, musicQuery }: { clips: SeqClip[]; musicQuery?: string }) {
  const [clips, setClips] = useState(initialClips);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [spotifyConnected, setSpotifyConnected] = useState<boolean | null>(null);
  const [spotifyTrack, setSpotifyTrack] = useState<SpotifyTrack | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Sync clip list with props (for live edits from parent)
  useEffect(() => { setClips(initialClips); }, [initialClips]);

  const current = clips[idx];
  const streamUrl = current?.asset?.filePath
    ? `/api/stream?path=${encodeURIComponent(current.asset.filePath)}`
    : null;

  // Fetch Spotify track on mount
  useEffect(() => {
    async function fetchTrack() {
      try {
        const q = musicQuery ?? 'cinematic ambient';
        const res = await fetch(`/api/spotify/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        setSpotifyConnected(data.connected);
        if (data.track) setSpotifyTrack(data.track);
      } catch { setSpotifyConnected(false); }
    }
    fetchTrack();
  }, [musicQuery]);

  // When clip changes, reload video
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !streamUrl) return;
    v.load();
    if (playing) v.play().catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, streamUrl]);

  function syncAudio(shouldPlay: boolean) {
    const a = audioRef.current;
    if (!a) return;
    if (shouldPlay && a.paused) a.play().catch(() => {});
    else if (!shouldPlay && !a.paused) a.pause();
  }

  function onEnded() {
    if (idx < clips.length - 1) { setIdx(i => i + 1); }
    else { setPlaying(false); syncAudio(false); setIdx(0); }
  }

  function togglePlay() {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play().catch(() => {}); syncAudio(true); setPlaying(true); }
    else { v.pause(); syncAudio(false); setPlaying(false); }
  }

  function jumpTo(i: number) {
    setIdx(i); setPlaying(false); syncAudio(false);
    if (audioRef.current) audioRef.current.currentTime = 0;
  }

  function removeClip(i: number) {
    setClips(prev => prev.filter((_, ci) => ci !== i));
    if (idx >= i && idx > 0) setIdx(j => j - 1);
  }

  function moveClip(from: number, to: number) {
    if (from === to) return;
    setClips(prev => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  }

  const dragRef = useRef<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  if (!streamUrl || clips.length === 0) return (
    <div className="preview-no-video">No video clips — add video assets in Step 2.</div>
  );

  return (
    <div className="seq-player">
      {/* Hidden Spotify audio */}
      {spotifyTrack?.previewUrl && (
        <audio ref={audioRef} src={spotifyTrack.previewUrl} loop preload="auto" />
      )}

      <div className="seq-layout">
        {/* Left: video */}
        <div className="seq-left">
          <div className="seq-video-wrap">
            <video ref={videoRef} className="seq-video" onEnded={onEnded} onClick={togglePlay}
              src={streamUrl} playsInline controls={false} style={{ cursor: 'pointer' }} />
            {current?.clip?.overlayText && (
              <div className="seq-overlay-text">{current.clip.overlayText}</div>
            )}
            {!playing && (
              <div className="seq-play-btn" onClick={togglePlay}>
                <svg viewBox="0 0 24 24" fill="currentColor" width="40" height="40"><polygon points="5,3 19,12 5,21"/></svg>
              </div>
            )}
            <div className="seq-clip-counter">{idx + 1} / {clips.length} · {current?.clip?.role}</div>
          </div>

          {/* Spotify bar */}
          <div className="spotify-bar">
            {spotifyConnected === false && (
              <a href="/api/spotify/login" className="spotify-connect-btn">
                <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>
                Connect Spotify
              </a>
            )}
            {spotifyConnected === true && !spotifyTrack && (
              <span className="spotify-searching">Searching Spotify…</span>
            )}
            {spotifyTrack && (
              <>
                {spotifyTrack.albumArt && <img src={spotifyTrack.albumArt} alt="" className="spotify-art" />}
                <div className="spotify-info">
                  <span className="spotify-track-name">{spotifyTrack.name}</span>
                  <span className="spotify-artist">{spotifyTrack.artist}</span>
                </div>
                <span className="spotify-badge">30s preview</span>
                {spotifyTrack.spotifyUrl && (
                  <a href={spotifyTrack.spotifyUrl} target="_blank" rel="noreferrer" className="spotify-open-link">Open ↗</a>
                )}
              </>
            )}
          </div>
        </div>

        {/* Right: live-edit clip list */}
        <div className="seq-edit-panel">
          <div className="seq-edit-title">Edit Clips <span style={{fontWeight:400,opacity:0.5}}>· drag to reorder</span></div>
          {clips.map((c, i) => (
            <div
              key={i}
              className={`seq-edit-row ${i === idx ? 'active' : ''} ${dragOver === i ? 'drag-over' : ''}`}
              onClick={() => jumpTo(i)}
              draggable
              onDragStart={() => { dragRef.current = i; }}
              onDragOver={e => { e.preventDefault(); setDragOver(i); }}
              onDragLeave={() => setDragOver(null)}
              onDrop={e => { e.preventDefault(); setDragOver(null); if (dragRef.current !== null) moveClip(dragRef.current, i); dragRef.current = null; }}
              onDragEnd={() => { dragRef.current = null; setDragOver(null); }}
            >
              <div className="seq-edit-grip">⋮</div>
              <div className="seq-edit-num">{i + 1}</div>
              {c.asset?.thumbPath
                ? <img src={`/api/thumb?path=${encodeURIComponent(c.asset.thumbPath)}`} alt="" className="seq-edit-thumb" />
                : <div className="seq-edit-thumb-placeholder">🎬</div>
              }
              <div className="seq-edit-info">
                <div className="seq-edit-role" style={{ color: ROLE_COLORS[c.clip.role] ?? '#aaa' }}>{c.clip.role}</div>
                <div className="seq-edit-name">{c.asset?.fileName ?? '—'}</div>
                <div className="seq-edit-dur">{c.clip.suggestedEndSec - c.clip.suggestedStartSec}s</div>
              </div>
              <div className="seq-edit-actions">
                <button className="seq-edit-btn danger" title="Remove" onClick={e => { e.stopPropagation(); removeClip(i); }}>✕</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Filmstrip scrubber — draggable */}
      <div className="seq-filmstrip">
        {clips.map((c, i) => (
          <div
            key={i}
            className={`seq-frame ${i === idx ? 'active' : ''} ${dragOver === i ? 'drag-over-frame' : ''}`}
            onClick={() => jumpTo(i)}
            draggable
            onDragStart={() => { dragRef.current = i; }}
            onDragOver={e => { e.preventDefault(); setDragOver(i); }}
            onDragLeave={() => setDragOver(null)}
            onDrop={e => { e.preventDefault(); setDragOver(null); if (dragRef.current !== null) moveClip(dragRef.current, i); dragRef.current = null; }}
            onDragEnd={() => { dragRef.current = null; setDragOver(null); }}
          >
            {c.asset?.thumbPath
              ? <img src={`/api/thumb?path=${encodeURIComponent(c.asset.thumbPath)}`} alt="" className="seq-frame-img" />
              : <div className="seq-frame-placeholder">🎬</div>
            }
            <div className="seq-frame-role" style={{ background: ROLE_COLORS[c.clip.role] ?? '#555' }}>{c.clip.role}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Style Library types ───────────────────────────────────────────────────────
interface StyleAnalysis {
  hookStyle: string; pacing: string; shotTypes: string[];
  textOverlayStyle: string; toneEnergy: string; ctaStyle: string;
  musicStyle: string; keyInsights: string[]; recommendedFor: string;
}
interface StyleProfile {
  id: string; name: string; createdAt: string;
  sourceType: 'file' | 'url'; sourceName: string;
  status: 'analyzing' | 'ready' | 'error'; errorMsg?: string;
  analysis?: StyleAnalysis; styleSummary?: string;
}

// ── Style Library Panel ───────────────────────────────────────────────────────
function StyleLibraryPanel({ onClose, onSelect }: { onClose: () => void; onSelect: (p: StyleProfile) => void }) {
  const [profiles, setProfiles] = useState<StyleProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [urlInput, setUrlInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [adding, setAdding] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { fetchProfiles(); }, []);

  // Poll analyzing profiles
  useEffect(() => {
    const analyzing = profiles.filter(p => p.status === 'analyzing');
    if (analyzing.length === 0) return;
    const t = setTimeout(() => fetchProfiles(), 4000);
    return () => clearTimeout(t);
  }, [profiles]);

  async function fetchProfiles() {
    try {
      const res = await fetch('/api/style-library');
      const data = await res.json();
      setProfiles(data.profiles ?? []);
    } catch {}
    setLoading(false);
  }

  async function addFromUrl() {
    if (!urlInput.trim()) return;
    setAdding(true);
    const name = nameInput.trim() || urlInput.slice(0, 40);
    try {
      const res = await fetch('/api/style-library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, sourceType: 'url', sourceName: urlInput }),
      });
      const { profile } = await res.json();
      setProfiles(prev => [profile, ...prev]);
      setUrlInput(''); setNameInput('');
      // Kick off analysis
      await fetch('/api/style-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: profile.id, url: urlInput }),
      });
      fetchProfiles();
    } catch {}
    setAdding(false);
  }

  async function addFromFile(file: File) {
    setAdding(true);
    const name = nameInput.trim() || file.name.replace(/\.[^.]+$/, '');
    try {
      // Upload file
      const fd = new FormData();
      fd.append('file', file);
      const uploadRes = await fetch('/api/style-upload', { method: 'POST', body: fd });
      const { filePath, fileName } = await uploadRes.json();
      // Create profile
      const profRes = await fetch('/api/style-library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, sourceType: 'file', sourceName: fileName }),
      });
      const { profile } = await profRes.json();
      setProfiles(prev => [profile, ...prev]);
      setNameInput('');
      // Kick off analysis
      await fetch('/api/style-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: profile.id, filePath }),
      });
      fetchProfiles();
    } catch {}
    setAdding(false);
  }

  async function deleteProfile(id: string) {
    await fetch(`/api/style-library?id=${id}`, { method: 'DELETE' });
    setProfiles(prev => prev.filter(p => p.id !== id));
  }

  return (
    <div className="sl-overlay" onClick={e => { if ((e.target as HTMLElement).classList.contains('sl-overlay')) onClose(); }}>
      <div className="sl-panel">
        <div className="sl-header">
          <div className="sl-header-left">
            <span className="sl-icon">🎞</span>
            <div>
              <div className="sl-title">Style Library</div>
              <div className="sl-subtitle">Upload reference videos to learn their editing style, pacing, and hooks</div>
            </div>
          </div>
          <button className="sl-close" onClick={onClose}>✕</button>
        </div>

        {/* Add new style */}
        <div className="sl-add-section">
          <input
            className="sl-name-input"
            placeholder="Name this style (e.g. MrBeast Hook, Apple Launch)"
            value={nameInput}
            onChange={e => setNameInput(e.target.value)}
          />
          <div className="sl-add-row">
            {/* URL input */}
            <input
              className="sl-url-input"
              placeholder="Paste YouTube URL or direct video link…"
              value={urlInput}
              onChange={e => setUrlInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addFromUrl()}
            />
            <button className="sl-add-btn" onClick={addFromUrl} disabled={adding || !urlInput.trim()}>
              {adding ? '…' : 'Analyze'}
            </button>
            <span className="sl-or">or</span>
            {/* File drop */}
            <div
              className={`sl-drop-zone ${dragOver ? 'dragover' : ''}`}
              onClick={() => fileRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => {
                e.preventDefault(); setDragOver(false);
                const f = e.dataTransfer.files[0];
                if (f) addFromFile(f);
              }}
            >
              <span>Drop video or click</span>
              <input ref={fileRef} type="file" accept="video/*" style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) addFromFile(f); }} />
            </div>
          </div>
        </div>

        {/* Style cards grid */}
        <div className="sl-grid">
          {loading ? (
            <div className="sl-empty">Loading…</div>
          ) : profiles.length === 0 ? (
            <div className="sl-empty">No styles yet. Add a reference video above to get started.</div>
          ) : profiles.map(p => (
            <div key={p.id} className={`sl-card ${p.status}`}>
              <div className="sl-card-header">
                <div className="sl-card-name">{p.name}</div>
                <div className="sl-card-badge">{p.status === 'analyzing' ? '⏳ Analyzing' : p.status === 'error' ? '❌ Error' : '✓ Ready'}</div>
              </div>
              <div className="sl-card-source">{p.sourceType === 'url' ? '🔗' : '📁'} {p.sourceName}</div>
              {p.status === 'ready' && p.analysis && (
                <div className="sl-card-traits">
                  <div className="sl-trait"><span className="sl-trait-label">Hook</span>{p.analysis.hookStyle}</div>
                  <div className="sl-trait"><span className="sl-trait-label">Pace</span>{p.analysis.pacing}</div>
                  <div className="sl-trait"><span className="sl-trait-label">Energy</span>{p.analysis.toneEnergy}</div>
                  <div className="sl-shots">{(p.analysis.shotTypes ?? []).map(s => <span key={s} className="sl-shot-chip">{s}</span>)}</div>
                </div>
              )}
              {p.status === 'error' && <div className="sl-card-error">{p.errorMsg}</div>}
              <div className="sl-card-actions">
                {p.status === 'ready' && (
                  <button className="sl-use-btn" onClick={() => { onSelect(p); onClose(); }}>Use This Style</button>
                )}
                <button className="sl-del-btn" onClick={() => deleteProfile(p.id)}>✕</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Clip Lightbox ─────────────────────────────────────────────────────────────
function ClipLightbox({
  clips, activeIdx, onClose, onDelete, onMove,
}: {
  clips: { clip: StoryboardClip; asset: Asset | undefined }[];
  activeIdx: number;
  onClose: () => void;
  onDelete: (i: number) => void;
  onMove: (from: number, to: number) => void;
}) {
  const [idx, setIdx] = useState(activeIdx);
  const total = clips.length;
  const cur = clips[idx];
  const streamUrl = cur?.asset?.filePath ? `/api/stream?path=${encodeURIComponent(cur.asset.filePath)}` : null;
  const isVideo = cur?.asset?.mediaType === 'video';

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') setIdx(i => Math.max(0, i - 1));
      if (e.key === 'ArrowRight') setIdx(i => Math.min(total - 1, i + 1));
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, total]);

  return (
    <div className="clb-overlay" onClick={e => { if ((e.target as HTMLElement).classList.contains('clb-overlay')) onClose(); }}>
      <div className="clb-modal">
        {/* Header */}
        <div className="clb-header">
          <div className="clb-header-info">
            <span className="clb-num">{idx + 1} / {total}</span>
            <span className="clb-role" style={{ background: ROLE_COLORS[cur?.clip?.role ?? ''] ?? '#555' }}>{cur?.clip?.role}</span>
            <span className="clb-filename">{cur?.asset?.fileName ?? '—'}</span>
            <span className="clb-timing">{cur?.clip?.suggestedStartSec}s – {cur?.clip?.suggestedEndSec}s</span>
          </div>
          <div className="clb-header-actions">
            <button className="clb-btn move" title="Move left" disabled={idx === 0} onClick={() => { onMove(idx, idx - 1); setIdx(i => i - 1); }}>← Move</button>
            <button className="clb-btn move" title="Move right" disabled={idx === total - 1} onClick={() => { onMove(idx, idx + 1); setIdx(i => i + 1); }}>Move →</button>
            <button className="clb-btn danger" title="Remove clip" onClick={() => { onDelete(idx); if (idx >= total - 1) setIdx(i => Math.max(0, i - 1)); }}>✕ Remove</button>
            <button className="clb-btn close" onClick={onClose}>✕</button>
          </div>
        </div>

        {/* Media */}
        <div className="clb-media">
          {!cur?.asset ? (
            <div className="clb-no-media">No asset</div>
          ) : isVideo && streamUrl ? (
            <video key={streamUrl} src={streamUrl} className="clb-video" controls playsInline />
          ) : cur?.asset?.thumbPath ? (
            <img src={`/api/thumb?path=${encodeURIComponent(cur.asset.thumbPath)}`} alt="" className="clb-image" />
          ) : (
            <div className="clb-no-media">No preview</div>
          )}
        </div>

        {/* Nav */}
        <div className="clb-nav">
          <button className="clb-nav-btn" disabled={idx === 0} onClick={() => setIdx(i => i - 1)}>‹ Prev</button>
          {/* Script line */}
          <div className="clb-script">&ldquo;{cur?.clip?.scriptLine}&rdquo;</div>
          <button className="clb-nav-btn" disabled={idx === total - 1} onClick={() => setIdx(i => i + 1)}>Next ›</button>
        </div>

        {/* Filmstrip */}
        <div className="clb-filmstrip">
          {clips.map((c, i) => (
            <div key={i} className={`clb-frame ${i === idx ? 'active' : ''}`} onClick={() => setIdx(i)}>
              {c.asset?.thumbPath
                ? <img src={`/api/thumb?path=${encodeURIComponent(c.asset.thumbPath)}`} alt="" />
                : <div className="clb-frame-ph">{c.asset?.mediaType === 'video' ? '🎬' : '🖼'}</div>}
              <div className="clb-frame-role" style={{ background: ROLE_COLORS[c.clip.role] ?? '#555' }}>{c.clip.role}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Story AI Chat Panel ───────────────────────────────────────────────────────
interface ChatMsg { role: 'ai' | 'user'; text: string; }

function StoryAIChat({
  result, format, targetDurationSec, onResultUpdate,
}: {
  result: StoryBuildResponse & { assets: Asset[] };
  format: string;
  targetDurationSec: number;
  onResultUpdate: (r: StoryBuildResponse & { assets: Asset[] }) => void;
}) {
  const [msgs, setMsgs] = useState<ChatMsg[]>([
    { role: 'ai', text: `Here's your ${format.replace('-', ' ')} story! 🎬 Happy with the script? Or tell me what to change — tone, pacing, energy, specific lines, music vibe — anything.` },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs]);

  async function send() {
    const msg = input.trim();
    if (!msg || loading) return;
    setInput('');
    setMsgs(prev => [...prev, { role: 'user', text: msg }]);
    setLoading(true);
    try {
      const res = await fetch('/api/story-refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentResult: result, message: msg, format, targetDurationSec }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      onResultUpdate({ ...data.updated, assets: result.assets });
      setMsgs(prev => [...prev, { role: 'ai', text: data.aiReply ?? 'Updated!' }]);
    } catch (err) {
      setMsgs(prev => [...prev, { role: 'ai', text: `Hmm, something went wrong: ${String(err)}` }]);
    }
    setLoading(false);
  }

  return (
    <div className="story-chat-panel">
      <div className="story-chat-title">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/></svg>
        AI Director
      </div>
      <div className="story-chat-messages">
        {msgs.map((m, i) => (
          <div key={i} className={`story-chat-msg ${m.role}`}>
            {m.role === 'ai' && <div className="story-chat-avatar">✦</div>}
            <div className="story-chat-bubble">{m.text}</div>
          </div>
        ))}
        {loading && (
          <div className="story-chat-msg ai">
            <div className="story-chat-avatar">✦</div>
            <div className="story-chat-bubble story-chat-typing"><span/><span/><span/></div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <div className="story-chat-input-row">
        <input
          className="story-chat-input"
          placeholder="Make the hook punchier, change the music to lo-fi…"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
          disabled={loading}
        />
        <button className="story-chat-send" onClick={send} disabled={loading || !input.trim()}>
          <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M2 21l21-9L2 3v7l15 2-15 2v7z"/></svg>
        </button>
      </div>
    </div>
  );
}

// ── Story Builder Overlay ────────────────────────────────────────────────────
interface StoryBuilderProps { onClose: () => void; }

function StoryBuilder({ onClose }: StoryBuilderProps) {
  const [step, setStep] = useState(1);
  const [format, setFormat] = useState('instagram-reel');
  const [targetSec, setTargetSec] = useState(30);
  const [intent, setIntent] = useState('');
  const [dsModel, setDsModel] = useState('');
  const [campaign, setCampaign] = useState('');
  const [subjects, setSubjects] = useState<string[]>([]);
  const [moods, setMoods] = useState<string[]>([]);
  const [customNotes, setCustomNotes] = useState('');
  const [aiModel, setAiModel] = useState('gemini-3.1-pro-preview');
  const [videoGenModel, setVideoGenModel] = useState<'veo-003' | 'runway-gen4'>('veo-003');
  const [ttsModel, setTtsModel] = useState('gemini-2.5-flash-preview-tts');
  const [generatingRow, setGeneratingRow] = useState<number | null>(null);
  const [genError, setGenError] = useState('');

  const [isBuilding, setIsBuilding] = useState(false);
  const [result, setResult] = useState<(StoryBuildResponse & { assets: Asset[] }) | null>(null);
  const [storyboard, setStoryboard] = useState<StoryboardClip[]>([]);
  const [error, setError] = useState('');
  const [editScript, setEditScript] = useState('');
  const [dragOver2, setDragOver2] = useState<number | null>(null);
  const dragRef2 = useRef<number | null>(null);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [regenError, setRegenError] = useState('');
  // Per-row suggestion state: { rowIdx, prompt, loading }
  const [suggestRow, setSuggestRow] = useState<number | null>(null);
  const [suggestPrompt, setSuggestPrompt] = useState('');
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const [selectedStyle, setSelectedStyle] = useState<StyleProfile | null>(null);
  const [showStyleLibrary, setShowStyleLibrary] = useState(false);

  const [drafts, setDrafts] = useState<DraftMeta[]>([]);
  const [draftName, setDraftName] = useState('');
  const [savingDraft, setSavingDraft] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');
  const [showDrafts, setShowDrafts] = useState(false);

  const SUBJECTS_BUILD = ['hands', 'piano-keys', 'piano-full', 'talking-head', 'lifestyle', 'product'];

  useEffect(() => { fetchDrafts(); }, []);

  async function fetchDrafts() {
    try {
      const res = await fetch('/api/drafts');
      const data = await res.json();
      setDrafts(data.drafts ?? []);
    } catch {}
  }

  async function handleBuild() {
    setIsBuilding(true); setError(''); setResult(null);
    const body: StoryBuildRequest = { intent, format: format as StoryBuildRequest['format'], targetDurationSec: targetSec, dsModel: dsModel || undefined, campaign: campaign || undefined, subjects, moods, customNotes, styleProfileId: selectedStyle?.id, aiModel };
    try {
      const res = await fetch('/api/story-build', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResult(data); setEditScript(data.fullScript ?? '');
      setStoryboard(data.storyboard ?? []);
      setStep(2);
      setDraftName(`${FORMATS.find(f => f.id === format)?.label ?? 'Reel'} — ${new Date().toLocaleDateString()}`);
    } catch (err) { setError(String(err)); }
    setIsBuilding(false);
  }

  async function handleSaveDraft() {
    if (!result || !draftName.trim()) return;
    setSavingDraft(true);
    try {
      const res = await fetch('/api/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: draftName, data: { brief: { format, targetSec, intent, dsModel, campaign, subjects, moods, customNotes }, storyboard, result } }),
      });
      if (res.ok) { setSavedMsg('Saved!'); setTimeout(() => setSavedMsg(''), 2000); fetchDrafts(); }
    } catch {}
    setSavingDraft(false);
  }

  async function handleLoadDraft(id: string) {
    try {
      const res = await fetch(`/api/drafts?id=${id}`);
      const data = await res.json();
      const { brief, storyboard: sb, result: r } = data.data;
      setFormat(brief.format); setTargetSec(brief.targetSec); setIntent(brief.intent);
      setDsModel(brief.dsModel ?? ''); setCampaign(brief.campaign ?? '');
      setSubjects(brief.subjects ?? []); setMoods(brief.moods ?? []); setCustomNotes(brief.customNotes ?? '');
      setResult(r); setStoryboard(sb); setStep(2); setShowDrafts(false);
    } catch {}
  }

  async function handleDeleteDraft(id: string) {
    await fetch(`/api/drafts?id=${id}`, { method: 'DELETE' });
    fetchDrafts();
  }

  function toggleSubj(s: string) { setSubjects(p => p.includes(s) ? p.filter(x => x !== s) : [...p, s]); }
  function toggleMood(m: string) { setMoods(p => p.includes(m) ? p.filter(x => x !== m) : [...p, m]); }

  const selectedAsset = (id: string) => result?.assets?.find(a => a.id === id);

  return (
    <div className="story-overlay" onClick={e => { if ((e.target as HTMLElement).classList.contains('story-overlay')) onClose(); }}>
      {/* Clip lightbox */}
      {showStyleLibrary && (
        <StyleLibraryPanel
          onClose={() => setShowStyleLibrary(false)}
          onSelect={p => { setSelectedStyle(p); setShowStyleLibrary(false); }}
        />
      )}
      {lightboxIdx !== null && result && (
        <ClipLightbox
          clips={storyboard.map(clip => ({ clip, asset: selectedAsset(clip.assetId) }))}
          activeIdx={lightboxIdx}
          onClose={() => setLightboxIdx(null)}
          onDelete={i => {
            setStoryboard(prev => prev.filter((_, ci) => ci !== i));
            if (i >= storyboard.length - 1) setLightboxIdx(j => j !== null ? Math.max(0, j - 1) : null);
          }}
          onMove={(from, to) => {
            setStoryboard(prev => {
              const next = [...prev];
              const [item] = next.splice(from, 1);
              next.splice(to, 0, item);
              return next;
            });
          }}
        />
      )}
      <div className="story-panel">
        {/* Header */}
        <div className="story-header">
          <div className="story-header-left">
            <span className="story-icon">🎬</span>
            <div>
              <div className="story-title">Story Builder</div>
              <div className="story-subtitle">AI-powered reel planner — clips, script, music & preview</div>
            </div>
          </div>
          <div className="story-header-right">
            <button className="story-drafts-btn" onClick={() => setShowDrafts(v => !v)}>
              📁 Drafts {drafts.length > 0 && <span className="story-draft-count">{drafts.length}</span>}
            </button>
            <button className="story-close-btn" onClick={onClose}>✕</button>
          </div>
        </div>

        {/* Drafts panel */}
        {showDrafts && (
          <div className="story-drafts-panel">
            {drafts.length === 0 ? (
              <div className="story-drafts-empty">No saved drafts yet</div>
            ) : drafts.map(d => (
              <div key={d.id} className="story-draft-row">
                <div className="story-draft-info">
                  <div className="story-draft-name">{d.name}</div>
                  <div className="story-draft-date">{new Date(d.updatedAt).toLocaleDateString()}</div>
                </div>
                <div className="story-draft-actions">
                  <button className="story-draft-load" onClick={() => handleLoadDraft(d.id)}>Load</button>
                  <button className="story-draft-del" onClick={() => handleDeleteDraft(d.id)}>✕</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Stepper */}
        <div className="story-stepper">
          {['Brief', 'Clips', 'Story', 'Music', 'Preview'].map((s, i) => (
            <button
              key={s}
              className={`story-step ${step === i + 1 ? 'active' : ''} ${result && i > 0 ? 'enabled' : i === 0 ? 'enabled' : 'disabled'}`}
              onClick={() => { if (i === 0 || result) setStep(i + 1); }}
            >
              <span className="story-step-num">{i + 1}</span>
              <span className="story-step-label">{s}</span>
            </button>
          ))}
        </div>

        {/* Step Content */}
        <div className="story-content">

          {/* ── Step 1: Brief ── */}
          {step === 1 && (
            <div className="story-step-content">
              <div className="story-section-title">What are we making?</div>

              <div className="story-field">
                <div className="story-field-label">Format</div>
                <div className="story-format-chips">
                  {FORMATS.map(f => (
                    <button key={f.id} className={`story-format-chip ${format === f.id ? 'active' : ''}`}
                      onClick={() => { setFormat(f.id); setTargetSec(f.sec); }}>
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="story-field">
                <div className="story-field-label">Target Length</div>
                <div className="story-duration-row">
                  {[15, 20, 30, 45, 60, 90].map(s => (
                    <button key={s} className={`story-dur-chip ${targetSec === s ? 'active' : ''}`} onClick={() => setTargetSec(s)}>{s}s</button>
                  ))}
                </div>
              </div>

              <div className="story-field">
                <div className="story-field-label">Intent / Goal</div>
                <textarea className="story-intent-input" placeholder="e.g. Showcase the DS6.0 for small-handed pianists, drive link in bio clicks, emotional hook using La Campanella performance…" value={intent} onChange={e => setIntent(e.target.value)} rows={3} />
              </div>

              <div className="story-two-col">
                <div className="story-field">
                  <div className="story-field-label">DS Model Focus</div>
                  <div className="story-chip-row">
                    {['', 'DS5.5', 'DS6.0', 'DS6.5'].map(m => (
                      <button key={m} className={`story-chip ${dsModel === m ? 'active' : ''}`} onClick={() => setDsModel(m)}>{m || 'Any'}</button>
                    ))}
                  </div>
                </div>
                <div className="story-field">
                  <div className="story-field-label">Campaign</div>
                  <div className="story-chip-row">
                    {['', 'CEO Spotlight', 'Piano Comparison', 'La Campanella', 'NAMM', 'Handspan Measurement'].map(c => (
                      <button key={c} className={`story-chip ${campaign === c ? 'active' : ''}`} onClick={() => setCampaign(c)}>{c || 'Any'}</button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="story-two-col">
                <div className="story-field">
                  <div className="story-field-label">Include Subjects</div>
                  <div className="story-chip-row wrap">
                    {SUBJECTS_BUILD.map(s => (
                      <button key={s} className={`story-chip ${subjects.includes(s) ? 'active' : ''}`} onClick={() => toggleSubj(s)}>{s}</button>
                    ))}
                  </div>
                </div>
                <div className="story-field">
                  <div className="story-field-label">Mood Direction</div>
                  <div className="story-chip-row wrap">
                    {MOOD_PRESETS.map(m => (
                      <button key={m.id} className={`story-chip ${moods.includes(m.id) ? 'active' : ''}`} onClick={() => toggleMood(m.id)}>{m.label}</button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="story-field">
                <div className="story-field-label">Additional Notes</div>
                <textarea className="story-intent-input" placeholder="Anything else for the AI director…" value={customNotes} onChange={e => setCustomNotes(e.target.value)} rows={2} />
              </div>

              {/* Reference Style */}
              <div className="story-field">
                <div className="story-field-label">Reference Style <span style={{ fontWeight: 400, opacity: 0.5 }}>(optional)</span></div>
                {selectedStyle ? (
                  <div className="sl-selected-card">
                    <div className="sl-selected-info">
                      <span className="sl-selected-name">{selectedStyle.name}</span>
                      {selectedStyle.analysis && (
                        <span className="sl-selected-meta">{selectedStyle.analysis.pacing} · {selectedStyle.analysis.toneEnergy}</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="sl-change-btn" onClick={() => setShowStyleLibrary(true)}>Change</button>
                      <button className="sl-clear-btn" onClick={() => setSelectedStyle(null)}>✕</button>
                    </div>
                  </div>
                ) : (
                  <button className="sl-browse-btn" onClick={() => setShowStyleLibrary(true)}>
                    🎞 Browse Style Library
                  </button>
                )}
              </div>

              {/* AI Model selector */}
              <div className="story-field">
                <div className="story-field-label">AI Models</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {/* Script generation */}
                  <div>
                    <div className="model-section-label">Script Generation</div>
                    <div className="story-chip-row">
                      {[
                        { id: 'gemini-3.1-pro-preview',        label: '🌟 Gemini 3.1 Pro',   desc: 'Newest · Best quality' },
                        { id: 'gemini-3.1-flash-lite-preview',  label: '⚡ Gemini 3.1 Flash', desc: 'New · Fast' },
                        { id: 'gemini-3-pro-preview',           label: '🧠 Gemini 3 Pro',     desc: 'High quality' },
                        { id: 'gemini-2.5-pro',                 label: '💎 2.5 Pro',           desc: 'Stable · Reliable' },
                        { id: 'gemini-2.5-flash',               label: '🔵 2.5 Flash',         desc: 'Default · Balanced' },
                        { id: 'gemini-2.5-flash-lite',          label: '💨 2.5 Lite',          desc: 'Fastest' },
                      ].map(m => (
                        <button key={m.id} className={`story-chip model-chip ${aiModel === m.id ? 'active' : ''}`}
                          onClick={() => setAiModel(m.id)} title={m.desc}>
                          {m.label}
                          {aiModel === m.id && <span className="model-chip-desc">{m.desc}</span>}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Video generation */}
                  <div>
                    <div className="model-section-label">Video Generation — for generating new clips</div>
                    <div className="story-chip-row">
                      {[
                        { id: 'veo-003',       label: '🎞 Veo 3',        desc: 'Google · Same API key · Best quality' },
                        { id: 'runway-gen4',   label: '✈️ Runway Gen-4', desc: 'Requires RUNWAY_API_KEY' },
                      ].map(m => (
                        <button key={m.id} className={`story-chip model-chip video-model ${videoGenModel === m.id ? 'active' : ''}`}
                          onClick={() => setVideoGenModel(m.id as 'veo-003' | 'runway-gen4')} title={m.desc}>
                          {m.label}
                          {videoGenModel === m.id && <span className="model-chip-desc">{m.desc}</span>}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Voiceover TTS */}
                  <div>
                    <div className="model-section-label">Voiceover / TTS <span style={{opacity:0.5}}>(Gemini 3.1 TTS not yet available — 2.5 TTS used)</span></div>
                    <div className="story-chip-row">
                      {[
                        { id: 'gemini-2.5-flash-preview-tts', label: '🎙 Flash TTS', desc: 'Fast voiceover · Low latency' },
                        { id: 'gemini-2.5-pro-preview-tts',   label: '🔊 Pro TTS',   desc: 'Highest quality voice' },
                      ].map(m => (
                        <button key={m.id} className={`story-chip model-chip tts-model ${ttsModel === m.id ? 'active' : ''}`}
                          onClick={() => setTtsModel(m.id)} title={m.desc}>
                          {m.label}
                          {ttsModel === m.id && <span className="model-chip-desc">{m.desc}</span>}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {error && <div className="prompt-error">⚠ {error}</div>}

              <button className="story-build-btn" onClick={handleBuild} disabled={isBuilding || !intent.trim()}>
                {isBuilding ? <><span className="prompt-spinner" /> Analyzing library & building story…</> : '🎬 Generate Story'}
              </button>
              {isBuilding && (
                <div className="story-building-status">
                  <div className="shimmer-bar w90" /><div className="shimmer-bar w70" /><div className="shimmer-bar w80" />
                  <div className="story-building-label">Gemini is selecting your best clips and scripting the reel…</div>
                </div>
              )}
            </div>
          )}

          {/* ── Step 2+3: Split Editor (Clips left | Script right) ── */}
          {(step === 2 || step === 3) && result && (() => {
            function moveRow(from: number, to: number) {
              if (from === to) return;
              const next = [...storyboard];
              const [item] = next.splice(from, 1);
              next.splice(to, 0, item);
              setStoryboard(next);
            }
            function updateClip(i: number, patch: Partial<StoryboardClip>) {
              setStoryboard(prev => prev.map((c, ci) => ci === i ? { ...c, ...patch } : c));
            }
            async function regenerateScript() {
              setIsRegenerating(true); setRegenError('');
              try {
                const msg = 'The user has reordered and edited the storyboard clips. Please rewrite fullScript, voiceoverLines, hookLine, callToAction, and textOverlayPlan to match the new clip order and any edited script lines.';
                const res = await fetch('/api/story-refine', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ currentResult: { ...result, storyboard }, message: msg, format, targetDurationSec: targetSec }),
                });
                const data = await res.json();
                if (data.error) throw new Error(data.error);
                setResult(prev => prev ? { ...prev, ...data.updated } : prev);
                setEditScript(data.updated?.fullScript ?? '');
                setStoryboard(data.updated?.storyboard ?? storyboard);
              } catch (e) {
                setRegenError(String(e));
              }
              setIsRegenerating(false);
            }
            async function suggestLine(i: number) {
              if (!suggestPrompt.trim() || suggestLoading) return;
              setSuggestLoading(true);
              try {
                const res = await fetch('/api/story-suggest-line', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    clip: storyboard[i],
                    instruction: suggestPrompt,
                    contextScript: result?.fullScript ?? '',
                    format,
                  }),
                });
                const data = await res.json();
                if (data.error) throw new Error(data.error);
                updateClip(i, { scriptLine: data.scriptLine ?? storyboard[i].scriptLine, overlayText: data.overlayText ?? storyboard[i].overlayText });
                setSuggestRow(null); setSuggestPrompt('');
              } catch { /* silently fail */ }
              setSuggestLoading(false);
            }
            async function generateClip(i: number) {
              if (generatingRow !== null) return;
              setGeneratingRow(i); setGenError('');
              try {
                const clip = storyboard[i];
                const res = await fetch('/api/video-generate', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    model: videoGenModel,
                    prompt: clip.scriptLine || clip.overlayText || `${clip.role} shot for DreamPlay Pianos`,
                    clipRole: clip.role,
                    aspectRatio: (format === 'instagram-reel' || format === 'tiktok' || format === 'youtube-short') ? '9:16' : '16:9',
                    durationSeconds: Math.round(clip.suggestedEndSec - clip.suggestedStartSec) || 6,
                  }),
                });
                const data = await res.json();
                if (data.error) throw new Error(data.error);
                // Show success — user can re-ingest or use the file path
                setGenError(`✓ Generated: ${data.files?.[0]?.split('/').pop() ?? 'clip saved'}`);
              } catch (e) {
                setGenError(String(e));
              }
              setGeneratingRow(null);
            }

            return (
              <div className="split-editor-shell">
                <div className="split-editor-toolbar">
                  <div className="split-editor-title">
                    <span className="split-col-head">Clips</span>
                    <span className="split-col-head">Script · Overlay</span>
                  </div>
                  <div style={{display:'flex',gap:8,alignItems:'center'}}>
                    {genError && <span className={`split-gen-status ${genError.startsWith('✓') ? 'ok' : 'err'}`}>{genError}</span>}
                    <span className="split-vgen-label">Video: <strong>{videoGenModel}</strong></span>
                    {regenError && <span style={{fontSize:10,color:'var(--red)',maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{regenError}</span>}
                    <button className={`split-regen-btn ${isRegenerating ? 'loading' : ''}`} onClick={regenerateScript} disabled={isRegenerating}>
                      {isRegenerating ? '⏳ Regenerating…' : '↻ Regenerate Script'}
                    </button>
                  </div>
                </div>
                <div className="split-editor-rows">
                  {storyboard.map((clip, i) => {
                    const asset = selectedAsset(clip.assetId);
                    return (
                      <div
                        key={clip.assetId + i}
                        className={`split-row ${dragOver2 === i ? 'drag-over2' : ''}`}
                        draggable
                        onDragStart={() => { dragRef2.current = i; }}
                        onDragOver={e => { e.preventDefault(); setDragOver2(i); }}
                        onDragLeave={() => setDragOver2(null)}
                        onDrop={e => { e.preventDefault(); setDragOver2(null); if (dragRef2.current !== null) moveRow(dragRef2.current, i); dragRef2.current = null; }}
                        onDragEnd={() => { dragRef2.current = null; setDragOver2(null); }}
                      >
                        {/* Left: clip info */}
                        <div className="split-clip-col">
                          <div className="split-grip">⠿</div>
                          <div className="split-num">{i + 1}</div>
                          <div className="split-thumb" onClick={() => setLightboxIdx(i)} style={{cursor:'pointer'}} title="Click to preview">
                            {asset?.thumbPath
                              ? <img src={thumbUrl(asset)} alt="" className="split-thumb-img" />
                              : <div className="split-thumb-ph">{asset?.mediaType === 'video' ? '🎬' : '🖼'}</div>}
                            <div className="split-thumb-play">{asset?.mediaType === 'video' ? '▶' : '⤢'}</div>
                          </div>
                          <div className="split-clip-details">
                            <div className="split-filename">{asset?.fileName ?? clip.assetId}</div>
                            <div className="split-clip-meta">
                              <select className="split-select" value={clip.role} onChange={e => updateClip(i, { role: e.target.value as StoryboardClip['role'] })}>
                                {['hook','proof','demo','emotion','cta'].map(r => <option key={r} value={r}>{r}</option>)}
                              </select>
                              <input className="split-time-input" type="number" min={0} step={0.5} value={clip.suggestedStartSec}
                                onChange={e => updateClip(i, { suggestedStartSec: parseFloat(e.target.value) })} />
                              <span className="split-dash">–</span>
                              <input className="split-time-input" type="number" min={0} step={0.5} value={clip.suggestedEndSec}
                                onChange={e => updateClip(i, { suggestedEndSec: parseFloat(e.target.value) })} />
                              <span className="split-dur">({clip.suggestedEndSec - clip.suggestedStartSec}s)</span>
                            </div>
                            {/* Generate with video AI */}
                            <button
                              className={`split-gen-clip-btn ${generatingRow === i ? 'loading' : ''}`}
                              title={`Generate new clip with ${videoGenModel}`}
                              disabled={generatingRow !== null}
                              onClick={() => generateClip(i)}
                            >
                              {generatingRow === i ? '⏳ Generating…' : `🎥 Generate`}
                            </button>
                          </div>
                        </div>

                        {/* Right: script + overlay editable + suggest button */}
                        <div className="split-script-col">
                          <div className="split-script-header">
                            <textarea
                              className="split-script-ta"
                              value={clip.scriptLine}
                              onChange={e => updateClip(i, { scriptLine: e.target.value })}
                              placeholder="Voiceover line…"
                              rows={2}
                            />
                            <button
                              className={`split-suggest-btn ${suggestRow === i ? 'active' : ''}`}
                              title="AI suggestion for this block"
                              onClick={() => { setSuggestRow(suggestRow === i ? null : i); setSuggestPrompt(''); }}
                            >✦</button>
                          </div>
                          {/* Inline suggest prompt for this row */}
                          {suggestRow === i && (
                            <div className="split-suggest-row">
                              <input
                                className="split-suggest-input"
                                autoFocus
                                placeholder="e.g. more personal pain story, casual tone, shorter…"
                                value={suggestPrompt}
                                onChange={e => setSuggestPrompt(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && suggestLine(i)}
                                disabled={suggestLoading}
                              />
                              <button className="split-suggest-apply" onClick={() => suggestLine(i)} disabled={suggestLoading || !suggestPrompt.trim()}>
                                {suggestLoading ? '…' : 'Apply'}
                              </button>
                            </div>
                          )}
                          <div className="split-overlay-row">
                            <input className="split-overlay-input" value={clip.overlayText ?? ''} onChange={e => updateClip(i, { overlayText: e.target.value })} placeholder="On-screen text…" />
                            <select className="split-select sm" value={clip.overlayPlacement} onChange={e => updateClip(i, { overlayPlacement: e.target.value as StoryboardClip['overlayPlacement'] })}>
                              {['top','center','bottom'].map(p => <option key={p} value={p}>{p}</option>)}
                            </select>
                            <select className="split-select sm" value={clip.overlayStyle} onChange={e => updateClip(i, { overlayStyle: e.target.value as StoryboardClip['overlayStyle'] })}>
                              {['headline','caption','stat','none'].map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {/* AI Chat always visible on right of steps 2+3 */}
                <StoryAIChat
                  result={result}
                  format={format}
                  targetDurationSec={targetSec}
                  onResultUpdate={r => { setResult(r); setEditScript(r.fullScript ?? ''); setStoryboard(r.storyboard ?? storyboard); }}
                />
              </div>
            );
          })()}

          {/* ── Step 4: Music (with AI chat) ── */}
          {step === 4 && result?.musicSuggestion && (

            <div className="story-step-content">
              <div className="story-section-title">Music Direction</div>
              {(() => {
                const m: MusicSuggestion = result.musicSuggestion;
                return (
                  <>
                    <div className="music-meta-row">
                      <div className="music-meta-card">
                        <div className="music-meta-label">Mood</div>
                        <div className="music-meta-val">{m.mood}</div>
                      </div>
                      <div className="music-meta-card">
                        <div className="music-meta-label">BPM Range</div>
                        <div className="music-meta-val">{m.bpmRange}</div>
                      </div>
                      <div className="music-meta-card">
                        <div className="music-meta-label">Energy</div>
                        <div className={`music-meta-val energy-${m.energy}`}>{m.energy.toUpperCase()}</div>
                      </div>
                    </div>
                    <div className="music-genres">
                      {m.genres?.map((g, i) => <span key={i} className="music-genre-chip">{g}</span>)}
                    </div>
                    <div className="story-script-label" style={{ marginTop: 20 }}>Trending Song Suggestions</div>
                    <div className="music-songs-list">
                      {m.trendingSongs?.map((s, i) => (
                        <div key={i} className="music-song-card">
                          <div className="music-song-top">
                            <span className="music-song-num">{i + 1}</span>
                            <span className="music-song-title">{s.title}</span>
                            <span className="music-song-artist">— {s.artist}</span>
                            <a href={`https://open.spotify.com/search/${encodeURIComponent(s.title + ' ' + s.artist)}`} target="_blank" rel="noreferrer" className="music-spotify-link">Spotify ↗</a>
                          </div>
                          <div className="music-song-why">{s.why}</div>
                        </div>
                      ))}
                    </div>
                    {m.productionNotes && (
                      <div className="story-director-notes" style={{ marginTop: 16 }}>
                        <span className="story-director-label">🎚 Production Notes</span>
                        <span className="story-director-text">{m.productionNotes}</span>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          )}

          {/* \u2500\u2500 Step 5: Preview \u2500\u2500 */}
          {step === 5 && result && (() => {
            const videoClips = storyboard
              .map(clip => ({ clip, asset: selectedAsset(clip.assetId) }))
              .filter(({ asset }) => asset?.mediaType === 'video' && asset?.filePath);
            return (
              <div className="story-step-content">
                <div className="story-section-title">Reel Preview
                  <span className="story-section-sub"> — {videoClips.length} clips · plays in sequence</span>
                </div>

                {/* Sequential video player */}
                {videoClips.length > 0
                  ? <SequentialPlayer clips={videoClips} musicQuery={result.musicSuggestion ? `${result.musicSuggestion.trendingSongs?.[0]?.title ?? ''} ${result.musicSuggestion.trendingSongs?.[0]?.artist ?? ''}`.trim() || result.musicSuggestion.mood : undefined} />
                  : (
                    <div className="preview-no-video">
                      <span>No video clips selected — add video assets in Step 2 to preview.</span>
                    </div>
                  )
                }

                {/* Full script preview — editable */}
                <div className="story-preview-script">
                  <div className="story-script-label">📝 Full Script <span style={{opacity:0.5,fontWeight:400}}>· click to edit</span></div>
                  <textarea
                    className="story-script-ta"
                    value={editScript}
                    onChange={e => setEditScript(e.target.value)}
                    rows={6}
                  />
                </div>

                {/* Music quick-ref */}
                {result.musicSuggestion && (
                  <div className="story-preview-music">
                    <span className="story-preview-music-label">🎵 Music</span>
                    <span>{result.musicSuggestion.mood} · {result.musicSuggestion.bpmRange} BPM · {result.musicSuggestion.energy} energy</span>
                    {result.musicSuggestion.trendingSongs?.[0] && (
                      <span className="story-preview-song">Try: &quot;{result.musicSuggestion.trendingSongs[0].title}&quot; — {result.musicSuggestion.trendingSongs[0].artist}</span>
                    )}
                  </div>
                )}

                {/* Save draft */}
                <div className="story-save-row">
                  <input className="story-draft-name-input" placeholder="Draft name…" value={draftName} onChange={e => setDraftName(e.target.value)} />
                  <button className="story-save-btn" onClick={handleSaveDraft} disabled={savingDraft || !draftName.trim()}>
                    {savingDraft ? 'Saving…' : savedMsg || '💾 Save Draft'}
                  </button>
                </div>
              </div>
            );
          })()}
        </div>

        {/* Footer nav */}
        {result && (
          <div className="story-footer">
            <button className="story-nav-btn" onClick={() => setStep(s => Math.max(1, s - 1))} disabled={step === 1}>← Back</button>
            <div className="story-footer-center">
              <input className="story-draft-name-input small" placeholder="Draft name…" value={draftName} onChange={e => setDraftName(e.target.value)} />
              <button className="story-save-btn small" onClick={handleSaveDraft} disabled={savingDraft || !draftName.trim()}>
                {savedMsg || '💾 Save'}
              </button>
            </div>
            <button className="story-nav-btn next" onClick={() => setStep(s => Math.min(5, s + 1))} disabled={step === 5}>Next →</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Reel Generator ──────────────────────────────────────────────────────────
const REEL_FORMATS = [
  { id: 'instagram-reel', label: '📱 Instagram Reel', sec: 30 },
  { id: 'tiktok', label: '🎵 TikTok', sec: 30 },
  { id: 'youtube-short', label: '▶️ YouTube Short', sec: 45 },
  { id: 'facebook-ad', label: '📢 Facebook Ad', sec: 20 },
  { id: 'custom', label: '🎬 Custom', sec: 60 },
];
const VOICE_PRESETS = [
  { id: 'Kore', label: 'Kore', tone: 'narrator', desc: 'Professional · Clear' },
  { id: 'Charon', label: 'Charon', tone: 'narrator', desc: 'Deep · Authoritative' },
  { id: 'Aoede', label: 'Aoede', tone: 'conversational', desc: 'Warm · Friendly' },
  { id: 'Puck', label: 'Puck', tone: 'energetic', desc: 'Energetic · Playful' },
  { id: 'Fenrir', label: 'Fenrir', tone: 'luxury', desc: 'Smooth · Premium' },
];
const REEL_TONES = [
  { id: 'narrator', label: '🎙 Narrator' },
  { id: 'conversational', label: '💬 Conversational' },
  { id: 'energetic', label: '⚡ Energetic' },
  { id: 'luxury', label: '✦ Luxury' },
];

interface Avatar { fileName: string; filePath: string; url: string; uploadedAt: number; }

function ReelGenerator({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(1);
  // Step 1 — Script
  const [format, setFormat] = useState('instagram-reel');
  const [targetSec, setTargetSec] = useState(30);
  const [topic, setTopic] = useState('');
  const [script, setScript] = useState('');
  const [writingScript, setWritingScript] = useState(false);
  const [scriptError, setScriptError] = useState('');
  const [tone, setTone] = useState('narrator');
  // Step 2 — Voice
  const [ttsModel, setTtsModel] = useState('gemini-2.5-flash-preview-tts');
  const [voiceName, setVoiceName] = useState('Kore');
  const [generatingAudio, setGeneratingAudio] = useState(false);
  const [audioFileName, setAudioFileName] = useState('');
  const [audioPath, setAudioPath] = useState('');
  const [audioError, setAudioError] = useState('');
  // Step 3 — Reel
  const [avatars, setAvatars] = useState<Avatar[]>([]);
  const [selectedAvatar, setSelectedAvatar] = useState<Avatar | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarDragOver, setAvatarDragOver] = useState(false);
  const avatarFileRef = useRef<HTMLInputElement>(null);
  const [generatingReel, setGeneratingReel] = useState(false);
  const [reelUrl, setReelUrl] = useState('');
  const [reelFileName, setReelFileName] = useState('');
  const [reelError, setReelError] = useState('');
  const [pollMsg, setPollMsg] = useState('');

  useEffect(() => { fetchAvatars(); }, []);

  async function fetchAvatars() {
    try {
      const res = await fetch('/api/reel/avatars');
      const data = await res.json();
      setAvatars(data.avatars ?? []);
    } catch { /* ignore */ }
  }

  async function handleWriteScript() {
    if (!topic.trim()) return;
    setWritingScript(true); setScriptError('');
    try {
      const res = await fetch('/api/reel/script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, format, targetDurationSec: targetSec, tone }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setScript(data.script);
    } catch (e) { setScriptError(String(e)); }
    setWritingScript(false);
  }

  async function handleGenerateAudio() {
    if (!script.trim()) return;
    setGeneratingAudio(true); setAudioError(''); setAudioFileName(''); setAudioPath('');
    try {
      const res = await fetch('/api/reel/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script, voiceName, model: ttsModel, style: tone }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setAudioFileName(data.fileName);
      setAudioPath(data.audioPath);
    } catch (e) { setAudioError(String(e)); }
    setGeneratingAudio(false);
  }

  async function handleUploadAvatar(file: File) {
    setUploadingAvatar(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/reel/avatars', { method: 'POST', body: fd });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      await fetchAvatars();
      // Auto-select newly uploaded avatar
      setSelectedAvatar({ fileName: data.fileName, filePath: data.filePath, url: data.url, uploadedAt: Date.now() });
    } catch { /* ignore */ }
    setUploadingAvatar(false);
  }

  async function handleGenerateReel() {
    if (!audioPath || !selectedAvatar) return;
    setGeneratingReel(true); setReelError(''); setReelUrl(''); setReelFileName('');
    setPollMsg('Sending to Veo for talking head generation… (~2-5 min)');
    try {
      const res = await fetch('/api/reel/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          script,
          audioPath,
          avatarImagePath: selectedAvatar.filePath,
          aspectRatio: (format === 'instagram-reel' || format === 'tiktok' || format === 'youtube-short') ? '9:16' : '16:9',
          durationSeconds: Math.min(targetSec, 30),
        }),
      });
      setPollMsg('Merging voiceover audio...');
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setReelUrl(data.previewUrl);
      setReelFileName(data.outputFileName);
      setPollMsg('');
    } catch (e) { setReelError(String(e)); setPollMsg(''); }
    setGeneratingReel(false);
  }

  const canProceedToVoice = script.trim().length > 10;
  const canProceedToReel = audioPath && selectedAvatar;

  return (
    <div className="story-overlay" onClick={e => { if ((e.target as HTMLElement).classList.contains('story-overlay')) onClose(); }}>
      <div className="story-panel reel-gen-panel">
        {/* Header */}
        <div className="story-header">
          <div className="story-header-left">
            <span className="story-icon">🎙</span>
            <div>
              <div className="story-title">Reel Generator</div>
              <div className="story-subtitle">AI script → Gemini voiceover → Veo talking head → 9:16 reel</div>
            </div>
          </div>
          <button className="story-close-btn" onClick={onClose}>✕</button>
        </div>

        {/* Stepper */}
        <div className="story-stepper">
          {['Script', 'Voice', 'Generate'].map((s, i) => (
            <button
              key={s}
              className={`story-step ${step === i + 1 ? 'active' : ''} ${i === 0 || (i === 1 && canProceedToVoice) || (i === 2 && canProceedToReel) ? 'enabled' : 'disabled'}`}
              onClick={() => {
                if (i === 0) setStep(1);
                else if (i === 1 && canProceedToVoice) setStep(2);
                else if (i === 2 && canProceedToReel) setStep(3);
              }}
            >
              <span className="story-step-num">{i + 1}</span>
              <span className="story-step-label">{s}</span>
            </button>
          ))}
        </div>

        <div className="story-content">

          {/* ── Step 1: Script ── */}
          {step === 1 && (
            <div className="story-step-content">
              <div className="story-section-title">Write Your Script</div>

              <div className="story-field">
                <div className="story-field-label">Format</div>
                <div className="story-format-chips">
                  {REEL_FORMATS.map(f => (
                    <button key={f.id} className={`story-format-chip ${format === f.id ? 'active' : ''}`}
                      onClick={() => { setFormat(f.id); setTargetSec(f.sec); }}>
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="story-field">
                <div className="story-field-label">Target Length</div>
                <div className="story-duration-row">
                  {[15, 20, 30, 45, 60].map(s => (
                    <button key={s} className={`story-dur-chip ${targetSec === s ? 'active' : ''}`} onClick={() => setTargetSec(s)}>{s}s</button>
                  ))}
                </div>
              </div>

              <div className="story-field">
                <div className="story-field-label">Tone / Style</div>
                <div className="story-chip-row">
                  {REEL_TONES.map(t => (
                    <button key={t.id} className={`story-chip ${tone === t.id ? 'active' : ''}`} onClick={() => setTone(t.id)}>{t.label}</button>
                  ))}
                </div>
              </div>

              <div className="story-field">
                <div className="story-field-label">Topic / Intent <span style={{ fontWeight: 400, opacity: 0.5 }}>(for AI writer)</span></div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    className="rg-topic-input"
                    placeholder="e.g. Why small-handed pianists love the DS 6.0…"
                    value={topic}
                    onChange={e => setTopic(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleWriteScript()}
                  />
                  <button className="rg-ai-write-btn" onClick={handleWriteScript} disabled={writingScript || !topic.trim()}>
                    {writingScript ? <><span className="prompt-spinner" />Writing…</> : '✨ AI Write'}
                  </button>
                </div>
                {scriptError && <div className="prompt-error">⚠ {scriptError}</div>}
              </div>

              <div className="story-field">
                <div className="story-field-label">Script <span style={{ fontWeight: 400, opacity: 0.5 }}>· edit freely</span></div>
                <textarea
                  className="rg-script-ta"
                  placeholder="Write or paste your script here, or use AI Write above…"
                  value={script}
                  onChange={e => setScript(e.target.value)}
                  rows={8}
                />
                {script && (
                  <div className="rg-word-count">~{script.split(/\s+/).filter(Boolean).length} words · ~{Math.round(script.split(/\s+/).filter(Boolean).length / 2.5)}s spoken</div>
                )}
              </div>

              <button className="story-build-btn" disabled={!canProceedToVoice} onClick={() => setStep(2)}>
                Next: Generate Voiceover →
              </button>
            </div>
          )}

          {/* ── Step 2: Voice ── */}
          {step === 2 && (
            <div className="story-step-content">
              <div className="story-section-title">Generate Voiceover</div>

              <div className="story-field">
                <div className="story-field-label">TTS Model</div>
                <div className="story-chip-row">
                  {[
                    { id: 'gemini-2.5-flash-preview-tts', label: '⚡ Flash TTS', desc: 'Fast · Low latency' },
                    { id: 'gemini-2.5-pro-preview-tts', label: '🔊 Pro TTS', desc: 'Highest quality' },
                  ].map(m => (
                    <button key={m.id} className={`story-chip model-chip ${ttsModel === m.id ? 'active' : ''}`}
                      onClick={() => setTtsModel(m.id)} title={m.desc}>
                      {m.label}
                      {ttsModel === m.id && <span className="model-chip-desc">{m.desc}</span>}
                    </button>
                  ))}
                </div>
              </div>

              <div className="story-field">
                <div className="story-field-label">Voice</div>
                <div className="rg-voice-grid">
                  {VOICE_PRESETS.map(v => (
                    <button key={v.id} className={`rg-voice-card ${voiceName === v.id ? 'active' : ''}`} onClick={() => setVoiceName(v.id)}>
                      <div className="rg-voice-name">{v.label}</div>
                      <div className="rg-voice-desc">{v.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="story-field">
                <div className="story-field-label">Script Preview</div>
                <div className="rg-script-preview">{script}</div>
              </div>

              <button className="story-build-btn" onClick={handleGenerateAudio} disabled={generatingAudio || !script.trim()}>
                {generatingAudio ? <><span className="prompt-spinner" />Generating voiceover…</> : '🎙 Generate Voiceover'}
              </button>

              {audioError && <div className="prompt-error" style={{ marginTop: 12 }}>⚠ {audioError}</div>}

              {audioFileName && !generatingAudio && (
                <div className="rg-audio-result">
                  <div className="rg-audio-label">✓ Voiceover ready — preview below</div>
                  <audio
                    key={audioFileName}
                    src={`/api/reel/output?name=${encodeURIComponent(audioFileName)}&type=audio`}
                    controls
                    className="rg-audio-player"
                  />
                  <button className="story-build-btn" style={{ marginTop: 12 }} onClick={() => setStep(3)}>
                    Next: Create Talking Head Reel →
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Step 3: Generate Reel ── */}
          {step === 3 && (
            <div className="story-step-content">
              <div className="story-section-title">Create Talking Head Reel</div>

              <div className="story-field">
                <div className="story-field-label">Avatar / Speaker Photo <span style={{ fontWeight: 400, opacity: 0.5 }}>· your talking head image</span></div>
                <div
                  className={`rg-avatar-drop ${avatarDragOver ? 'drag-over' : ''}`}
                  onClick={() => avatarFileRef.current?.click()}
                  onDragOver={e => { e.preventDefault(); setAvatarDragOver(true); }}
                  onDragLeave={() => setAvatarDragOver(false)}
                  onDrop={e => {
                    e.preventDefault(); setAvatarDragOver(false);
                    const f = e.dataTransfer.files[0];
                    if (f) handleUploadAvatar(f);
                  }}
                >
                  {uploadingAvatar
                    ? <span className="prompt-spinner" />
                    : <><span className="rg-avatar-drop-icon">📸</span><span>Drop photo or click to upload</span></>}
                  <input ref={avatarFileRef} type="file" accept="image/*" style={{ display: 'none' }}
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadAvatar(f); }} />
                </div>

                {avatars.length > 0 && (
                  <div className="rg-avatar-grid">
                    {avatars.map(av => (
                      <div
                        key={av.fileName}
                        className={`rg-avatar-thumb ${selectedAvatar?.fileName === av.fileName ? 'selected' : ''}`}
                        onClick={() => setSelectedAvatar(av)}
                      >
                        <img src={av.url} alt={av.fileName} />
                        {selectedAvatar?.fileName === av.fileName && <div className="rg-avatar-check">✓</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {audioFileName && (
                <div className="story-field">
                  <div className="story-field-label">Voiceover</div>
                  <audio
                    src={`/api/reel/output?name=${encodeURIComponent(audioFileName)}&type=audio`}
                    controls className="rg-audio-player"
                  />
                </div>
              )}

              <div className="rg-generate-info">
                <span>🎞 Veo will animate your avatar speaking the voiceover — takes ~2-5 min</span>
                {canProceedToReel && !selectedAvatar && <span className="rg-generate-warn">Select an avatar above to continue</span>}
              </div>

              <button
                className="story-build-btn"
                onClick={handleGenerateReel}
                disabled={generatingReel || !audioPath || !selectedAvatar}
              >
                {generatingReel ? <><span className="prompt-spinner" />{pollMsg || 'Generating reel…'}</> : '🎬 Generate Reel'}
              </button>

              {reelError && <div className="prompt-error" style={{ marginTop: 12 }}>⚠ {reelError}</div>}

              {reelUrl && !generatingReel && (
                <div className="rg-result">
                  <div className="rg-result-label">✓ Reel ready!</div>
                  <video src={reelUrl} controls className="rg-result-video" playsInline />
                  <a
                    className="rg-download-btn"
                    href={`/api/reel/output?name=${encodeURIComponent(reelFileName)}&dl=1`}
                    download={reelFileName}
                  >
                    ⬇ Download Reel
                  </a>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────────────
export default function MediaIndexer() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, finals: 0, highPriority: 0 });
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<Asset | null>(null);
  const [exporting, setExporting] = useState(false);
  const [copyMsg, setCopyMsg] = useState('');
  const [showStoryBuilder, setShowStoryBuilder] = useState(false);
  const [showReelGenerator, setShowReelGenerator] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(180);
  const [scanStatus, setScanStatus] = useState<{ status: 'idle' | 'scanning'; lastScan: number | null }>({ status: 'idle', lastScan: null });
  const [scanning, setScanning] = useState(false);
  const [sidebarW, setSidebarW] = useState(210);
  const isDraggingRef = useRef(false);
  const lastClickedRef = useRef<string | null>(null);

  // Draggable sidebar resizer
  function startSidebarDrag(e: React.MouseEvent) {
    e.preventDefault();
    isDraggingRef.current = true;
    const startX = e.clientX;
    const startW = sidebarW;
    function onMove(ev: MouseEvent) {
      if (!isDraggingRef.current) return;
      const next = Math.max(140, Math.min(400, startW + ev.clientX - startX));
      setSidebarW(next);
    }
    function onUp() {
      isDraggingRef.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  // Poll scan status every 10s
  useEffect(() => {
    async function pollStatus() {
      try {
        const res = await fetch('/api/ingest');
        const data = await res.json();
        setScanStatus(data);
        if (data.status === 'idle' && scanning) {
          setScanning(false);
          fetchAssets(); // refresh grid after scan completes
        }
      } catch { /* ignore */ }
    }
    pollStatus();
    const id = setInterval(pollStatus, 10_000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanning]);

  const [filters, setFilters] = useState({
    search: '', finalStatus: '', priority: '', subject: '', handZone: '',
    dsModel: '', purpose: '', campaign: '', shotType: '', colorLabel: '',
    mediaType: '', orientation: '',
  });

  const fetchAssets = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v); });
    try {
      const res = await fetch(`/api/assets?${params}`);
      const data = await res.json();
      setAssets(data.assets ?? []);
      setTotal(data.total ?? 0);
      setStats(data.stats ?? { total: 0, finals: 0, highPriority: 0 });
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [filters]);

  useEffect(() => { fetchAssets(); }, [fetchAssets]);

  // Keyboard shortcuts: Space → preview last selected, Escape → close, Cmd+0 → reset
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.code === 'Space') {
        e.preventDefault();
        const id = lastClickedRef.current;
        if (id) {
          setDetail(prev => {
            if (prev) return null;
            return assets.find(a => a.id === id) ?? null;
          });
        }
      }
      if (e.code === 'Escape') setDetail(null);
      // Cmd+0 → reset all panel sizes and zoom
      if ((e.metaKey || e.ctrlKey) && e.key === '0') {
        e.preventDefault();
        setSidebarW(210);
        setZoomLevel(180);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [assets]);

  function setFilter(key: string, value: string) {
    setFilters(prev => ({ ...prev, [key]: prev[key as keyof typeof prev] === value ? '' : value }));
  }

  function handleAssetClick(asset: Asset, e: React.MouseEvent) {
    if (e.shiftKey && lastClickedRef.current) {
      const ids = assets.map(a => a.id);
      const lastIdx = ids.indexOf(lastClickedRef.current);
      const curIdx = ids.indexOf(asset.id);
      const [start, end] = lastIdx < curIdx ? [lastIdx, curIdx] : [curIdx, lastIdx];
      setSelected(prev => { const next = new Set(prev); ids.slice(start, end + 1).forEach(id => next.add(id)); return next; });
    } else if (e.metaKey || e.ctrlKey) {
      setSelected(prev => { const next = new Set(prev); if (next.has(asset.id)) next.delete(asset.id); else next.add(asset.id); return next; });
    } else if (e.altKey) {
      setDetail(asset);
    } else {
      setSelected(prev => { const next = new Set(prev); if (next.has(asset.id)) next.delete(asset.id); else { next.clear(); next.add(asset.id); } return next; });
    }
    lastClickedRef.current = asset.id;
  }

  async function handleExport(format: 'davinci' | 'fcpxml') {
    if (!selected.size) return;
    setExporting(true);
    try {
      const res = await fetch('/api/export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: Array.from(selected), format, timelineName: 'DreamPlay Timeline' }) });
      const blob = await res.blob();
      const cd = res.headers.get('Content-Disposition') ?? '';
      const fnMatch = cd.match(/filename="(.+)"/);
      const filename = fnMatch ? fnMatch[1] : `timeline.${format === 'fcpxml' ? 'fcpxml' : 'xml'}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { console.error(e); }
    setExporting(false);
  }

  async function handleScanNow() {
    if (scanning) return;
    setScanning(true);
    await fetch('/api/ingest', { method: 'POST' });
  }

  const selectedAssets = assets.filter(a => selected.has(a.id));
  const totalSelectedDuration = selectedAssets.reduce((sum, a) => sum + (a.durationSeconds ?? 0), 0);

  const lastScanLabel = scanStatus.lastScan
    ? new Date(scanStatus.lastScan).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-left">
          <div className="logo-mark">🎹</div>
          <div>
            <div className="app-title">DreamPlay Media Indexer</div>
          </div>
        </div>
        {/* Prominent center search bar */}
        <input
          className="header-search"
          placeholder="Search assets, keywords, descriptions…"
          value={filters.search}
          onChange={e => setFilters(prev => ({ ...prev, search: e.target.value }))}
        />
        <div className="header-stats">
          <div className="stat-pill"><span className="stat-num">{stats.total.toLocaleString()}</span><span className="stat-label">Total</span></div>
          <div className="stat-pill"><span className="stat-num">{stats.finals.toLocaleString()}</span><span className="stat-label">Finals</span></div>
          <div className="stat-pill high"><span className="stat-num">{stats.highPriority.toLocaleString()}</span><span className="stat-label">Priority</span></div>
          <div className="scan-controls">
            {/* Broadcast live indicator */}
            <div className={`scan-indicator ${scanStatus.status === 'scanning' ? 'scanning' : 'idle'}`} title={scanStatus.status === 'scanning' ? 'Scanning…' : lastScanLabel ? `Last scan ${lastScanLabel}` : 'Idle'}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5.636 5.636a9 9 0 1 0 12.728 0M8.464 8.464a5 5 0 1 0 7.072 0M12 12m0 0v.01" />
              </svg>
            </div>
            {/* Refresh button — minimalist */}
            <button className="scan-refresh-btn" onClick={handleScanNow} disabled={scanning} title="Scan now">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={scanning ? 'spinning' : ''}>
                <path d="M21 12a9 9 0 0 0-9-9 9 9 0 0 0-6.36 2.64L3 8" />
                <path d="M3 3v5h5" />
                <path d="M3 12a9 9 0 0 0 9 9 9 9 0 0 0 6.36-2.64L21 16" />
                <path d="M16 16h5v5" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      <div className="app-body">
        <aside className="sidebar" style={{ width: sidebarW, minWidth: sidebarW }}>
          <div className="filter-section">
            <div className="filter-label">Quick Filters</div>
            <div className="chip-row">
              <button className={`chip ${filters.priority === 'high' ? 'active' : ''}`} onClick={() => setFilter('priority', 'high')}>⚡ Priority</button>
              <button className={`chip ${filters.finalStatus === 'final' ? 'active' : ''}`} onClick={() => setFilter('finalStatus', 'final')}>✅ Finals Only</button>
              <button className={`chip ${filters.mediaType === 'video' ? 'active' : ''}`} onClick={() => setFilter('mediaType', 'video')}>🎬 Video</button>
              <button className={`chip ${filters.mediaType === 'image' ? 'active' : ''}`} onClick={() => setFilter('mediaType', 'image')}>🖼 Photo</button>
            </div>
          </div>
          <div className="filter-section">
            {/* Search duplicate removed — now in header */}
          </div>
          <div className="filter-section">
            <div className="filter-label">Color Label</div>
            <div className="color-chip-row">
              {Object.entries(COLOR_CHIPS).map(([key, { bg, label }]) => (
                <button key={key} className={`color-chip ${filters.colorLabel === key ? 'active' : ''}`} style={{ background: bg }} title={label} onClick={() => setFilter('colorLabel', key)} />
              ))}
            </div>
          </div>
          <div className="filter-section">
            <div className="filter-label">Hand Zone</div>
            <div className="chip-row">
              {['Zone A', 'Zone B', 'Zone C'].map(z => (
                <button key={z} className={`chip ${filters.handZone === z ? 'active' : ''}`} onClick={() => setFilter('handZone', z)}>{z} {z === 'Zone A' ? '(DS5.5)' : z === 'Zone B' ? '(DS6.0)' : '(DS6.5)'}</button>
              ))}
            </div>
          </div>
          <div className="filter-section">
            <div className="filter-label">DS Model</div>
            <div className="chip-row">
              {['DS5.5', 'DS6.0', 'DS6.5'].map(m => (<button key={m} className={`chip ${filters.dsModel === m ? 'active' : ''}`} onClick={() => setFilter('dsModel', m)}>{m}</button>))}
            </div>
          </div>
          <div className="filter-section">
            <div className="filter-label">Subject</div>
            <div className="chip-row wrap">{SUBJECTS.map(s => (<button key={s} className={`chip ${filters.subject === s ? 'active' : ''}`} onClick={() => setFilter('subject', s)}>{s}</button>))}</div>
          </div>
          <div className="filter-section">
            <div className="filter-label">Purpose</div>
            <div className="chip-row wrap">{PURPOSES.map(p => (<button key={p} className={`chip ${filters.purpose === p ? 'active' : ''}`} onClick={() => setFilter('purpose', p)}>{p}</button>))}</div>
          </div>
          <div className="filter-section">
            <div className="filter-label">Campaign</div>
            <div className="chip-row wrap">{CAMPAIGNS.map(c => (<button key={c} className={`chip ${filters.campaign === c ? 'active' : ''}`} onClick={() => setFilter('campaign', c)}>{c}</button>))}</div>
          </div>
          <div className="filter-section">
            <div className="filter-label">Shot Type</div>
            <div className="chip-row wrap">{SHOT_TYPES.map(s => (<button key={s} className={`chip ${filters.shotType === s ? 'active' : ''}`} onClick={() => setFilter('shotType', s)}>{s}</button>))}</div>
          </div>
          <div className="filter-section">
            <div className="filter-label">Status</div>
            <div className="chip-row">{['final', 'raw', 'intermediate'].map(s => (<button key={s} className={`chip ${filters.finalStatus === s ? 'active' : ''}`} onClick={() => setFilter('finalStatus', s)}>{s}</button>))}</div>
          </div>
          <div className="filter-section">
            <div className="filter-label">Orientation</div>
            <div className="chip-row">{['landscape', 'portrait', 'square'].map(o => (<button key={o} className={`chip ${filters.orientation === o ? 'active' : ''}`} onClick={() => setFilter('orientation', o)}>{o}</button>))}</div>
          </div>
          {Object.values(filters).some(v => v) && (
            <button className="reset-btn" onClick={() => setFilters({ search: '', finalStatus: '', priority: '', subject: '', handZone: '', dsModel: '', purpose: '', campaign: '', shotType: '', colorLabel: '', mediaType: '', orientation: '' })}>✕ Clear All Filters</button>
          )}
        </aside>
        <div className="sidebar-resize-handle" onMouseDown={startSidebarDrag} title="Drag to resize" />
        <main className="main-content">
          <PromptBox />
          <div className="grid-header">
            <div className="grid-info">
              {loading ? 'Loading…' : `${total.toLocaleString()} assets`}
              {selected.size > 0 && <span className="selected-badge">{selected.size} selected</span>}
              <div className="zoom-slider-wrap">
                <span className="zoom-icon">🔍</span>
                <input type="range" className="zoom-slider" min="60" max="360" step="10" value={zoomLevel} onChange={e => setZoomLevel(Number(e.target.value))} title="Adjust thumbnail size" />
              </div>
            </div>
            <div className="grid-actions">
              <button className="story-builder-btn" onClick={() => setShowStoryBuilder(true)}>🎬 Build Story</button>
              <button className="reel-gen-btn" onClick={() => setShowReelGenerator(true)}>🎙 Reel Generator</button>
              {selected.size > 0 && (
                <>
                  <button className="btn-ghost" onClick={() => setSelected(new Set())}>Deselect All</button>
                  <button className="btn-ghost" onClick={() => setSelected(new Set(assets.map(a => a.id)))}>Select All ({assets.length})</button>
                </>
              )}
            </div>
          </div>

          <div className={`asset-grid ${zoomLevel < 120 ? 'dense' : ''}`} style={{ gridTemplateColumns: `repeat(auto-fill, minmax(max(${zoomLevel}px, 6.5%), 1fr))` }}>
            {assets.map(asset => {
              const isSelected = selected.has(asset.id);
              const thumb = thumbUrl(asset);
              const keywords = (() => { try { return JSON.parse(asset.aiKeywords) as string[]; } catch { return []; } })();
              return (
                <div key={asset.id} className={`asset-card ${isSelected ? 'selected' : ''} ${asset.priority === 'high' ? 'priority' : ''} ${asset.orientation === 'portrait' ? 'portrait' : ''}`} onClick={(e) => handleAssetClick(asset, e)} onDoubleClick={() => setDetail(asset)}>
                  <div className="asset-thumb-wrap" style={{ aspectRatio: asset.orientation === 'portrait' ? '9/16' : asset.orientation === 'square' ? '1/1' : '16/9' }}>
                    {thumb ? <img src={thumb} alt={asset.fileName} className="asset-thumb" loading="lazy" /> : <div className="asset-thumb-placeholder">{asset.mediaType === 'video' ? '🎬' : '🖼'}</div>}
                    {asset.mediaType === 'video' && (<div className="video-overlay"><span className="play-icon">▶</span>{asset.durationSeconds && <span className="duration-badge">{formatDuration(asset.durationSeconds)}</span>}</div>)}
                    {asset.finalStatus === 'final' && <div className="final-badge">FINAL</div>}
                    {asset.priority === 'high' && <div className="priority-dot" style={{ background: asset.colorLabel ? COLOR_CHIPS[asset.colorLabel]?.bg : '#ef4444' }} />}
                    {isSelected && <div className="selected-checkmark">✓</div>}
                  </div>
                  <div className="asset-info">
                    <div className="asset-name" title={asset.fileName}>{asset.fileName}</div>
                    <div className="asset-desc">{asset.aiDescription || '—'}</div>
                    <div className="asset-tags">
                      {asset.subject !== 'unknown' && <span className="tag">{asset.subject}</span>}
                      {asset.handZone && <span className="tag zone">{asset.handZone}</span>}
                      {asset.dsModel && <span className="tag ds">{asset.dsModel}</span>}
                      {asset.purpose !== 'unknown' && <span className="tag">{asset.purpose}</span>}
                      {keywords.slice(0, 2).map((k, i) => <span key={i} className="tag muted">{k}</span>)}
                    </div>
                  </div>
                </div>
              );
            })}
            {!loading && assets.length === 0 && (
              <div className="empty-state">
                <div className="empty-icon">🎹</div>
                <div className="empty-title">No assets found</div>
                <div className="empty-msg">{stats.total === 0 ? 'Run the ingestion script to index your DreamPlay assets:\npnpm ingest' : 'Try adjusting your filters'}</div>
              </div>
            )}
          </div>
        </main>
      </div>

      {selected.size > 0 && (
        <div className="export-tray">
          <div className="tray-info">
            <span className="tray-count">{selected.size} clips selected</span>
            {totalSelectedDuration > 0 && <span className="tray-duration">· {formatDuration(totalSelectedDuration)} total</span>}
          </div>
          <div className="tray-actions">
            <button className="btn-ghost tray-btn" onClick={() => { const sa = assets.filter(a => selected.has(a.id)); navigator.clipboard.writeText(sa.map(a => a.filePath).join('\n')); setCopyMsg('Copied!'); setTimeout(() => setCopyMsg(''), 2000); }}>{copyMsg || '📋 Copy Paths'}</button>
            <button className="btn-export fcp" onClick={() => handleExport('fcpxml')} disabled={exporting}>{exporting ? '…' : '🎬 Export FCPXML'}</button>
            <button className="btn-export davinci" onClick={() => handleExport('davinci')} disabled={exporting}>{exporting ? '…' : '🎨 Export DaVinci XML'}</button>
          </div>
        </div>
      )}

      {detail && (
        <div className="modal-overlay" onClick={() => setDetail(null)}>
          <div className="preview-panel" onClick={e => e.stopPropagation()}>

            {/* Left — large thumbnail */}
            <div className="preview-media">
              {detail.thumbPath
                ? <img src={thumbUrl(detail)} alt={detail.fileName} className="preview-thumb" />
                : <div className="preview-thumb-placeholder">{detail.mediaType === 'video' ? '🎬' : '🖼'}</div>
              }
              {detail.mediaType === 'video' && detail.durationSeconds && (
                <div className="preview-duration">{formatDuration(detail.durationSeconds)}</div>
              )}
              {detail.finalStatus === 'final' && <div className="preview-final-badge">FINAL</div>}
            </div>

            {/* Right — info */}
            <div className="preview-info">
              <div className="preview-header">
                <div className="preview-filename">{detail.fileName}</div>
                <button className="modal-close" onClick={() => setDetail(null)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
              </div>

              <div className="preview-desc">{detail.aiDescription || '—'}</div>

              <div className="preview-meta-grid">
                {[
                  ['Status', <span key="s" className={`status-badge ${detail.finalStatus}`}>{detail.finalStatus}</span>],
                  ['Priority', detail.priority],
                  ['Subject', detail.subject],
                  ['DS Model', detail.dsModel ?? '—'],
                  ['Shot Type', detail.shotType],
                  ['Orientation', detail.orientation ?? '—'],
                  ['Duration', formatDuration(detail.durationSeconds)],
                  ['Resolution', detail.width && detail.height ? `${detail.width}×${detail.height}` : '—'],
                  ['FPS', detail.fps?.toFixed(2) ?? '—'],
                  ['Codec', detail.codec ?? '—'],
                  ['File Size', formatBytes(detail.fileSize)],
                  ['Campaign', detail.campaign ?? '—'],
                  ['Mood', detail.mood || '—'],
                  ['Color Grade', detail.colorGrade || '—'],
                ].map(([label, val]) => (
                  <div key={String(label)} className="preview-meta-row">
                    <span className="preview-meta-label">{label}</span>
                    <span className="preview-meta-val">{val}</span>
                  </div>
                ))}
              </div>

              <div className="preview-keywords">
                {(() => { try { return JSON.parse(detail.aiKeywords) as string[]; } catch { return []; } })()
                  .map((k, i) => <span key={i} className="tag">{k}</span>)}
              </div>

              <div className="preview-path-row">
                <span className="preview-path">{detail.filePath}</span>
                <button className="preview-icon-btn" title="Copy path" onClick={() => { navigator.clipboard.writeText(detail.filePath); setCopyMsg('Copied!'); setTimeout(() => setCopyMsg(''), 1500); }}>
                  {copyMsg === 'Copied!'
                    ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><path d="M20 6L9 17l-5-5"/></svg>
                    : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                  }
                </button>
              </div>

              <div className="preview-actions">
                <button className="preview-reveal-btn" onClick={async () => {
                  await fetch('/api/reveal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: detail.filePath }) });
                }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                  Reveal in Finder
                </button>
                <button className="preview-select-btn" onClick={() => { setSelected(prev => { const n = new Set(prev); n.add(detail.id); return n; }); setDetail(null); }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><polyline points="20 6 9 17 4 12"/></svg>
                  Add to Selection
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showStoryBuilder && <StoryBuilder onClose={() => setShowStoryBuilder(false)} />}
      {showReelGenerator && <ReelGenerator onClose={() => setShowReelGenerator(false)} />}
    </div>
  );
}
