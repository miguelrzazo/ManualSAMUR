export default function CodigosLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-[calc(100svh-3rem)] md:h-[calc(100svh-3.5rem)]">
      {children}
    </div>
  );
}
