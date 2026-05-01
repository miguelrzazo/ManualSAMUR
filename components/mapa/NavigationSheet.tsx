"use client";

import { X, Navigation, Building2, MapPin } from "lucide-react";

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

type MarkerItem = { kind: "hospital"; data: Hospital } | { kind: "base"; data: Base };

interface Props {
  item: MarkerItem;
  onClose: () => void;
}

export function NavigationSheet({ item, onClose }: Props) {
  const isHospital = item.kind === "hospital";
  const name = isHospital
    ? item.data.name
    : `Base ${(item.data as Base).number} — ${item.data.name}`;
  const address = item.data.address;
  const lat = item.data.lat;
  const lng = item.data.lng;

  const navUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 w-[calc(100%-2rem)] max-w-sm bg-background rounded-2xl border border-border/60 shadow-xl p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-start gap-2.5 flex-1 min-w-0">
          {isHospital ? (
            <div className="h-8 w-8 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Building2 className="h-4 w-4 text-red-600 dark:text-red-400" />
            </div>
          ) : (
            <div className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0 mt-0.5">
              <MapPin className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </div>
          )}
          <div className="min-w-0">
            <p className="font-semibold text-sm leading-snug">{name}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{address}</p>
            {isHospital && (item.data as Hospital).status4 && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 font-medium">
                Status 4 + {(item.data as Hospital).status4}
              </p>
            )}
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors flex-shrink-0"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <a
        href={navUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
      >
        <Navigation className="h-4 w-4" />
        Navegar
      </a>
    </div>
  );
}
