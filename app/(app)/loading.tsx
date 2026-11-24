export default function Cargando() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Cargando">
      <div className="h-8 w-32 animate-pulse rounded-lg bg-slate-200" />
      {[1, 2, 3].map((n) => (
        <div key={n} className="h-28 animate-pulse rounded-2xl bg-slate-200" />
      ))}
    </div>
  );
}
