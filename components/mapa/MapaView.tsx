"use client";

import { useState } from "react";
import { Map, MapMarker, MarkerContent, MapControls } from "@/components/ui/map";
import { Status4Cheatsheet } from "@/components/mapa/Status4Cheatsheet";
import { NavigationSheet } from "@/components/mapa/NavigationSheet";
import { cn } from "@/lib/utils";
import { Building2, MapPin, ChevronRight, Lock } from "lucide-react";

interface Hospital {
  id: string;
  code: number | null;
  name: string;
  shortName: string;
  address: string;
  district: string;
  lat: number;
  lng: number;
  type: string;
  status4: number | null;
  emergency: boolean;
}

interface Base {
  id: string;
  number: number;
  name: string;
  district: string;
  address: string;
  lat: number;
  lng: number;
}

interface Status4Entry {
  status: number;
  hospitalId: string | null;
  hospitalName: string | null;
  description: string;
}

interface Props {
  hospitals: Hospital[];
  bases: Base[];
  status4: Status4Entry[];
}

type MarkerType = { kind: "hospital"; data: Hospital } | { kind: "base"; data: Base };

const MADRID_BOUNDS: [[number, number], [number, number]] = [
  [-4.15, 40.25],
  [-3.45, 40.68],
];

export function MapaView({ hospitals, bases, status4 }: Props) {
  const [showBases, setShowBases] = useState(true);
  const [showHospitals, setShowHospitals] = useState(true);
  const [showPrivate, setShowPrivate] = useState(false);
  const [selected, setSelected] = useState<MarkerType | null>(null);
  const [showStatus4, setShowStatus4] = useState(false);

  const publicHospitals = hospitals.filter((h) => h.type === "public");
  const privateHospitals = hospitals.filter((h) => h.type === "private");

  return (
    <div className="map-route-shell relative flex">
      <div className="relative min-h-0 flex-1">
        <Map
          center={[-3.703, 40.416]}
          zoom={11}
          minZoom={9.8}
          maxBounds={MADRID_BOUNDS}
          className="h-full w-full"
        >
          <MapControls position="bottom-right" showZoom showLocate />

          {/* Public hospital markers */}
          {showHospitals && publicHospitals.map((h) => (
            <MapMarker
              key={h.id}
              longitude={h.lng}
              latitude={h.lat}
              onClick={() => setSelected({ kind: "hospital", data: h })}
            >
              <MarkerContent>
                <div className="relative cursor-pointer group">
                  <div className="flex flex-col items-center">
                    <div
                      className={cn(
                        "h-8 w-8 rounded-lg border-2 border-white shadow-lg flex items-center justify-center",
                        "bg-red-500 hover:scale-110 transition-transform"
                      )}
                      style={{ boxShadow: "0 2px 8px rgba(239,68,68,0.5)" }}
                    >
                      <span className="text-[11px] font-bold text-white leading-none">
                        {h.code ?? "H"}
                      </span>
                    </div>
                    <span className="text-[9px] font-bold text-white bg-red-600/80 backdrop-blur-sm px-1 py-0.5 rounded mt-0.5 whitespace-nowrap shadow">
                      {h.shortName.length > 12 ? h.shortName.slice(0, 11) + "…" : h.shortName}
                    </span>
                  </div>
                </div>
              </MarkerContent>
            </MapMarker>
          ))}

          {/* Private hospital markers */}
          {showPrivate && privateHospitals.map((h) => (
            <MapMarker
              key={h.id}
              longitude={h.lng}
              latitude={h.lat}
              onClick={() => setSelected({ kind: "hospital", data: h })}
            >
              <MarkerContent>
                <div className="relative cursor-pointer group">
                  <div className="flex flex-col items-center">
                    <div
                      className="h-7 w-7 rounded-lg border-2 border-white shadow-lg flex items-center justify-center bg-emerald-600 hover:scale-110 transition-transform"
                      style={{ boxShadow: "0 2px 8px rgba(5,150,105,0.5)" }}
                    >
                      <Lock className="h-3 w-3 text-white" />
                    </div>
                    <span className="text-[9px] font-bold text-white bg-emerald-700/80 backdrop-blur-sm px-1 py-0.5 rounded mt-0.5 whitespace-nowrap shadow">
                      {h.shortName.length > 12 ? h.shortName.slice(0, 11) + "…" : h.shortName}
                    </span>
                  </div>
                </div>
              </MarkerContent>
            </MapMarker>
          ))}

          {/* Base markers */}
          {showBases && bases.map((b) => (
            <MapMarker
              key={b.id}
              longitude={b.lng}
              latitude={b.lat}
              onClick={() => setSelected({ kind: "base", data: b })}
            >
              <MarkerContent>
                <div className="relative cursor-pointer">
                  <div className="flex flex-col items-center">
                    <div
                      className="h-7 w-7 rounded-full border-2 border-white shadow-lg flex items-center justify-center bg-blue-500 hover:scale-110 transition-transform"
                      style={{ boxShadow: "0 2px 8px rgba(59,130,246,0.55)" }}
                    >
                      <span className="text-[10px] font-bold text-white leading-none tabular-nums">
                        {b.number}
                      </span>
                    </div>
                  </div>
                </div>
              </MarkerContent>
            </MapMarker>
          ))}
        </Map>

        {/* Layer toggles */}
        <div className="absolute top-3 left-3 flex flex-col gap-1.5 z-10">
          {[
            {
              active: showHospitals,
              toggle: () => setShowHospitals((v) => !v),
              icon: Building2,
              label: `Hospitales (${publicHospitals.length})`,
              activeClass: "bg-red-500 text-white border-red-600",
            },
            {
              active: showPrivate,
              toggle: () => setShowPrivate((v) => !v),
              icon: Lock,
              label: `Privados (${privateHospitals.length})`,
              activeClass: "bg-emerald-600 text-white border-emerald-700",
            },
            {
              active: showBases,
              toggle: () => setShowBases((v) => !v),
              icon: MapPin,
              label: `Bases (${bases.length})`,
              activeClass: "bg-blue-500 text-white border-blue-600",
            },
            {
              active: showStatus4,
              toggle: () => setShowStatus4((v) => !v),
              icon: ChevronRight,
              label: "Status 4",
              activeClass: "bg-amber-500 text-white border-amber-600",
            },
          ].map(({ active, toggle, icon: Icon, label, activeClass }) => (
            <button
              key={label}
              onClick={toggle}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold shadow-md border transition-colors backdrop-blur-sm",
                active
                  ? activeClass
                  : "bg-background/95 text-muted-foreground border-border/60 hover:bg-muted"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* Navigation sheet */}
        {selected && (
          <NavigationSheet item={selected} onClose={() => setSelected(null)} />
        )}
      </div>

      {/* Status 4 sidebar — desktop */}
      {showStatus4 && (
        <div className="hidden md:block w-72 border-l border-border/60 bg-background overflow-auto">
          <Status4Cheatsheet
            status4={status4}
            hospitals={hospitals}
            onSelectHospital={(h) => setSelected({ kind: "hospital", data: h })}
          />
        </div>
      )}

      {/* Status 4 — mobile */}
      {showStatus4 && (
        <div className="md:hidden fixed inset-x-0 bottom-16 z-30 bg-background border-t border-border/60 max-h-[50vh] overflow-auto rounded-t-2xl">
          <Status4Cheatsheet
            status4={status4}
            hospitals={hospitals}
            onSelectHospital={(h) => setSelected({ kind: "hospital", data: h })}
          />
        </div>
      )}
    </div>
  );
}
