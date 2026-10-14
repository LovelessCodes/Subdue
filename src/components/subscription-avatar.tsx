export function SubscriptionAvatar({
  name,
  logo,
}: {
  name: string
  logo: string | null
}) {
  if (logo) {
    return (
      <img
        src={`/api/logos/${logo}`}
        alt=""
        className="size-8 shrink-0 rounded-full border object-cover"
      />
    )
  }

  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium uppercase">
      {name.trim().slice(0, 1)}
    </span>
  )
}
