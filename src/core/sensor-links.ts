import type { ForceSensor, Link } from '../types';

export function remapSensorLinks(sensors: Record<string, ForceSensor>, previous: Record<string, Link>, next: Record<string, Link>): Record<string, ForceSensor> {
  return Object.fromEntries(Object.entries(sensors).flatMap(([id, sensor]) => {
    const old = previous[sensor.linkId]; if (!old) return [];
    const samePair = (link: Link) => link.jointIds.includes(old.jointIds[0]) && link.jointIds.includes(old.jointIds[1]);
    const link = next[sensor.linkId] && samePair(next[sensor.linkId]) ? next[sensor.linkId] : Object.values(next).find(samePair);
    return link ? [[id, { ...sensor, linkId: link.id }]] : [];
  }));
}
