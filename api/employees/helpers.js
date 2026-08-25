import { supabase } from '../../lib/db-client.js';

export async function recordExists(table, filters = [], excludeId = null) {
  let query = supabase.from(table).select('id').limit(1);

  filters.forEach(([column, value, operator = 'eq']) => {
    if (operator === 'ilike') query = query.ilike(column, value);
    else query = query.eq(column, value);
  });

  if (excludeId) query = query.neq('id', Number(excludeId));

  const { data, error } = await query.maybeSingle();

  if (error) throw error;

  return Boolean(data);
}

export async function countRows(table, buildQuery) {
  let query = supabase.from(table).select('id', { count: 'exact', head: true });
  if (buildQuery) query = buildQuery(query);
  const { count, error } = await query;
  if (error) return 0;
  return count || 0;
}

export async function sumRows(table, column, buildQuery) {
  let query = supabase.from(table).select(column);
  if (buildQuery) query = buildQuery(query);
  const { data, error } = await query;
  if (error) return 0;
  return (data || []).reduce((sum, row) => sum + Number(row[column] || 0), 0);
}

export function cleanString(value) {
  return String(value ?? '').trim();
}

export function nullableTimestamp(value) {
  if (value === null || value === undefined || value === '') return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export function nullableNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}