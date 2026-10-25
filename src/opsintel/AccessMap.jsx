import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Mapa interativo dos acessos. Cada ponto é o CENTRO DA CIDADE informado pelo IP (aproximado), com um círculo de margem de
// erro de 25 km. Nunca representa coordenada exata. Pontos com alerta ficam em vermelho.
export function AccessMap({ points, onPick }) {
  const el = useRef(null);
  const state = useRef({ map: null, layer: null });

  useEffect(() => {
    const map = L.map(el.current, { zoomControl: true, scrollWheelZoom: false, worldCopyJump: true, minZoom: 2 }).setView([-15, -52], 4);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 12, attribution: '© OpenStreetMap' }).addTo(map);
    state.current = { map, layer: L.layerGroup().addTo(map) };
    const click = () => map.scrollWheelZoom.enable();
    map.once('focus', click); map.on('click', click);
    return () => { map.remove(); state.current = { map: null, layer: null }; };
  }, []);

  useEffect(() => {
    const { map, layer } = state.current;
    if (!map) return;
    layer.clearLayers();
    const bounds = [];
    for (const p of points) {
      const color = p.flagged ? '#e2574c' : '#F5C400';
      L.circle([p.lat, p.lng], { radius: 25000, color, weight: 1, opacity: 0.5, fillColor: color, fillOpacity: 0.08, interactive: false }).addTo(layer);
      const r = Math.min(26, 8 + Math.sqrt(p.count) * 2.4);
      const dot = L.circleMarker([p.lat, p.lng], { radius: r, color: '#0B0E1A', weight: 2, fillColor: color, fillOpacity: 0.85 }).addTo(layer);
      const place = [p.city, p.region, p.country].filter(Boolean).join(', ') || 'Local não identificado';
      const who = p.users.slice(0, 5).map((u) => `${u.name || 'Usuário'} (${u.count})`).join(', ');
      const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
      dot.bindTooltip(`<strong>${esc(place)}</strong><br>${p.count} acesso(s) · ${esc(who)}<br><small>Aproximado pelo IP${p.flagged ? ' · tem alerta' : ''}</small>`, { direction: 'top' });
      dot.on('click', () => onPick && onPick(p));
      bounds.push([p.lat, p.lng]);
    }
    if (bounds.length === 1) map.setView(bounds[0], 7);
    else if (bounds.length > 1) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 8 });
  }, [points, onPick]);

  return <div ref={el} className="oi-map" role="img" aria-label="Mapa de acessos, localização aproximada pelo IP" />;
}
