export function StatusMessage({
  error,
  success,
}: {
  error?: string | null;
  success?: string | null;
}) {
  if (!error && !success) {
    return null;
  }

  return (
    <div className={error ? "status error" : "status success"}>
      {error || success}
    </div>
  );
}
