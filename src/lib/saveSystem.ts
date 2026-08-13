/**
 * System zapisu/wczytu gry. Główny storage to localStorage, z opcjonalnym
 * cloud backup do Supabase (world_snapshots).
 */
import { GameState, Building, ConveyorState, Research, NPC } from '../game/types';
import { supabase } from './supabase';
import { AuthService } from '../services/auth/AuthService';

/** Struktura danych zapisu gry (wersja, timestamp, stan gracza, budynki, badania, NPC). */
export interface SaveData {
  version: number;
  timestamp: number;
  username: string;
  tick: number;
  player: GameState['player'];
  pollution: number;
  totalPollutionGenerated: number;
  worldSeed: number;
  evolution: number;
  dayTime: number;
  weather: GameState['weather'];
  statistics: GameState['statistics'];
  buildings: [string, Building][];
  conveyors: [string, ConveyorState[]][];
  research: [string, Research][];
  npcs: [string, NPC][];
  buildQueue: GameState['buildQueue'];
}

function getSaveKey(username: string): string {
  return `novactorio_save_${username.toLowerCase()}`;
}

/** Zapisuje stan gry do localStorage + cloud backup do Supabase (fire-and-forget). */
export function saveGame(username: string, state: GameState): void {
  const data: SaveData = {
    version: 2,
    timestamp: Date.now(),
    username,
    tick: state.tick,
    player: { ...state.player },
    pollution: state.pollution,
    totalPollutionGenerated: state.totalPollutionGenerated,
    worldSeed: state.worldSeed,
    evolution: state.evolution,
    dayTime: state.dayTime,
    weather: state.weather,
    statistics: { ...state.statistics },
    buildings: Array.from(state.buildings.entries()),
    conveyors: Array.from(state.conveyors.entries()),
    research: Array.from(state.research.entries()).map(([k, v]) => [k, { ...v }]),
    npcs: Array.from(state.npcs.entries()),
    buildQueue: [],  // intentionally not persisted — NPC orders reset on logout
  };
  localStorage.setItem(getSaveKey(username), JSON.stringify(data));

  // Push full save + world snapshot to Supabase (fire and forget — cloud backup)
  const uid = AuthService.getCurrentUserId();
  if (uid) {
    const worldData = JSON.stringify({
      v: 1,
      seed: state.worldSeed,
      buildings: Array.from(state.buildings.entries()),
    });
    supabase.from('world_snapshots').upsert({
      user_id: uid,
      username,
      tick: state.tick,
      building_count: state.buildings.size,
      world_data: worldData,
      save_data: JSON.stringify(data),
      updated_at: new Date().toISOString(),
    }).then(({ error }) => {
      if (error) console.warn('[Save] Cloud backup failed:', error.message);
    });
  }
}

/** Wczytuje zapis gry z localStorage. Zwraca null jeśli brak danych. */
export function loadGame(username: string): SaveData | null {
  const raw = localStorage.getItem(getSaveKey(username));
  if (!raw) return null;
  try { return JSON.parse(raw) as SaveData; } catch { return null; }
}

/** Usuwa zapis gry z localStorage. */
export function deleteSave(username: string): void {
  localStorage.removeItem(getSaveKey(username));
}

/** Sprawdza czy istnieje zapis w localStorage dla danego username. */
export function hasSave(username: string): boolean {
  return !!localStorage.getItem(getSaveKey(username));
}

/** Try to restore save from Supabase cloud backup into localStorage, returns true if found */
export async function restoreFromCloud(uid: string, username: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('world_snapshots')
      .select('save_data')
      .eq('user_id', uid)
      .single();
    if (error || !data?.save_data) return false;
    localStorage.setItem(getSaveKey(username), data.save_data);
    return true;
  } catch {
    return false;
  }
}

/** Zwraca podstawowe info o zapisie (timestamp, tick) bez pełnego deserializowania stanu. */
export function getSaveInfo(username: string): { timestamp: number; tick: number } | null {
  const save = loadGame(username);
  if (!save) return null;
  return { timestamp: save.timestamp, tick: save.tick };
}
