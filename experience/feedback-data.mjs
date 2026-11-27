// Shared public form/receiver contract. JSON keys and route patterns are explicit.
export const kinds = new Set(['suggestion', 'correction', 'usability', 'vehicle', 'feature']);
const sections = '(?:vehicles|experiments|experience|tools|articles|plan|about|build|grip|weight-distribution-calculator)';
const validPath = new RegExp('^/(?:' + sections + '/(?:[a-z0-9-]{1,135}/)?)?$');
export function contextPath(path) {
  return typeof path === 'string' && validPath.test(path) && !path.includes('/sx-') && !path.includes('/archive-review/') ? path : '';
}
export function validateFeedback(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data) ||
      Object.keys(data).some(key => !['kind','note','page','website'].includes(key))) return null;
  if (data.website !== '' || !kinds.has(data.kind) || typeof data.note !== 'string') return null;
  const note = data.note.trim();
  if (note.length < 10 || note.length > 1200 || /#v(?:1|2)\//i.test(note)) return null;
  if (data.page !== undefined && !contextPath(data.page)) return null;
  return {kind:data.kind, note, ...(data.page ? {page:data.page} : {})};
}
