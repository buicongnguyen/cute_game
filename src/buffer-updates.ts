import type { BufferAttribute } from 'three';

/** One bounded component range, including writes still pending because the mesh was not rendered. */
export function queueAttributeRange(attribute: BufferAttribute, start: number, count: number) {
  if (count <= 0) return;
  let end = start + count;
  for (const range of attribute.updateRanges) { start = Math.min(start, range.start); end = Math.max(end, range.start + range.count); }
  attribute.clearUpdateRanges();
  attribute.addUpdateRange(start, end - start);
  attribute.needsUpdate = true;
}
