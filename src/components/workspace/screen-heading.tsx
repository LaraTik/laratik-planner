export function ScreenHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-label text-fg-muted">{eyebrow}</p>
        <h1 className="text-title-page text-fg-primary font-semibold">{title}</h1>
        <p className="text-body text-fg-secondary mt-1">{description}</p>
      </div>
      {action}
    </header>
  );
}
