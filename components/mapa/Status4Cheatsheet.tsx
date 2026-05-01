import { ArrowRight } from "lucide-react";

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

interface Status4Entry {
  status: number;
  hospitalId: string | null;
  hospitalName: string | null;
  description: string;
}

interface Props {
  status4: Status4Entry[];
  hospitals: Hospital[];
  onSelectHospital?: (h: Hospital) => void;
}

export function Status4Cheatsheet({ status4, hospitals, onSelectHospital }: Props) {
  return (
    <div className="p-4">
      <div className="mb-4">
        <h2 className="font-semibold text-sm">Cheat Sheet Status 4</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Tras enviar Status 4, el siguiente status determina el hospital de destino automático.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        {status4.map((entry) => {
          const hospital = entry.hospitalId
            ? hospitals.find((h) => h.id === entry.hospitalId)
            : null;

          return (
            <div
              key={entry.status}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <span className="text-xs font-mono bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 px-1.5 py-0.5 rounded">
                  4
                </span>
                <span className="text-xs text-muted-foreground">+</span>
                <span className="text-xs font-mono bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 px-1.5 py-0.5 rounded">
                  {entry.status}
                </span>
              </div>

              <ArrowRight className="h-3 w-3 text-muted-foreground/40 flex-shrink-0" />

              {hospital ? (
                <button
                  onClick={() => onSelectHospital?.(hospital)}
                  className="flex-1 text-left text-sm font-medium hover:text-primary transition-colors"
                >
                  {hospital.shortName}
                  <span className="block text-xs text-muted-foreground font-normal">
                    {entry.hospitalId} — {hospital.district}
                  </span>
                </button>
              ) : (
                <div className="flex-1">
                  <span className="text-sm text-muted-foreground">No operativo</span>
                  <span className="block text-xs text-muted-foreground/60">Solo pasa clave cuatro</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
