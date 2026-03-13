import { useEffect, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { formatNaira } from '@/lib/format';
import { MapPin } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

const MapView = () => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  const { data: officers = [] } = useQuery({
    queryKey: ['map-officers'],
    queryFn: async () => {
      const { data, error } = await supabase.from('loan_officers').select('*');
      if (error) throw error;

      const enriched = await Promise.all(
        (data || []).filter(o => o.latitude && o.longitude).map(async (o) => {
          const { data: loans } = await supabase.from('loans').select('amount, outstanding_balance, status').eq('officer_id', o.id);
          const totalDisbursed = (loans || []).reduce((s, l) => s + Number(l.amount), 0);
          const totalOutstanding = (loans || []).reduce((s, l) => s + Number(l.outstanding_balance), 0);
          const activeLoans = (loans || []).filter(l => l.status === 'approved').length;
          return { ...o, totalDisbursed, totalOutstanding, activeLoans, loanCount: (loans || []).length };
        })
      );
      return enriched;
    },
  });

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;
    const map = L.map(mapRef.current).setView([9.082, 8.6753], 6);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
    }).addTo(map);
    mapInstanceRef.current = map;
    return () => { map.remove(); mapInstanceRef.current = null; };
  }, []);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || officers.length === 0) return;
    map.eachLayer(layer => { if (layer instanceof L.Marker) map.removeLayer(layer); });
    const bounds: L.LatLngTuple[] = [];

    officers.forEach((o: any) => {
      const latlng: L.LatLngTuple = [o.latitude, o.longitude];
      bounds.push(latlng);
      const riskColor = o.totalOutstanding > o.totalDisbursed * 0.5 ? '#ef4444' : '#22c55e';
      const icon = L.divIcon({
        className: 'custom-marker',
        html: `<div style="background:${riskColor};width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-weight:bold;font-size:12px;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);">${o.name.split(' ').map((n: string) => n[0]).join('')}</div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });

      L.marker(latlng, { icon })
        .addTo(map)
        .bindPopup(`
          <div style="min-width:200px;">
            <h3 style="margin:0 0 4px;font-weight:bold;">${o.name}</h3>
            <p style="margin:0 0 2px;color:#666;font-size:12px;">${o.branch}</p>
            ${o.phone ? `<p style="margin:0 0 8px;color:#666;font-size:12px;">📞 ${o.phone}</p>` : ''}
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:12px;">
              <div><strong>Disbursed:</strong><br/>${formatNaira(o.totalDisbursed)}</div>
              <div><strong>Outstanding:</strong><br/>${formatNaira(o.totalOutstanding)}</div>
              <div><strong>Active Loans:</strong><br/>${o.activeLoans}</div>
              <div><strong>Total Loans:</strong><br/>${o.loanCount}</div>
            </div>
          </div>
        `);
    });

    if (bounds.length > 0) map.fitBounds(bounds, { padding: [50, 50] });
  }, [officers]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Officer Map</h1>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <MapPin className="w-4 h-4" /> {officers.length} officers with locations
        </div>
      </div>
      <Card>
        <CardContent className="p-0">
          <div ref={mapRef} className="w-full h-[600px] rounded-lg" />
        </CardContent>
      </Card>
      {officers.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            No officers with location data. Add latitude/longitude when creating officers to see them on the map.
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default MapView;
